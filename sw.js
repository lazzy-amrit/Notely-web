// ------------------------------------------------------------------
// sw.js — service worker for the website build only.
//
// Bump CACHE_VERSION on every deploy that changes any cached file.
// Old caches are wiped on activate, so this is the only lever that
// controls "did the browser notice something changed."
//
// Strategy is deliberately split in two, because "instant like an
// app" and "a bug fix reaches everyone in minutes" (the whole reason
// you picked website over app store review) are in tension if this
// caches too aggressively:
//   - HTML (index.html, auth pages): network-first. Always tries the
//     real server first so a fresh deploy is picked up on next load;
//     only falls back to the cached copy if the network request fails
//     (offline / server down). This is what keeps "I fixed it, it's
//     live" true.
//   - JS/CSS/images/fonts: stale-while-revalidate. Serves instantly
//     from cache (no waiting on the network for a paint), but always
//     re-fetches in the background and updates the cache for the
//     *next* load. So a code fix shows up on the user's next reload,
//     not the current one — a small delay, in exchange for every
//     load after the first being instant.
// ------------------------------------------------------------------

const CACHE_VERSION = "v2";
const CACHE_NAME = `notely-web-${CACHE_VERSION}`;

const PRECACHE_URLS = [
    "./",
    "index.html",
    "app.html",
    "landing.js",
    "landing.css",
    "services/theme.js",
    "api/config.js",
    "utils/file-compression.js",
    "services/session.js",
    "services/cache.js",
    "api/http.js",
    "services/storage.js",
    "api/auth.js",
    "api/schools.js",
    "api/classes.js",
    "api/subjects.js",
    "api/groups.js",
    "api/users.js",
    "api/messages.js",
    "api/notes.js",
    "api/stars.js",
    "api/notifications.js",
    "utils/dom.js",
    "utils/optimistic.js",
    "utils/images-to-pdf.js",
    "utils/pdf-viewer.js",
    "utils/format.js",
    "utils/entity-cache.js",
    "services/toast.js",
    "services/sheet.js",
    "services/websocket.js",
    "services/router.js",
    "services/membership.js",
    "services/notifications.js",
    "components/avatar.js",
    "components/empty-state.js",
    "components/confirm.js",
    "components/tiny-menu.js",
    "components/profile-preview.js",
    "components/bottom-nav.js",
    "pages/home/home.js",
    "pages/home/home.css",
    "pages/messages/messages.js",
    "pages/messages/chat.js",
    "pages/messages/dm-search.js",
    "pages/messages/messages.css",
    "pages/notes/notes.js",
    "pages/notes/notes.css",
    "pages/schools/subjects.js",
    "pages/schools/schools.js",
    "pages/schools/schools.css",
    "pages/profile/profile.js",
    "pages/profile/profile.css",
    "pages/policies/policies.js",
    "app.js",
    "styles/variables.css",
    "styles/global.css",
    "styles/app.css",
    "styles/desktop.css",
    "assets/images/logo.png",
    "manifest.json",
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const req = event.request;
    if (req.method !== "GET") return; // never cache writes

    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;

    // Never touch API calls - those must always be live/dynamic data,
    // this service worker is purely for the static app shell.
    if (sameOrigin && (url.pathname.startsWith("/storage/") || url.pathname.includes("/api/") || req.headers.get("accept")?.includes("application/json"))) {
        return;
    }

    if (req.mode === "navigate" || (sameOrigin && url.pathname.endsWith(".html"))) {
        event.respondWith(networkFirst(req));
        return;
    }

    if (sameOrigin || url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
        event.respondWith(staleWhileRevalidate(req));
    }
});

async function networkFirst(req) {
    try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
    } catch {
        const cached = await caches.match(req);
        return cached || Response.error();
    }
}

async function staleWhileRevalidate(req) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const networkFetch = fetch(req).then(fresh => {
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
    }).catch(() => null);
    return cached || (await networkFetch) || Response.error();
}
