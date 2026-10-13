// ------------------------------------------------------------------
// services/cache.js — small persistent stale-while-revalidate cache.
// ------------------------------------------------------------------
// The cache is deliberately conservative: only read-heavy, user-scoped
// resources are cached. Mutating/searching endpoints stay network-first.
// Cached data is shown immediately when available and a background request
// refreshes it. This makes navigation fast without turning the cache into
// the source of truth.

const APP_CACHE_VERSION = "notely_data_cache_v4";
const CACHE_EVENT = "notely:cache-updated";
const CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const CacheService = {
    _inflight: new Map(),

    _userScope() {
        try {
            const raw = localStorage.getItem("notely_user");
            const user = raw ? JSON.parse(raw) : null;
            return String(user?.id || user?.username || "current");
        } catch { return "current"; }
    },

    _key(path) {
        return `${APP_CACHE_VERSION}:${this._userScope()}:${String(path || "")}`;
    },

    _read(path) {
        try {
            const raw = localStorage.getItem(this._key(path));
            if (!raw) return null;
            const item = JSON.parse(raw);
            if (!item || !Number.isFinite(item.savedAt)) return null;
            if (Date.now() - item.savedAt > CACHE_MAX_AGE) {
                localStorage.removeItem(this._key(path));
                return null;
            }
            return item;
        } catch { return null; }
    },

    _write(path, data) {
        try {
            localStorage.setItem(this._key(path), JSON.stringify({ savedAt: Date.now(), data }));
        } catch {
            // localStorage can fill up on media-heavy devices. Cache failure
            // must never break the network request/UI.
        }
    },

    _emit(path, data) {
        try { window.dispatchEvent(new CustomEvent(CACHE_EVENT, { detail: { path, data } })); } catch {}
    },

    _policy(path) {
        const p = String(path || "");
        if (p === "/auth/me") return { maxAge: 15 * 60 * 1000 };
        if (p === "/school/dashboard") return { maxAge: 5 * 60 * 1000 };
        if (p === "/stars") return { maxAge: 5 * 60 * 1000 };
        if (/^\/school\/\d+\/info$/.test(p)) return { maxAge: 10 * 60 * 1000 };
        if (/^\/school\/\d+\/members$/.test(p)) return { maxAge: 3 * 60 * 1000 };
        if (/^\/users\/\d+$/.test(p)) return { maxAge: 5 * 60 * 1000 };
        if (/^\/school\/\d+\/classes$/.test(p)) return { maxAge: 10 * 60 * 1000 };
        if (/^\/school\/\d+\/class\/[^/]+\/[^/]+\/subjects$/.test(p)) return { maxAge: 10 * 60 * 1000 };
        if (/^\/school\/\d+\/subjects\/\d+\/chapters$/.test(p)) return { maxAge: 10 * 60 * 1000 };
        if (/^\/notes\/(school|chapter|subject)\//.test(p)) return { maxAge: 10 * 60 * 1000 };
        return null;
    },

    async getOrFetch(path, fetcher) {
        const policy = this._policy(path);
        if (!policy) return fetcher();

        const cached = this._read(path);
        if (cached) {
            const age = Date.now() - cached.savedAt;
            if (age > policy.maxAge) this._backgroundRefresh(path, fetcher, policy);
            return cached.data;
        }
        return this._backgroundRefresh(path, fetcher, policy, true);
    },

    async _backgroundRefresh(path, fetcher, policy, waitForResult = false) {
        if (this._inflight.has(path)) return this._inflight.get(path);
        const promise = (async () => {
            try {
                const fresh = await fetcher();
                this._write(path, fresh);
                this._emit(path, fresh);
                return fresh;
            } finally {
                this._inflight.delete(path);
            }
        })();
        this._inflight.set(path, promise);
        if (waitForResult) return promise;
        promise.catch(() => {});
        return null;
    },

    invalidate(pathOrPrefix) {
        const prefix = String(pathOrPrefix || "");
        try {
            const userPrefix = `${APP_CACHE_VERSION}:${this._userScope()}:`;
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith(userPrefix) && key.slice(userPrefix.length).startsWith(prefix)) {
                    localStorage.removeItem(key);
                }
            }
        } catch {}
    },

    invalidateForMutation(path) {
        const p = String(path || "");
        if (p.startsWith("/auth/")) this.invalidate("/auth/me");
        if (p.startsWith("/school/")) {
            this.invalidate("/school/dashboard");
            const match = p.match(/^\/school\/(\d+)/);
            if (match) this.invalidate(`/school/${match[1]}/`);
        }
        if (p.startsWith("/notes/")) this.invalidate("/notes/");
        if (p.startsWith("/stars")) this.invalidate("/stars");
    },

    async prefetch(paths) {
        await Promise.allSettled((paths || []).map(path => {
            if (!this._policy(path)) return Promise.resolve();
            // Fetch through Api only after it exists; this method is called
            // after bootstrap has loaded the API layer.
            return Api.get(path).catch(() => null);
        }));
    },

    clearAll() {
        try {
            const prefix = `${APP_CACHE_VERSION}:`;
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key?.startsWith(prefix)) localStorage.removeItem(key);
            }
        } catch {}
    },
};

window.CacheService = CacheService;
window.CACHE_EVENT = CACHE_EVENT;
window.APP_CACHE_VERSION = APP_CACHE_VERSION;
