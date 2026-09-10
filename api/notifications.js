// ------------------------------------------------------------------
// api/notifications.js — wraps Push/tokens.py
// ------------------------------------------------------------------
// A device token belongs to one app install on one device, not to an
// account (see backend Push/tokens.py) - register on login/refresh,
// unregister on logout so a signed-out device stops getting push for
// the account that just left it.
// ------------------------------------------------------------------

const NotificationsApi = {
    registerToken(token) {
        return Api.post("/notifications/register-token", { token });
    },
    unregisterToken(token) {
        return Api.delete("/notifications/register-token", { body: { token } });
    },
};
window.NotificationsApi = NotificationsApi;
