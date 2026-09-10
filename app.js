// ------------------------------------------------------------------
// app.js — entry point for the post-login shell (index.html)
// ------------------------------------------------------------------

// Registers sw.js for instant repeat loads + add-to-homescreen
// support (see sw.js and manifest.json for the caching strategy).
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
}

(async function bootstrap() {
    // Policies must be readable without an account (they're linked from
    // the sign-up screen), so this route bypasses the login gate below
    // entirely rather than bouncing straight to auth/login.html.
    const bootHash = location.hash.replace(/^#\/?/, "");
    if (bootHash.startsWith("policies")) {
        Router.register("policies", (c, p) => PoliciesPage.render(c, p));
        Router.start();
        return;
    }

    // Not logged in -> straight to the auth flow. Per spec §7, a 401
    // from any API call also routes here (see Session.forceLogout).
    if (!(await Session.isLoggedIn())) {
        location.href = "auth/login.html";
        return;
    }

    // Register the shell immediately. We do not make the user wait for a
    // chain of secondary requests before the UI can render. Auth is restored
    // first, then the cache/WS warm-up continues in the background.
    Router.register("home", (c) => HomePage.render(c));
    Router.register("messages", (c, p) => MessagesPage.render(c, p));
    Router.register("notes", (c, p) => NotesPage.render(c, p));
    Router.register("schools", (c, p) => SchoolsPage.render(c, p));
    Router.register("profile", (c, p) => ProfilePage.render(c, p));
    Router.register("policies", (c, p) => PoliciesPage.render(c, p));

    // Paint immediately from whatever local user/cache state exists.
    // Token refresh, /auth/me reconciliation, WS and secondary API warm-up
    // all happen after first paint instead of holding the splash/shell hostage.
    Router.start();

    window.addEventListener(CACHE_EVENT, event => {
        if (event.detail?.path === "/auth/me" && event.detail.data) {
            Session.setUser(event.detail.data).catch(() => {});
        }
    });

    try {
        await Session.ensureAccessToken();
        await AuthApi.me();
    } catch {
        if (!(await Session.isLoggedIn())) {
            location.href = "auth/login.html";
            return;
        }
    }

    // Realtime + data warm-up remain independent of first paint.
    WS.connect();
    NotificationService.init().catch(() => {});
    CacheService.prefetch([
        "/auth/me",
        "/school/dashboard",
        "/chats/groups",
        "/chat/dms",
        "/chat/invites",
        "/chat/dm-requests",
        "/stars",
    ]).catch(() => {});
})();

// ------------------------------------------------------------------
// Tapped cards/buttons must not keep focus after the gesture ends:
// on Android WebView a focused element can still paint a stray dark
// outline even with `outline:none` in CSS. Dropping focus right after
// the tap (never for text inputs, which need to keep the keyboard)
// guarantees the "lit border" can't linger on a card.
// ------------------------------------------------------------------
document.addEventListener("pointerup", () => {
    const el = document.activeElement;
    if (!el || el === document.body) return;
    if (el.matches("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
    if (typeof el.blur === "function") el.blur();
}, true);
