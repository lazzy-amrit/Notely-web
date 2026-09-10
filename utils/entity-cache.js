// Persistent identity cache for users/groups seen in the app.
// The backend also exposes authoritative user/group detail endpoints;
// this cache is only a fast fallback so a restart does not turn names into IDs.
const ENTITY_CACHE_KEY = "notely_entity_cache_v2";

const EntityCache = {
    _groups: {},
    _users: {},

    _save() {
        try { localStorage.setItem(ENTITY_CACHE_KEY, JSON.stringify({ groups: this._groups, users: this._users })); } catch {}
    },

    _load() {
        try {
            const data = JSON.parse(localStorage.getItem(ENTITY_CACHE_KEY) || "{}");
            this._groups = data.groups || {};
            this._users = data.users || {};
        } catch { this._groups = {}; this._users = {}; }
    },

    rememberGroup(group) {
        if (!group || group.id === undefined || group.id === null) return;
        this._groups[String(group.id)] = {
            id: group.id,
            name: group.name,
            description: group.description ?? null,
            profile_pic: group.profile_pic ?? null,
            type: group.type ?? group.typeo ?? null,
            typeo: group.typeo ?? group.type ?? null,
            school_id: group.school_id ?? null,
            member_count: group.member_count ?? 0,
            my_role: group.my_role ?? null,
        };
        this._save();
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

    getGroup(id) { return this._groups[String(id)] || null; },
    getUser(id) { return this._users[String(id)] || null; },
};

EntityCache._load();
window.EntityCache = EntityCache;
