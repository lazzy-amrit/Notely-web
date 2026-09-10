// ------------------------------------------------------------------
// Notely — central configuration
// ------------------------------------------------------------------
// This is the ONLY place the backend host/port should be written.
// Every page (auth pages included) reads from CONFIG.API_HOST /
// CONFIG.WS_HOST — verified across auth/js/*.js.
//
// Website deployment: API_HOST is a fixed, hardcoded backend URL.
// If the backend moves, update DEFAULT_API_HOST here — there is no
// runtime host-recovery/override mechanism.
// ------------------------------------------------------------------

const DEFAULT_API_HOST = "https://notely-backend-production-75cd.up.railway.app";

const CONFIG = {
    API_HOST: DEFAULT_API_HOST,

    // Mirrors the API host (http -> ws, https -> wss) instead of a
    // separately-hardcoded value.
    WS_HOST: DEFAULT_API_HOST.startsWith("https://")
        ? "wss://" + DEFAULT_API_HOST.slice("https://".length)
        : DEFAULT_API_HOST.startsWith("http://")
            ? "ws://" + DEFAULT_API_HOST.slice("http://".length)
            : DEFAULT_API_HOST,

    // Rough client-side mirror of backend rate limits, used only to
    // decide when to pre-emptively disable a button; the backend's
    // 429 response is still the real source of truth.
    RATE_LIMITS: {
        login: { max: 5, windowMs: 60_000 },
        register: { max: 3, windowMs: 60_000 },
    },

    DM_MESSAGE_LIMIT: 5,

    AUTH: {
        ACCESS_REFRESH_BEFORE_MS: 2 * 60 * 1000,
        REFRESH_ROTATE_BEFORE_MS: 5 * 24 * 60 * 60 * 1000,
        REFRESH_LIFETIME_MS: 60 * 24 * 60 * 60 * 1000,
    },

    STORAGE_KEYS: {
        // TOKEN remains as an alias for old installations. New code stores
        // the short-lived JWT and opaque refresh token separately.
        TOKEN: "notely_token",
        ACCESS_TOKEN: "notely_access_token",
        REFRESH_TOKEN: "notely_refresh_token",
        ACCESS_EXPIRES_AT: "notely_access_expires_at",
        REFRESH_EXPIRES_AT: "notely_refresh_expires_at",
        USER: "notely_user",
    },
};

// Frozen so a stray typo elsewhere can't silently create a new key.
Object.freeze(CONFIG);
Object.freeze(CONFIG.RATE_LIMITS);
Object.freeze(CONFIG.STORAGE_KEYS);
