// ------------------------------------------------------------------
// services/membership.js — the single source of truth for CLASS-SECTION
// membership (School -> Class -> Section).
// ------------------------------------------------------------------
// Rules this service exists to enforce (launch requirements):
//
//   1. OPENING IS NOT JOINING. Nothing in here ever calls the join
//      endpoint implicitly — only Membership.join(), which is only ever
//      wired to an explicit Join button.
//   2. Membership is read from the backend (ClassesApi.me), never
//      inferred from a school role, and never cached across a join or
//      leave. The backend stays the real authority: every member-only
//      list (subjects, chapters, notes, note files) is membership-checked
//      server-side, so a user cannot unlock content by poking at the UI.
//   3. Join is UNIVERSAL: eligibility is decided by the backend, not by
//      the viewer's role. The UI never hides Join behind a role check.
//   4. Duplicate joins are impossible: one in-flight request per
//      class-section, plus the button disables itself while busy.
//
// The tiny TTL cache only prevents the same screen from asking twice
// during one render pass; it is invalidated the moment membership
// changes, so the UI can never show a stale membership state.
// ------------------------------------------------------------------

const Membership = {
    _cache: new Map(),      // key -> { at, value }
    _inflight: new Map(),   // key -> Promise (join/leave lock)
    _TTL_MS: 5000,

    _key(schoolId, className, section) {
        return `${schoolId}::${className}::${section}`;
    },

    /**
     * Current membership for a class-section.
     * -> { class_id, is_member, role, school_role, member_count } | null
     * Returns null only when the state genuinely could not be read; callers
     * treat null as "not a member" (fail closed, never fail open).
     */
    async state(schoolId, className, section, { force = false } = {}) {
        const key = this._key(schoolId, className, section);
        const hit = this._cache.get(key);
        if (!force && hit && Date.now() - hit.at < this._TTL_MS) return hit.value;

        let value = null;
        try {
            value = await ClassesApi.me(schoolId, className, section);
        } catch {
            value = null;
        }
        this._cache.set(key, { at: Date.now(), value });
        return value;
    },

    invalidate(schoolId, className, section) {
        this._cache.delete(this._key(schoolId, className, section));
    },

    invalidateAll() {
        this._cache.clear();
    },

    isMember(state) {
        return !!(state && state.is_member);
    },

    /** Explicit join. Resolves to the refreshed membership state. */
    join(schoolId, className, section) {
        const key = this._key(schoolId, className, section);
        if (this._inflight.has(key)) return this._inflight.get(key);

        const run = (async () => {
            try {
                await ClassesApi.join(schoolId, className, section);
            } catch (err) {
                // 409 = already a member. That is a success from the user's
                // point of view (and the only sane way to survive a double
                // tap that slipped past the button lock), so fall through to
                // the state refresh instead of surfacing an error.
                if (err?.status !== 409) throw err;
            }
            this.invalidate(schoolId, className, section);
            return this.state(schoolId, className, section, { force: true });
        })();

        this._inflight.set(key, run);
        run.finally(() => this._inflight.delete(key));
        return run;
    },

    /** Explicit leave. Resolves to the refreshed membership state. */
    leave(schoolId, className, section) {
        const key = this._key(schoolId, className, section);
        if (this._inflight.has(key)) return this._inflight.get(key);

        const run = (async () => {
            await ClassesApi.leave(schoolId, className, section);
            this.invalidate(schoolId, className, section);
            return this.state(schoolId, className, section, { force: true });
        })();

        this._inflight.set(key, run);
        run.finally(() => this._inflight.delete(key));
        return run;
    },

    /**
     * The Join / Leave button. Not role-gated — see rule 3 above.
     *
     * ctx: { schoolId, className, section }
     * state: result of Membership.state()
     * onChanged(newState): called after a successful join/leave so the
     *                      screen can repaint with real data.
     */
    button(ctx, state, onChanged, { block = false } = {}) {
        const member = this.isMember(state);
        const btn = h("button", {
            className: `btn ${member ? "btn-outline-danger" : "btn-primary"}${block ? " btn-block" : " btn-sm"} join-btn`,
            type: "button",
        }, member ? "Leave" : "Join");

        let busy = false;
        const setBusy = (on, label) => {
            busy = on;
            btn.disabled = on;
            btn.classList.toggle("is-busy", on);
            btn.textContent = on ? label : (this.isMember(state) ? "Leave" : "Join");
        };

        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (busy) return;

            if (member) {
                // Leaving is destructive (loses notes access), so it keeps
                // the app's one confirmation dialog.
                confirmAction({
                    title: `Leave ${ctx.className} ${ctx.section}?`,
                    message: "You'll lose access to this section's subjects and notes until you join again.",
                    confirmLabel: "Leave",
                    onConfirm: async () => {
                        const next = await Membership.leave(ctx.schoolId, ctx.className, ctx.section);
                        Toast.success(`Left ${ctx.className} ${ctx.section}`);
                        onChanged?.(next);
                    },
                });
                return;
            }

            setBusy(true, "Joining...");
            try {
                const next = await Membership.join(ctx.schoolId, ctx.className, ctx.section);
                if (!Membership.isMember(next)) {
                    // No fake success states: if the backend didn't actually
                    // record the membership, say so and stay on Join.
                    Toast.error("We couldn't confirm that you joined. Please try again.");
                    setBusy(false);
                    return;
                }
                Toast.success(`Joined ${ctx.className} ${ctx.section}`);
                onChanged?.(next);
            } catch (err) {
                Toast.fromApiError(err);
                setBusy(false);
            }
        });

        return btn;
    },

    /**
     * The "you're not a member yet" surface. Deliberately shows only basic,
     * non-member-safe information plus the Join action — no subjects, no
     * chapters, no notes, and no request for any of them.
     */
    lockedView(ctx, state, onChanged, { title, subtitle } = {}) {
        return h("div", { className: "locked-card" }, [
            h("span", { className: "material-symbols-rounded locked-icon" }, "lock"),
            h("h3", {}, title || "Join to see notes"),
            h("p", {}, subtitle || `Notes, subjects and other member resources in ${ctx.className} ${ctx.section} are only available to members of this section.`),
            h("p", { className: "locked-note" }, "Opening a section doesn't join it — tap Join when you're ready."),
            this.button(ctx, state, onChanged, { block: true }),
        ]);
    },
};

window.Membership = Membership;
