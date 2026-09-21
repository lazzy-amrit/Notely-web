// ------------------------------------------------------------------
// pages/home/home.js — dashboard
// ------------------------------------------------------------------

const HomePage = {
    async render(container) {
        const user = await Session.getUser();

        const topBar = h("div", { className: "app-header dashboard-header" }, [
            h("h1", {}, "Notely"),
            h("button", {
                className: "notification-btn",
                "aria-label": "Notifications",
                onClick: () => NotificationService.openCenter(),
            }, [
                h("span", { className: "material-symbols-rounded" }, "notifications"),
                h("span", { className: "notification-badge hidden", "data-notification-badge": "true" }, "0"),
            ]),
        ]);

        const header = h("div", { className: "greeting" }, [
            h("h1", {}, `Hi, ${(user?.name || user?.username || "there").split(" ")[0]} 👋`),
            h("p", {}, "Here's what's happening in Notely."),
        ]);

        const quickActions = h("div", { className: "quick-actions-wrap" }, [
            h("div", { className: "quick-actions" }, [
                this._quickAction("groups", "New group", () => Router.go("messages")),
                this._quickAction("school", "Join school", () => Router.go("schools")),
                this._quickAction("menu_book", "Notes", () => Router.go("notes")),
                this._quickAction("person", "Profile", () => Router.go("profile")),
            ]),
        ]);

        const body = h("div", { id: "home-body" });
        mount(container, topBar, header, quickActions, body);
        NotificationService.syncBadge();

        // Stale-while-revalidate for the whole dashboard:
        //  1. paint instantly from the last snapshot we saved on this device
        //     (survives cache invalidation after mutations, unlike the
        //     per-request cache), so nothing waits on the network;
        //  2. fire all five requests independently — each one updates just
        //     its own part of the screen the moment it lands;
        //  3. also listen for background cache refreshes, so data that was
        //     served stale gets swapped in when the fresh copy arrives.
        const snap = this._loadSnapshot();
        const state = {
            schools: snap?.schools ?? null,
            groups: snap?.groups ?? null,
            invites: snap?.invites ?? null,
            dmRequests: snap?.dmRequests ?? null,
            dms: snap?.dms ?? null,
            recent: snap?.recent || {},
        };
        const alive = () => body.isConnected;
        const persist = () => this._saveSnapshot(state);

        let raf = 0;
        let upgradeSig = "";
        const schedule = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                if (!alive()) return;
                this._paint(body, state, persist);
                const sig = (state.groups || []).slice(0, 8).map(g => g.id).join(",");
                if (sig !== upgradeSig) {
                    upgradeSig = sig;
                    this._upgradeRecent(state, alive, () => { persist(); schedule(); });
                }
            });
        };

        const sources = {
            schools:    { path: "/school/dashboard",   load: () => SchoolsApi.dashboard() },
            groups:     { path: "/chats/groups",       load: () => GroupsApi.list() },
            invites:    { path: "/chat/invites",       load: () => GroupsApi.invites() },
            dmRequests: { path: "/chat/dm-requests",   load: () => MessagesApi.getPendingDmRequests() },
            dms:        { path: "/chat/dms",           load: () => MessagesApi.listDirectThreads() },
        };

        const apply = (key, value) => {
            const next = Array.isArray(value) ? value : [];
            if (state[key] !== null && JSON.stringify(state[key]) === JSON.stringify(next)) return;
            state[key] = next;
            if (key === "groups") next.forEach(g => EntityCache.rememberGroup(g));
            if (key === "dms") next.forEach(u => EntityCache.rememberUser(u));
            persist();
            schedule();
        };

        if (state.groups) state.groups.forEach(g => EntityCache.rememberGroup(g));
        if (state.dms) state.dms.forEach(u => EntityCache.rememberUser(u));

        const onCache = (event) => {
            if (!alive()) { window.removeEventListener(CACHE_EVENT, onCache); return; }
            const path = event.detail?.path;
            const key = Object.keys(sources).find(k => sources[k].path === path);
            if (key && event.detail.data) apply(key, event.detail.data);
        };
        window.addEventListener(CACHE_EVENT, onCache);

        schedule();

        Object.entries(sources).forEach(([key, src]) => {
            src.load()
                .then(value => apply(key, value))
                .catch(() => {
                    // Keep whatever we already showed; only stop the
                    // skeleton if there was nothing to show at all.
                    if (state[key] === null) { state[key] = []; schedule(); }
                });
        });
    },

    // ---- Dashboard snapshot (last good data, shown instantly next visit) ----
    _snapKey() {
        return `${APP_CACHE_VERSION}:home_snapshot:${CacheService._userScope()}`;
    },

    _loadSnapshot() {
        try {
            const raw = localStorage.getItem(this._snapKey());
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    },

    _saveSnapshot(state) {
        try {
            localStorage.setItem(this._snapKey(), JSON.stringify({
                schools: state.schools, groups: state.groups, invites: state.invites,
                dmRequests: state.dmRequests, dms: state.dms, recent: state.recent,
            }));
        } catch { /* storage full — the screen still works without a snapshot */ }
    },

    _paint(body, state, persist) {
        const allEmpty = ["schools", "groups", "invites", "dmRequests", "dms"].every(k => state[k] === null);
        if (allEmpty) {
            mount(body, h("div", { className: "skeleton-row" }, [h("div", { className: "skeleton skeleton-avatar" }), h("div", { className: "skeleton skeleton-line" })]));
            return;
        }

        const schools = state.schools;
        const groups = state.groups || [];
        const invites = state.invites || [];
        const dmRequests = state.dmRequests || [];
        const dms = state.dms || [];

        const statNums = { invites: invites.length + dmRequests.length };
        const invitesKnown = state.invites !== null || state.dmRequests !== null;
        const statRow = h("div", { className: "stat-row" }, [
            this._stat(schools ? schools.length : "–", "Schools"),
            this._stat(state.groups ? groups.length : "–", "Groups"),
            this._stat(invitesKnown ? statNums.invites : "–", "Invites", "invites"),
        ]);

        const sections = [];

        if (dmRequests.length) {
            sections.push(h("div", { className: "section-title" }, [h("span", {}, "Message requests")]));
            dmRequests.forEach(req => {
                const card = h("div", { className: "card", style: "margin-bottom:10px" }, [
                    h("div", { className: "card-row" }, [
                        Avatar(req.name || req.username, req.profile_pic, "sm"),
                        h("div", { className: "card-row-text" }, [
                            h("div", { className: "card-row-title" }, req.name || req.username || "Someone"),
                            h("div", { className: "card-row-sub" }, `@${req.username || "unknown"} wants to message you`),
                        ]),
                        h("div", { style: "display:flex;gap:6px" }, [
                            h("button", {
                                className: "btn btn-sm btn-primary",
                                onClick: () => this._respond(card, statNums, {
                                    action: () => MessagesApi.respondToDmRequest(req.id, "accepted"),
                                    successMsg: "Request accepted",
                                    done: () => { state.dmRequests = (state.dmRequests || []).filter(r => r.id !== req.id); persist(); },
                                }),
                            }, "Accept"),
                            h("button", {
                                className: "btn btn-sm btn-ghost",
                                onClick: () => this._respond(card, statNums, {
                                    action: () => MessagesApi.respondToDmRequest(req.id, "declined"),
                                    done: () => { state.dmRequests = (state.dmRequests || []).filter(r => r.id !== req.id); persist(); },
                                }),
                            }, "Decline"),
                        ]),
                    ]),
                ]);
                sections.push(card);
            });
        }

        if (invites.length) {
            sections.push(h("div", { className: "section-title" }, [h("span", {}, "Pending invites")]));
            invites.forEach(inv => {
                const card = h("div", { className: "card", style: "margin-bottom:10px" }, [
                    h("div", { className: "card-row" }, [
                        Avatar(inv.sender_username || inv.group_name, null, "sm"),
                        h("div", { className: "card-row-text" }, [
                            h("div", { className: "card-row-title" }, inv.group_name || "Group invite"),
                            h("div", { className: "card-row-sub" }, `From @${inv.sender_username || "someone"}`),
                        ]),
                        h("div", { style: "display:flex;gap:6px" }, [
                            h("button", {
                                className: "btn btn-sm btn-primary",
                                onClick: () => this._respond(card, statNums, {
                                    action: () => GroupsApi.respondToInvite(inv.id, "accepted"),
                                    successMsg: "Joined group",
                                    done: () => { state.invites = (state.invites || []).filter(i => i.id !== inv.id); persist(); },
                                }),
                            }, "Accept"),
                            h("button", {
                                className: "btn btn-sm btn-ghost",
                                onClick: () => this._respond(card, statNums, {
                                    action: () => GroupsApi.respondToInvite(inv.id, "declined"),
                                    done: () => { state.invites = (state.invites || []).filter(i => i.id !== inv.id); persist(); },
                                }),
                            }, "Decline"),
                        ]),
                    ]),
                ]);
                sections.push(card);
            });
        }

        sections.push(h("div", { className: "section-title" }, [
            h("span", {}, "Your schools"),
            schools && schools.length ? h("span", { className: "link", onClick: () => Router.go("schools") }, "See all") : null,
        ]));

        if (schools === null) {
            sections.push(h("div", { className: "skeleton-row" }, [h("div", { className: "skeleton skeleton-avatar" }), h("div", { className: "skeleton skeleton-line" })]));
        } else if (schools.length === 0) {
            sections.push(EmptyState({
                icon: "school",
                title: "You haven't joined a school yet",
                subtitle: "Create one as a teacher or join with a code from your school.",
                actionLabel: "Go to Schools",
                onAction: () => Router.go("schools"),
            }));
        } else {
            const list = h("div", { className: "card" });
            schools.slice(0, 4).forEach((s) => {
                list.appendChild(h("div", {
                    className: "card-row", onClick: () => Router.go(`schools/${s.id}`),
                }, [
                    Avatar(s.name, s.profile_pic, "sm"),
                    h("div", { className: "card-row-text" }, [
                        h("div", { className: "card-row-title" }, s.name),
                        h("div", { className: "card-row-sub" }, s.role),
                    ]),
                ]));
            });
            sections.push(list);
        }

        // Recent messages: painted from what we already have (DM previews,
        // group descriptions, and the last real group messages remembered
        // from earlier visits); the real ones are refreshed in the
        // background by _upgradeRecent and swapped in as they arrive.
        const recentTitle = h("div", { className: "section-title" }, [
            h("span", {}, "Recent messages"),
            h("span", { className: "link hidden", id: "home-recent-seeall" }, "See all"),
        ]);
        const recentWrap = h("div", { id: "home-recent-wrap" });
        sections.push(recentTitle, recentWrap);
        this._paintRecent(recentWrap, recentTitle, this._quickRecentPreviews(groups, dms, state.recent));

        mount(body, statRow, ...sections);
    },

    // Instant accept/decline: the card disappears from the dashboard the
    // moment you tap, no re-render of the whole page. The request runs in
    // the background (20s to confirm); on failure the card comes back and
    // says so. On success it's just gone — no reload needed.
    _respond(card, statNums, { action, successMsg, done }) {
        Optimistic.run({
            timeoutMs: 20000,
            apply: () => card.classList.add("optimistic-busy"),
            action,
            revert: () => card.classList.remove("optimistic-busy"),
            reconcile: () => {
                card.remove();
                if (done) done();
                if (statNums) {
                    statNums.invites = Math.max(0, statNums.invites - 1);
                    const el = qs('[data-stat="invites"] .stat-num');
                    if (el) el.textContent = String(statNums.invites);
                }
                if (successMsg) Toast.success(successMsg);
            },
            onError: () => Toast.error("That didn't go through. Check your connection and try again."),
        });
    },

    _quickRecentPreviews(groups, dms, upgraded = {}) {
        const dmPreviews = dms.map(u => ({
            kind: "dm", id: u.id, name: u.name || u.username, profile_pic: u.profile_pic,
            text: u.last_message || `@${u.username}`, sender: null, at: u.last_message_at || null,
        }));
        const groupPreviews = groups.slice(0, 8).map(g => {
            const known = upgraded[g.id];
            return {
                kind: "group", id: g.id, name: g.name, profile_pic: g.profile_pic,
                text: known?.text || g.description || "No messages yet",
                sender: known?.sender || null,
                at: known?.at || null,
            };
        });
        return this._sortRecent([...dmPreviews, ...groupPreviews]);
    },

    // Fetches the real last message per group in the background and
    // repaints as each one lands. Never blocks the first paint.
    async _upgradeRecent(state, alive, done) {
        const groups = (state.groups || []).slice(0, 8);
        await Promise.all(groups.map(async g => {
            let last = null;
            try {
                const history = await MessagesApi.getGroupHistory(g.id, 1);
                last = (history || [])[history?.length - 1] || null;
            } catch { last = null; }
            if (!last || !alive()) return;
            state.recent[g.id] = {
                text: last.content || g.description || "No messages yet",
                sender: last.sender_name || last.sender_username || null,
                at: last.created_at || null,
            };
            done();
        }));
    },

    _sortRecent(list) {
        return list
            .sort((a, b) => {
                const ta = a.at ? new Date(a.at).getTime() : 0;
                const tb = b.at ? new Date(b.at).getTime() : 0;
                return tb - ta;
            })
            .slice(0, 5);
    },

    _paintRecent(wrap, title, recent) {
        clear(wrap);
        const seeAll = qs("#home-recent-seeall", title);
        if (seeAll) seeAll.classList.toggle("hidden", !recent.length);
        if (seeAll) seeAll.onclick = () => Router.go("messages");

        if (!recent.length) {
            wrap.appendChild(EmptyState({
                icon: "chat_bubble",
                title: "Your conversations will appear here",
                subtitle: "Create a group or message someone to get started.",
                actionLabel: "Go to Messages",
                onAction: () => Router.go("messages"),
            }));
            return;
        }
        const list = h("div", { className: "recent-message-list" });
        recent.forEach(c => {
            list.appendChild(h("div", {
                className: "card-row recent-message-row",
                onClick: () => Router.go(c.kind === "group" ? `messages/group/${c.id}` : `messages/dm/${c.id}`),
            }, [
                Avatar(c.name, c.profile_pic, "sm"),
                h("div", { className: "card-row-text" }, [
                    h("div", { className: "card-row-title" }, [
                        h("span", {}, c.name),
                        c.at ? h("small", { className: "recent-time" }, conversationTime(c.at) || "") : null,
                    ]),
                    h("div", { className: "card-row-sub" }, c.sender ? `${c.sender}: ${c.text}` : c.text),
                ]),
            ]));
        });
        wrap.appendChild(list);
    },

    _quickAction(icon, label, onClick) {
        return h("button", { className: "quick-action", onClick }, [
            h("span", { className: "material-symbols-rounded" }, icon),
            h("span", {}, label),
        ]);
    },

    _stat(num, label, key) {
        return h("div", { className: "stat-card", dataset: key ? { stat: key } : undefined }, [
            h("div", { className: "stat-num" }, String(num)),
            h("div", { className: "stat-label" }, label),
        ]);
    },
};

window.HomePage = HomePage;
