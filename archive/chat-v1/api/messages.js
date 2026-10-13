// ------------------------------------------------------------------
// api/messages.js — wraps Chat/messages.py
//
// Covers group messages, DM messages, the DM privacy wall, and
// message deletion. Realtime delivery (new message / typing) rides
// the single /ws/notifications socket — see services/websocket.js —
// this module is only the REST history/send/delete side.
// ------------------------------------------------------------------

const MessagesApi = {
    // POST /chat/group/{groupId}/messages {content}
    async sendGroup(groupId, content) {
        const sent = await Api.post(`/chat/group/${groupId}/messages`, { content });
        CacheService?.appendMessage?.(`/chat/group/${groupId}/messages?limit=20`, sent);
        return sent;
    },

    // GET /chat/group/{groupId}/messages?limit=&before_id=
    // before_id pages backwards for infinite-scroll-up ("load more" as the
    // user scrolls toward older messages) instead of fetching the whole
    // thread at once — see ChatPage._loadMoreHistory. Assumes the backend
    // accepts before_id the same way it already accepts limit; if it
    // doesn't yet, this param is simply ignored server-side and every
    // "page" just refetches the latest `limit` messages instead of older
    // ones — worth a quick check against the actual route.
    getGroupHistory(groupId, limit = 20, beforeId = null) {
        const q = beforeId ? `?limit=${limit}&before_id=${beforeId}` : `?limit=${limit}`;
        return Api.get(`/chat/group/${groupId}/messages${q}`);
    },

    // POST /chat/dm/{receiverId}/messages {content}
    async sendDirect(receiverId, content) {
        const sent = await Api.post(`/chat/dm/${receiverId}/messages`, { content });
        CacheService?.appendMessage?.(`/chat/dm/${receiverId}/messages?limit=20`, sent);
        return sent;
    },

    // GET /chat/dm/{otherUserId}/messages?limit=&before_id=
    getDirectHistory(otherUserId, limit = 20, beforeId = null) {
        const q = beforeId ? `?limit=${limit}&before_id=${beforeId}` : `?limit=${limit}`;
        return Api.get(`/chat/dm/${otherUserId}/messages${q}`);
    },

    listDirectThreads() {
        return Api.get("/chat/dms");
    },

    // GET /chat/dm-requests  — pending requests targeting the current user
    getPendingDmRequests() {
        return Api.get("/chat/dm-requests");
    },

    // POST /chat/dm-requests/{requestId} {action: "accepted"|"declined"}
    respondToDmRequest(requestId, action) {
        return Api.post(`/chat/dm-requests/${requestId}`, { action });
    },

    // DELETE /chat/messages/{messageId}
    async deleteMessage(messageId) {
        const result = await Api.delete(`/chat/messages/${messageId}`);
        // The current chat page also removes the row immediately; this keeps
        // the persistent history from resurrecting the deleted message.
        CacheService?.invalidate?.("/chat/group/");
        CacheService?.invalidate?.("/chat/dm/");
        return result;
    },

    // POST /chat/messages/{messageId}/reactions {emoji}
    // Toggles the current user's reaction: same emoji again removes it,
    // a different emoji replaces it. Returns the message's full,
    // persisted reaction list.
    react(messageId, emoji) {
        return Api.post(`/chat/messages/${messageId}/reactions`, { emoji });
    },
};

window.MessagesApi = MessagesApi;
