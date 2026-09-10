// ------------------------------------------------------------------
// services/storage.js — unified protected file retrieval.
// Backend serves images and PDFs through the same streaming endpoint:
//   GET /storage/{storage_id}/download
// The storage id is the only identifier the frontend needs.
//
// Storage IDs are immutable content: a new upload always gets a new
// id and the old one is deleted server-side (see backend
// Account/profile.py, Chat/profile_pic.py). That means once a blob is
// cached for an id, it never goes stale — so it's safe to persist to
// disk (IndexedDB) and skip the network entirely on every later hit,
// across app restarts. This is what keeps avatars/photos painting
// instantly instead of every cold start re-downloading them.
// ------------------------------------------------------------------

const STORAGE_DB_NAME = "notely_storage_cache_v1";
const STORAGE_DB_STORE = "blobs";

const StorageService = {
    _cache: new Map(),   // id -> Promise<Blob>, in-memory for the current session
    _urls: new Map(),    // id -> object URL
    _dbPromise: null,

    _id(value) {
        if (value == null) return null;
        if (typeof value === "object") {
            value = value.storage_id ?? value.storageId ?? value.id ?? value.profile_storage_id ?? null;
        }
        const id = Number(value);
        return Number.isInteger(id) && id > 0 ? id : null;
    },

    _openDb() {
        if (this._dbPromise) return this._dbPromise;
        this._dbPromise = new Promise(resolve => {
            if (!window.indexedDB) { resolve(null); return; }
            try {
                const req = indexedDB.open(STORAGE_DB_NAME, 1);
                req.onupgradeneeded = () => { req.result.createObjectStore(STORAGE_DB_STORE); };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            } catch { resolve(null); }
        });
        return this._dbPromise;
    },

    async _dbGet(id) {
        const db = await this._openDb();
        if (!db) return null;
        return new Promise(resolve => {
            try {
                const req = db.transaction(STORAGE_DB_STORE, "readonly").objectStore(STORAGE_DB_STORE).get(id);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            } catch { resolve(null); }
        });
    },

    async _dbSet(id, blob) {
        const db = await this._openDb();
        if (!db) return;
        try { db.transaction(STORAGE_DB_STORE, "readwrite").objectStore(STORAGE_DB_STORE).put(blob, id); } catch {}
    },

    async _dbDelete(id) {
        const db = await this._openDb();
        if (!db) return;
        try { db.transaction(STORAGE_DB_STORE, "readwrite").objectStore(STORAGE_DB_STORE).delete(id); } catch {}
    },

    async _dbClear() {
        const db = await this._openDb();
        if (!db) return;
        try { db.transaction(STORAGE_DB_STORE, "readwrite").objectStore(STORAGE_DB_STORE).clear(); } catch {}
    },

    // Best-effort, synchronous "is this already sitting in memory"
    // check — used purely to decide whether a caller should bother
    // showing a "loading…" hint before calling getBlob(). It can't see
    // the on-disk (IndexedDB) cache without an async round trip, so a
    // false here doesn't guarantee a network fetch — it might still be
    // an instant disk hit — but a true here always means no wait at all.
    has(storageId) {
        const id = this._id(storageId);
        return !!id && this._cache.has(id);
    },

    async getBlob(storageId, kind = "note") {
        const id = this._id(storageId);
        if (!id) throw new Error("This file is missing its storage ID.");

        if (this._cache.has(id)) return this._cache.get(id);

        const pending = (async () => {
            const onDisk = await this._dbGet(id);
            if (onDisk) return onDisk;
            const path = kind === "profile-pic"
                ? `/storage/profile-pic/${encodeURIComponent(id)}/download`
                : `/storage/${encodeURIComponent(id)}/download`;
            const blob = await Api.getBlob(path);
            this._dbSet(id, blob).catch(() => {});
            return blob;
        })().catch(err => {
            this._cache.delete(id);
            throw err;
        });
        this._cache.set(id, pending);
        return pending;
    },

    async getObjectUrl(storageId, kind = "note") {
        const id = this._id(storageId);
        if (!id) return null;
        if (this._urls.has(id)) return this._urls.get(id);

        const blob = await this.getBlob(id, kind);
        const url = URL.createObjectURL(blob);
        this._urls.set(id, url);
        return url;
    },

    clear(storageId) {
        const id = this._id(storageId);
        if (!id) return;
        this._cache.delete(id);
        this._dbDelete(id).catch(() => {});
        const url = this._urls.get(id);
        if (url) {
            URL.revokeObjectURL(url);
            this._urls.delete(id);
        }
    },

    clearAll() {
        for (const url of this._urls.values()) URL.revokeObjectURL(url);
        this._cache.clear();
        this._urls.clear();
        this._dbClear().catch(() => {});
    },
};

window.StorageService = StorageService;