// Persistent identity cache for users seen in the app.
// The backend also exposes an authoritative user detail endpoint;
// this cache is only a fast fallback so a restart does not turn names into IDs.
const ENTITY_CACHE_KEY = "notely_entity_cache_v3";

const EntityCache = {
    _users: {},

    _save() {
        try { localStorage.setItem(ENTITY_CACHE_KEY, JSON.stringify({ users: this._users })); } catch {}
    },

    _load() {
        try {
            const data = JSON.parse(localStorage.getItem(ENTITY_CACHE_KEY) || "{}");
            this._users = data.users || {};
        } catch { this._users = {}; }
    },

    rememberUser(user) {
        if (!user || user.id === undefined || user.id === null) return;
        this._users[String(user.id)] = {
            id: user.id,
            name: user.name || user.full_name || user.username,
            username: user.username ?? null,
            bio: user.bio ?? null,
            role: user.role ?? null,
            profile_pic: user.profile_pic ?? null,
        };
        this._save();
    },

    getUser(id) { return this._users[String(id)] || null; },
};

EntityCache._load();
window.EntityCache = EntityCache;
