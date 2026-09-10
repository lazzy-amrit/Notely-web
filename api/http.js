// ------------------------------------------------------------------
// http.js — thin fetch wrapper used by every api/*.js module.
// ------------------------------------------------------------------
// Responsibilities:
//   - attach the Bearer token automatically
//   - JSON-encode bodies (unless FormData, for file uploads)
//   - turn every failure into a consistent { status, message } error
//   - handle 401 (force logout), 429 (friendly rate-limit message)
//   - handle network failure / timeout
//
// Callers never touch `fetch` directly, so every screen gets the
// same error behavior for free.
// ------------------------------------------------------------------

class ApiError extends Error {
    constructor(status, message, detail) {
        super(message);
        this.status = status;
        this.detail = detail;
    }
}

const DEFAULT_TIMEOUT_MS = 15_000;

function friendlyMessage(status, rawDetail) {
    if (status === 401) return "Your session expired. Please log in again.";
    if (status === 403) return rawDetail || "You don't have permission to do that.";
    if (status === 404) return rawDetail || "We couldn't find that.";
    if (status === 409) return rawDetail || "That already exists.";
    if (status === 429) return "Too many attempts. Please wait a moment and try again.";
    if (status >= 500) return "Something went wrong on our end. Please try again.";
    return rawDetail || "Something went wrong. Please try again.";
}

async function request(
    path,
    {
        method = "GET",
        body,
        isForm = false,
        isUrlEncoded = false,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        skipAuth = false,
        cache = true,
    } = {},
    _authRetryAttempted = false,
    _recoveryAttempted = false
) {
    // Cache only whitelisted GET resources. The cached value is returned
    // immediately and CacheService revalidates it in the background.
    // This is intentionally skipped for auth-less/search requests unless
    // CacheService explicitly whitelists the path.
    if (method === "GET" && cache && window.CacheService) {
        return CacheService.getOrFetch(path, () => request(
            path,
            { method, body, isForm, isUrlEncoded, timeoutMs, skipAuth, cache: false },
            _authRetryAttempted,
            _recoveryAttempted
        ));
    }

    let token = null;

    if (!skipAuth && window.Session) {
        try {
            token = await Session.ensureAccessToken();
        } catch (err) {
            if (err?.status === 401) {
                await Session.forceLogout("refresh_failed");
            }
            throw new ApiError(
                err?.status || 0,
                err?.message || "Your session expired. Please log in again.",
                err?.detail
            );
        }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers = {};
    if (!isForm && !isUrlEncoded && body !== undefined) {
        headers["Content-Type"] = "application/json";
    }
    if (isUrlEncoded) headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (token && !skipAuth) headers["Authorization"] = `Bearer ${token}`;

    let finalBody = body;
    if (body !== undefined && !isForm && !isUrlEncoded) {
        finalBody = JSON.stringify(body);
    }

    let response;
    try {
        response = await fetch(`${CONFIG.API_HOST}${path}`, {
            method,
            headers,
            body: finalBody,
            signal: controller.signal,
        });
    } catch (err) {
        clearTimeout(timer);

        if (err.name === "AbortError") {
            throw new ApiError(0, "Request timed out. Check your connection and try again.");
        }
        throw new ApiError(0, "Unable to connect. Check your connection and try again.");
    }
    clearTimeout(timer);

    // A request can still race the token refresh boundary. Refresh once and
    // replay the request instead of immediately throwing the user out.
    if (response.status === 401 && !skipAuth && !_authRetryAttempted && window.Session) {
        try {
            await Session.refreshAccess();
            return request(
                path,
                { method, body, isForm, isUrlEncoded, timeoutMs, skipAuth, cache },
                true,
                _recoveryAttempted
            );
        } catch {
            await Session.forceLogout("unauthorized");
            throw new ApiError(401, "Your session expired. Please log in again.");
        }
    }

    let data = null;
    const contentType = response.headers.get("content-type") || "";
    try {
        if (contentType.includes("application/json")) {
            data = await response.json();
        } else if (contentType.includes("application/pdf")) {
            data = await response.blob();
        } else {
            data = await response.text();
        }
    } catch {
        data = null;
    }

    if (!response.ok) {
        const rawDetail =
            data && typeof data === "object"
                ? data.detail
                : (typeof data === "string" ? data : null);

        throw new ApiError(
            response.status,
            friendlyMessage(response.status, rawDetail),
            rawDetail
        );
    }

    if (response.ok && method !== "GET" && window.CacheService) {
        CacheService.invalidateForMutation(path);
    }

    return data;
}
const Api = {
    get: (path, opts) => request(path, { ...opts, method: "GET" }),
    post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
    put: (path, body, opts) => request(path, { ...opts, method: "PUT", body }),
    patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
    delete: (path, opts) => request(path, { ...opts, method: "DELETE" }),

    // multipart/form-data upload (profile pics, group pics, note PDFs)
    upload: (path, formData, opts) => request(path, { ...opts, method: "POST", body: formData, isForm: true }),
    uploadPut: (path, formData, opts) => request(path, { ...opts, method: "PUT", body: formData, isForm: true }),

    // application/x-www-form-urlencoded (only /auth/login needs this - it's an
    // OAuth2PasswordRequestForm on the backend, not a JSON body)
    postUrlEncoded: (path, urlSearchParams, opts) => request(path, { ...opts, method: "POST", body: urlSearchParams, isUrlEncoded: true }),

    // raw response for binary payloads (note PDFs) where we need the blob
    // and don't want JSON parsing/city error assumptions to get in the way
    async getBlob(path, opts = {}, _authRetryAttempted = false, _recoveryAttempted = false) {
        let token = null;

        try {
            token = window.Session
                ? await Session.ensureAccessToken()
                : null;
        } catch (err) {
            if (err?.status === 401 && window.Session) {
                await Session.forceLogout("refresh_failed");
            }
            throw new ApiError(
                err?.status || 0,
                err?.message || "Your session expired. Please log in again.",
                err?.detail
            );
        }

        let res;
        try {
            res = await fetch(`${CONFIG.API_HOST}${path}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
        } catch (err) {
            throw new ApiError(
                0,
                err?.name === "AbortError"
                    ? "Request timed out. Check your connection and try again."
                    : "Unable to connect. Check your connection and try again."
            );
        }

        if (res.status === 401 && !_authRetryAttempted && window.Session) {
            try {
                await Session.refreshAccess();
                return Api.getBlob(path, opts, true, _recoveryAttempted);
            } catch {
                await Session.forceLogout("unauthorized");
                throw new ApiError(401, "Your session expired. Please log in again.");
            }
        }

        if (!res.ok) {
            let detail = null;
            try { detail = (await res.json()).detail; } catch {}
            throw new ApiError(res.status, friendlyMessage(res.status, detail), detail);
        }

        return res.blob();
    },

    // Unified protected file endpoint. Images and PDFs are both streamed
    // from /storage/{storage_id}/download.
    getStorageBlob(storageId, opts = {}) {
        if (!Number.isInteger(Number(storageId)) || Number(storageId) <= 0) {
            return Promise.reject(new ApiError(400, "Invalid storage ID."));
        }
        return Api.getBlob(`/storage/${encodeURIComponent(Number(storageId))}/download`, opts);
    },
};

window.ApiError = ApiError;
window.Api = Api;
