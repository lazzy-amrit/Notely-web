// ------------------------------------------------------------------
// services/router.js — tiny hash router for the post-login app shell.
// ------------------------------------------------------------------
// Route format: #/home, #/messages/group/12, #/notes/school/3/class/10/A
// Each top-level section (home, messages, notes, schools, profile)
// registers itself via Router.register(name, handler) where handler
// is (container, params) => void|Promise<void>.
// ------------------------------------------------------------------

const Router = {
    _routes: {},
    // Counts forward navigations made through go() since app start, so
    // the hardware/gesture back button (see app.js) knows how many
    // levels of real history it can still pop before it should exit
    // the app instead — history.length itself can't be used for this
    // since it only ever grows and never reflects your current depth.
    _depth: 0,

    register(name, handler) {
        this._routes[name] = handler;
    },

    go(path) {
        this._depth++;
        location.hash = `#/${path}`;
    },

    // One step back through router history. Returns false when there's
    // nothing left to pop, so the caller (the back-button handler) knows
    // it's at the root and should exit the app instead.
    back() {
        if (this._depth <= 0) return false;
        this._depth--;
        history.back();
        return true;
    },

    // For in-app "<" buttons that mean "take me to my parent screen".
    // Prefers real browser back (pops the stack, keeps _depth in sync)
    // over go() (which would push a NEW forward entry) so a hardware
    // back press right after doesn't bounce forward into the screen
    // you just left. Falls back to go(fallbackPath) only when there's
    // no real history behind this screen (e.g. a deep link landed here
    // directly, so there's nothing to pop).
    goBack(fallbackPath) {
        if (this.back()) return;
        if (fallbackPath) this.go(fallbackPath);
    },

    start() {
        window.addEventListener("hashchange", () => {
            // A transient hash clear (common during WebView resume or
            // navigation races) must not throw the user back to Home.
            if (!location.hash && sessionStorage.getItem("notely_last_route")) {
                location.hash = sessionStorage.getItem("notely_last_route");
                return;
            }
            this._render();
        });
        this._render();
    },

    async _render() {
        const renderId = (this._renderId = (this._renderId || 0) + 1);
        let hash = location.hash.replace(/^#\/?/, "");
        if (!hash) {
            const last = sessionStorage.getItem("notely_last_route");
            if (last) hash = last.replace(/^#\/?/, "");
            else hash = "home";
        }
        const segments = hash.split("/").filter(Boolean);
        try { sessionStorage.setItem("notely_last_route", `#/${hash}`); } catch {}
        const section = segments[0] || "home";
        const params = segments.slice(1);

        const container = qs("#app-content");
        const navRoot = qs("#nav-root");

        // An open group/DM thread is a full-screen chat surface (like
        // WhatsApp/Instagram) — the bottom tab bar has no room there and
        // would otherwise float on top of the composer. The inbox list
        // itself (#/messages with no thread id) still shows the tab bar.
        const isChatThread = section === "messages" && (params[0] === "group" || params[0] === "dm");
        document.body.classList.toggle("nav-hidden", isChatThread);
        // #app-content.chat-page is what turns the page into a full-bleed,
        // fixed, no-gutter surface for an open chat thread (see
        // messages.css). It must be kept in sync with EVERY navigation,
        // not just ones that land back on the Messages list — otherwise
        // leaving a chat via the bottom nav (Home/Notes/Schools/Profile)
        // leaves the class behind and the next page inherits the
        // full-screen, zero-padding layout meant only for chat.
        container.classList.toggle("chat-page", isChatThread);
        if (isChatThread) clear(navRoot); else mount(navRoot, BottomNav(section));

        const handler = this._routes[section];
        if (!handler) {
            mount(container, EmptyState({ icon: "error", title: "Page not found" }));
            this._animateEnter(container);
            return;
        }

        // Simple loading placeholder while the async page loads its data.
        mount(container, h("div", { className: "skeleton-row" }, [
            h("div", { className: "skeleton skeleton-avatar" }),
            h("div", { className: "skeleton skeleton-line" }),
        ]));
        this._animateEnter(container);

        try {
            await handler(container, params);
            if (renderId !== this._renderId) return;
            this._animateEnter(container);
        } catch (err) {
            if (renderId !== this._renderId) return;
            console.error(err);
            mount(container, EmptyState({
                icon: "error",
                title: "Something went wrong",
                subtitle: err?.message || "Please try again.",
            }));
            this._animateEnter(container);
        }
    },

    // Small fade + slight translate on every content swap. Re-adding the
    // class after forcing a reflow lets the same CSS animation replay on
    // back-to-back navigations (a plain class toggle wouldn't retrigger
    // it). Respects prefers-reduced-motion via CSS, not here.
    _animateEnter(container) {
        container.classList.remove("page-enter");
        void container.offsetWidth;
        container.classList.add("page-enter");
    },
};

window.Router = Router;
