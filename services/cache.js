// ------------------------------------------------------------------
// services/cache.js — small persistent stale-while-revalidate cache.
// ------------------------------------------------------------------
// The cache is deliberately conservative: only read-heavy, user-scoped
// resources are cached. Mutating/searching endpoints stay network-first.
// Cached data is shown immediately when available and a background request
// refreshes it. This makes navigation fast without turning the cache into
// the source of truth.

const APP_CACHE_VERSION = "notely_data_cache_v3";
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

    _normalizePath(path) {
        const p = String(path || "");
        return p.replace(/^(\/chat\/(?:group|dm)\/\d+\/messages)\?limit=\d+$/, "$1?limit=20");
    },

    _key(path) {
        return `${APP_CACHE_VERSION}:${this._userScope()}:${this._normalizePath(path)}`;
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
        if (p === "/chats/groups") return { maxAge: 5 * 60 * 1000 };
        if (p === "/chat/dms") return { maxAge: 60 * 1000 };
        if (p === "/chat/dm-requests" || p === "/chat/invites") return { maxAge: 30 * 1000 };
        if (p === "/stars") return { maxAge: 5 * 60 * 1000 };
        if (/^\/school\/\d+\/info$/.test(p)) return { maxAge: 10 * 60 * 1000 };
        if (/^\/school\/\d+\/members$/.test(p)) return { maxAge: 3 * 60 * 1000 };
        if (/^\/chat\/group\/\d+$/.test(p)) return { maxAge: 3 * 60 * 1000 };
        if (/^\/users\/\d+$/.test(p)) return { maxAge: 5 * 60 * 1000 };
        if (/^\/school\/\d+\/classes$/.test(p)) return { maxAge: 10 * 60 * 1000 };
        if (/^\/school\/\d+\/class\/[^/]+\/[^/]+\/subjects$/.test(p)) return { maxAge: 10 * 60 * 1000 };
        if (/^\/school\/\d+\/subjects\/\d+\/chapters$/.test(p)) return { maxAge: 10 * 60 * 1000 };
        if (/^\/notes\/(school|chapter|subject)\//.test(p)) return { maxAge: 10 * 60 * 1000 };
        if (/^\/chat\/group\/\d+\/messages\?limit=\d+$/.test(p)) return { maxAge: 20 * 1000, messageHistory: true };
        if (/^\/chat\/dm\/\d+\/messages\?limit=\d+$/.test(p)) return { maxAge: 20 * 1000, messageHistory: true };
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
                let data = fresh;
                if (policy.messageHistory && Array.isArray(fresh)) {
                    // Keep the latest 20 locally even if a caller asks for a
                    // larger history. The server remains the full history.
                    data = fresh.slice(-20);
                }
                this._write(path, data);
                this._emit(path, data);
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

    // Removes exactly one cache entry. Unlike invalidate() (a prefix scan),
    // this is safe to use with a bare numeric id at the end of the path -
    // invalidate("/chat/group/12") would also wipe "/chat/group/123" since
    // it's a prefix match; this never does.
    _invalidateExact(path) {
        try { localStorage.removeItem(this._key(path)); } catch {}
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
        // Message sends/deletes/reactions are reconciled directly with the
        // local 20-message history; don't wipe that cache on every send.
        const isMessageMutation = /^\/chat\/(?:group\/\d+\/messages|dm\/\d+\/messages|messages\/)/.test(p);
        if (p.startsWith("/school/")) {
            this.invalidate("/school/dashboard");
            const match = p.match(/^\/school\/(\d+)/);
            if (match) this.invalidate(`/school/${match[1]}/`);
        }
        if (p.startsWith("/chat/") && !isMessageMutation) {
            this.invalidate("/chats/groups");
            this.invalidate("/chat/dms");
            this.invalidate("/chat/invites");
            this.invalidate("/chat/dm-requests");
        }
        if (p.startsWith("/notes/")) this.invalidate("/notes/");
        if (p.startsWith("/stars")) this.invalidate("/stars");

        // Group detail (name/photo/members/roles) - covers profile-pic
        // upload, member add/remove, and role changes so the cached
        // /chat/group/{id} the user is looking at doesn't go stale.
        const groupMatch = p.match(/^\/chat\/groups?\/(\d+)/);
        if (groupMatch) this._invalidateExact(`/chat/group/${groupMatch[1]}`);
        const roleMatch = p.match(/^\/chat\/(\d+)\/role$/);
        if (roleMatch) this._invalidateExact(`/chat/group/${roleMatch[1]}`);
    },

    appendMessage(path, message) {
        if (!path || !message) return;
        const cached = this._read(path);
        if (!cached || !Array.isArray(cached.data)) return;
        const id = message.id ?? message.message_id;
        const list = cached.data.filter(m => String(m.id ?? m.message_id) !== String(id));
        list.push(message);
        this._write(path, list.slice(-20));
        this._emit(path, list.slice(-20));
    },

    removeMessage(path, messageId) {
        const cached = this._read(path);
        if (!cached || !Array.isArray(cached.data)) return;
        const list = cached.data.filter(m => String(m.id ?? m.message_id) !== String(messageId));
        this._write(path, list);
        this._emit(path, list);
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
