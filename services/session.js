// ------------------------------------------------------------------
// Session — persistent auth state for short-lived access + long-lived
// opaque refresh tokens.
//
// Access token: JWT, ~30 minutes.
// Refresh token: opaque backend token, ~60 days.
// ------------------------------------------------------------------

const Session = {
    _refreshInFlight: null,
    _accessTimer: null,
    _refreshRotationTimer: null,

    async _get(key) {
        return localStorage.getItem(key);
    },

    async _set(key, value) {
        localStorage.setItem(key, String(value));
    },

    async _remove(key) {
        localStorage.removeItem(key);
    },

    async getToken() {
        const access = await this._get(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
        if (access) return access;

        // Migrate the old single-token installation format lazily.
        const legacy = await this._get(CONFIG.STORAGE_KEYS.TOKEN);
        if (legacy) {
            await this._set(CONFIG.STORAGE_KEYS.ACCESS_TOKEN, legacy);
            await this._remove(CONFIG.STORAGE_KEYS.TOKEN);
            return legacy;
        }
        return null;
    },

    async getAccessToken() {
        return this.getToken();
    },

    async getRefreshToken() {
        return this._get(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
    },

    _decodeAccessExp(token) {
        try {
            const payload = token.split(".")[1];
            if (!payload) return null;
            const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
            const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
            const parsed = JSON.parse(atob(padded));
            return Number.isFinite(parsed.exp) ? parsed.exp * 1000 : null;
        } catch {
            return null;
        }
    },

    async _saveTokenMeta(accessToken, refreshToken, { refreshIssuedAt } = {}) {
        if (!accessToken) throw new Error("Missing access token");

        await this._set(CONFIG.STORAGE_KEYS.ACCESS_TOKEN, accessToken);

        const accessExp = this._decodeAccessExp(accessToken);
        if (accessExp) {
            await this._set(CONFIG.STORAGE_KEYS.ACCESS_EXPIRES_AT, accessExp);
        }

        if (refreshToken) {
            const issuedAt = refreshIssuedAt || Date.now();
            await this._set(CONFIG.STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
            // The refresh token is intentionally opaque; its expiry cannot
            // be decoded. Track its 60-day lifetime from the time the
            // backend issued/returned it.
            await this._set(
                CONFIG.STORAGE_KEYS.REFRESH_EXPIRES_AT,
                issuedAt + CONFIG.AUTH.REFRESH_LIFETIME_MS
            );
        }

        this._scheduleTimers(accessExp);
    },

    async setTokens(data) {
        if (!data?.access_token) throw new Error("Login response did not include an access token");

        const existingRefresh = await this.getRefreshToken();
        const refresh = data.refresh_token || existingRefresh;

        await this._saveTokenMeta(data.access_token, refresh, {
            refreshIssuedAt: data.refresh_token ? Date.now() : undefined,
        });
    },

    // Backwards-compatible helper for any legacy caller. New auth flows
    // should use setTokens() so the refresh token is retained too.
    async setToken(token) {
        await this._saveTokenMeta(token, await this.getRefreshToken());
    },

    async getUser() {
        return this._getUserValue();
    },

    async _getUserValue() {
        const raw = await this._get(CONFIG.STORAGE_KEYS.USER);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    },

    async setUser(user) {
        await this._set(CONFIG.STORAGE_KEYS.USER, JSON.stringify(user));
    },

    async isLoggedIn() {
        return !!(await this.getToken());
    },

    async _refreshRequest(tokenType) {
        const refreshToken = await this.getRefreshToken();
        const accessToken = await this.getToken();

        if (!refreshToken) {
            throw Object.assign(new Error("No refresh token"), { status: 401 });
        }

        const body = JSON.stringify({
            token: refreshToken,
            token_type: tokenType,
        });

        const doFetch = async () => {
            const response = await fetch(`${CONFIG.API_HOST}/auth/refresh`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body,
            });

            let data = null;
            try { data = await response.json(); } catch {}

            if (!response.ok) {
                throw Object.assign(
                    new Error(data?.detail || "Unable to refresh session"),
                    { status: response.status, detail: data?.detail }
                );
            }

            return data;
        };

        return doFetch();
    },

    async refreshAccess({ rotateRefresh = false } = {}) {
        if (this._refreshInFlight) return this._refreshInFlight;

        this._refreshInFlight = (async () => {
            const data = await this._refreshRequest(
                rotateRefresh ? "Both" : "Access"
            );

            const oldRefresh = await this.getRefreshToken();
            const refreshToken = data.refresh_token || oldRefresh;

            await this._saveTokenMeta(data.access_token, refreshToken, {
                // Only reset the opaque-token lifetime when the backend
                // actually returned a new refresh token.
                refreshIssuedAt: data.refresh_token ? Date.now() : undefined,
            });

            // The WS handshake is authenticated with the access JWT that
            // existed when the socket was opened. Re-open it after a token
            // refresh so the live connection is never left on an old JWT.
            if (window.WS?.isConnected?.()) {
                window.WS.disconnect();
                window.WS.connect();
            }

            return data.access_token;
        })().finally(() => {
            this._refreshInFlight = null;
        });

        return this._refreshInFlight;
    },

    async ensureAccessToken({ force = false } = {}) {
        const accessToken = await this.getToken();
        if (!accessToken) return null;

        const now = Date.now();
        const accessExp =
            Number(await this._get(CONFIG.STORAGE_KEYS.ACCESS_EXPIRES_AT)) ||
            this._decodeAccessExp(accessToken);

        const refreshExp = Number(
            await this._get(CONFIG.STORAGE_KEYS.REFRESH_EXPIRES_AT)
        );

        // Rotate the opaque refresh token roughly five days before its
        // tracked 60-day lifetime ends. The backend decides whether a
        // rotation actually occurs.
        const rotateRefresh =
            Number.isFinite(refreshExp) &&
            refreshExp > 0 &&
            refreshExp - now <= CONFIG.AUTH.REFRESH_ROTATE_BEFORE_MS;

        if (force || (accessExp && accessExp - now <= CONFIG.AUTH.ACCESS_REFRESH_BEFORE_MS)) {
            return this.refreshAccess({ rotateRefresh });
        }

        if (rotateRefresh) {
            await this.refreshAccess({ rotateRefresh: true });
            return this.getToken();
        }

        return accessToken;
    },

    _scheduleTimers(accessExp) {
        clearTimeout(this._accessTimer);
        clearTimeout(this._refreshRotationTimer);

        if (accessExp) {
            const delay = Math.max(
                5_000,
                accessExp - Date.now() - CONFIG.AUTH.ACCESS_REFRESH_BEFORE_MS
            );
            this._accessTimer = setTimeout(() => {
                this.ensureAccessToken().catch(() => {});
            }, delay);
        }

        this._get(CONFIG.STORAGE_KEYS.REFRESH_EXPIRES_AT).then(value => {
            const refreshExp = Number(value);
            if (!refreshExp) return;

            const delay = Math.max(
                30_000,
                refreshExp - Date.now() - CONFIG.AUTH.REFRESH_ROTATE_BEFORE_MS
            );
            this._refreshRotationTimer = setTimeout(() => {
                this.ensureAccessToken().catch(() => {});
            }, delay);
        });
    },

    async clear() {
        clearTimeout(this._accessTimer);
        clearTimeout(this._refreshRotationTimer);
        this._accessTimer = null;
        this._refreshRotationTimer = null;

        const keys = [
            CONFIG.STORAGE_KEYS.TOKEN,
            CONFIG.STORAGE_KEYS.ACCESS_TOKEN,
            CONFIG.STORAGE_KEYS.REFRESH_TOKEN,
            CONFIG.STORAGE_KEYS.ACCESS_EXPIRES_AT,
            CONFIG.STORAGE_KEYS.REFRESH_EXPIRES_AT,
            CONFIG.STORAGE_KEYS.USER,
        ];

        await Promise.all(keys.map(key => this._remove(key)));
        try { window.CacheService?.clearAll?.(); } catch {}
    },

    async forceLogout(reason) {
        const refreshToken = await this.getRefreshToken();

        // Unregister this device's push token before wiping local auth
        // state - it needs the (still-live) access token to authenticate
        // the DELETE call, so it must happen before clear().

        // Best-effort server-side refresh-token revocation. Don't let a
        // failed logout request prevent local logout.
        if (refreshToken) {
            try {
                const accessToken = await this.getToken();
                await fetch(`${CONFIG.API_HOST}/auth/logout`, {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                    },
                    body: JSON.stringify({ token: refreshToken }),
                });
            } catch {}
        }

        await this.clear();

        if (window.WS && typeof window.WS.disconnect === "function") {
            window.WS.disconnect();
        }

        const target = "auth/login.html";

        if (!location.pathname.includes("/auth/")) {
            location.href = target;
        } else if (!location.pathname.endsWith("login.html")) {
            location.href = "login.html";
        }
    },
};

window.Session = Session;
