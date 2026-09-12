// ------------------------------------------------------------------
// landing.js — public marketing page (index.html) logic.
// ------------------------------------------------------------------
// One job: decide, before the visitor sees anything, whether they
// already have a session. If they do, send them straight to the app
// (app.html) instead of showing them a sign-up pitch they don't need.
// Otherwise reveal the marketing content that CSS is hiding by
// default (see body.auth-check in landing.css).
//
// Depends only on api/config.js + services/session.js, both loaded
// just before this script — neither makes a network call for this
// check, they just read localStorage, so this resolves instantly.
// ------------------------------------------------------------------

(async () => {
    let loggedIn = false;
    try {
        loggedIn = await Session.isLoggedIn();
    } catch {
        loggedIn = false;
    }

    if (loggedIn) {
        location.replace("app.html");
        return; // never remove auth-check — we're navigating away anyway
    }

    document.body.classList.remove("auth-check");
})();
