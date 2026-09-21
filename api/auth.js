// ------------------------------------------------------------------
// api/auth.js — wraps every endpoint in auth/Authentication.py,
// Account/account.py and Account/profile.py
// ------------------------------------------------------------------

const AuthApi = {
    // POST /auth/register  (JSON: name, username, password, email, role,
    // + school_name/subjects/contact_number/incharge when role === "teacher")
    register(payload) {
        return Api.post("/auth/register", payload, { skipAuth: true });
    },

    // POST /auth/resend  (email is a query param on the backend, not a body)
    resend(email) {
        return Api.post(`/auth/resend?email=${encodeURIComponent(email)}`, undefined, { skipAuth: true });
    },

    // POST /auth/verify_otp  (JSON: email, otp)
    verifyOtp(email, otp) {
        return Api.post("/auth/verify_otp", { email, otp }, { skipAuth: true });
    },

    // POST /auth/login  — backend expects OAuth2PasswordRequestForm
    // (application/x-www-form-urlencoded, fields: username, password)
    async login(username, password) {
        const body = new URLSearchParams();
        body.append("username", username);
        body.append("password", password);
        const data = await Api.postUrlEncoded("/auth/login", body, { skipAuth: true });
        await Session.setTokens(data);
        return data;
    },

    // GET /auth/me — cache-first
    async me() {
        const user = await CacheService.getOrFetch("/auth/me", () => Api.get("/auth/me"));
        await Session.setUser(user);
        return user;
    },

    // GET /auth/check_username?username=
    checkUsername(username) {
        return Api.get(`/auth/check_username?username=${encodeURIComponent(username)}`, { skipAuth: true });
    },

    // DELETE /auth/delete  — password is a query param on the backend
    deleteAccount(password) {
        return Api.delete(`/auth/delete?password=${encodeURIComponent(password)}`);
    },

    // PATCH /auth/profile  (JSON: name?, username?, bio?, email?, school_name?, subjects?, contact_number?, incharge?)
    updateProfile(fields) {
        return Api.patch("/auth/profile", fields);
    },

    // PATCH /auth/profile  (JSON: email) — the existing profile endpoint
    updateEmail(email) {
        return Api.patch("/auth/profile", { email });
    },

    // PATCH /auth/password  (JSON: old_password, new_password)
    changePassword(oldPassword, newPassword) {
        return Api.patch("/auth/password", { old_password: oldPassword, new_password: newPassword });
    },

    // PATCH /account/forgot_pass?email=  (query param, no body)
    forgotPassword(email) {
        return Api.patch(`/account/forgot_pass?email=${encodeURIComponent(email)}`, undefined, { skipAuth: true });
    },

    // POST /account/verify_otp  (JSON: email, otp, new_password, confirm_password)
    resetPassword(email, otp, newPassword, confirmPassword) {
        return Api.post("/account/verify_otp", {
            email,
            otp,
            new_password: newPassword,
            confirm_password: confirmPassword,
        }, { skipAuth: true });
    },

    // POST /auth/profile/picture  (multipart, field name "file")
    async uploadProfilePicture(file) {
        const form = new FormData();
        file = await FileCompression.compressImageForUpload(file, { maxDimension: 768, quality: 0.72, maxBytes: 220 * 1024 });
        form.append("file", file);
        const result = await Api.upload("/auth/profile/picture", form);
        CacheService?.invalidate?.("/auth/me");
        return result;
    },

    async logout() {
        await Session.forceLogout("manual");
    },
};

window.AuthApi = AuthApi;
