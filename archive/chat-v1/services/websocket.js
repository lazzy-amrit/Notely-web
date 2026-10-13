// ------------------------------------------------------------------
// services/websocket.js
// ------------------------------------------------------------------
// Wraps the backend's single /ws/notifications socket (Chat/notification.py).
// This is intentionally the ONLY WebSocket in the app — it carries:
//   - "group_message"   (new group message)
//   - "direct_message"  (new DM)
//   - "typing"           (typing indicator, both group + DM)
//   - "group_invite"    (someone invited you to a group)
//   - "dm_request" / "message_request" (new direct-message request)
//   - "notification"   (generic notification envelope, if the backend sends one)
//
// Anything else in the UI that wants realtime updates subscribes via
// WS.on(type, handler) instead of opening its own socket.
// ------------------------------------------------------------------

const WS = {
    _socket: null,
    _handlers: {},       // type -> [handler, ...]
    _reconnectDelay: 1000,
    _maxReconnectDelay: 15000,
    _manuallyClosed: false,
    _typingTimers: {},   // key -> last-sent timestamp, for throttling
    _typingStopTimers: {},
    _reconnectTimer: null,
    _lifecycleBound: false,

    async connect() {
        if (!(await Session.isLoggedIn())) return;

        clearTimeout(this._reconnectTimer);
        this._manuallyClosed = false;

        // Make sure the socket is authenticated with a current access JWT.
        let token;
        try {
            token = await Session.ensureAccessToken();
        } catch {
            return;
        }

        if (!token) return;

        // Don't create duplicate sockets when a reconnect and bootstrap race.
        if (this._socket && (
            this._socket.readyState === WebSocket.OPEN ||
            this._socket.readyState === WebSocket.CONNECTING
        )) return;

        this._bindLifecycle();
        // IMPORTANT: browser WebSocket cannot set custom headers on the
        // handshake at all (this isn't a library limitation — it's a
        // platform restriction), so the token has to travel some other
        // way. Verified against auth/jwt_utilis.py: get_current_user_ws
        // already reads the token from the query string
        // (websocket.query_params.get("token")), so sending it as a
        // query param here is the correct, already-supported way to
        // authenticate this socket — no backend change needed.
        const url = `${CONFIG.WS_HOST}/ws/notifications?token=${encodeURIComponent(token || "")}`;

        try {
            this._socket = new WebSocket(url, []);
        } catch {
            this._scheduleReconnect();
            return;
        }

        this._socket.addEventListener("open", () => {
            this._reconnectDelay = 1000;
        });

        this._socket.addEventListener("message", (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch {
                return;
            }
            // Keep the local latest-20 message cache in sync with the live
            // stream, so reopening a conversation is instant and does not
            // briefly show an old history.
            if (window.CacheService && data.type === "group_message" && data.group_id) {
                CacheService.appendMessage(`/chat/group/${data.group_id}/messages?limit=20`, {
                    id: data.message_id, sender_id: data.sender_id,
                    sender_name: data.sender_name, sender_username: data.sender_username,
                    sender_profile_pic: data.sender_profile_pic, content: data.content,
                    created_at: data.created_at, reactions: data.reactions || [],
                });
            }
            if (window.CacheService && data.type === "direct_message" && data.sender_id) {
                CacheService.appendMessage(`/chat/dm/${data.sender_id}/messages?limit=20`, {
                    id: data.message_id, sender_id: data.sender_id,
                    sender_name: data.sender_name, sender_username: data.sender_username,
                    sender_profile_pic: data.sender_profile_pic, content: data.content,
                    created_at: data.created_at, reactions: data.reactions || [],
                });
            }
            this._dispatch(data.type, data);
        });

        this._socket.addEventListener("close", () => {
            if (!this._manuallyClosed) this._scheduleReconnect();
        });

        this._socket.addEventListener("error", () => {
            this._socket?.close();
        });
    },

    _scheduleReconnect() {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(async () => {
            this._reconnectTimer = null;
            if (!this._manuallyClosed && await Session.isLoggedIn()) {
                this.connect();
            }
        }, this._reconnectDelay);
        this._reconnectDelay = Math.min(
            this._reconnectDelay * 1.7,
            this._maxReconnectDelay
        );
    },

    _bindLifecycle() {
        if (this._lifecycleBound) return;
        this._lifecycleBound = true;

        // pagehide/beforeunload are the reliable browser lifecycle
        // signals for this.
        window.addEventListener("pagehide", () => this.disconnect());
        window.addEventListener("beforeunload", () => this.disconnect());
        window.addEventListener("pageshow", () => {
            if (this._manuallyClosed) this.connect();
        });
    },

    disconnect() {
        this._manuallyClosed = true;
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;

        Object.values(this._typingStopTimers).forEach(clearTimeout);
        this._typingStopTimers = {};
        this._typingTimers = {};

        const socket = this._socket;
        this._socket = null;

        if (socket && socket.readyState !== WebSocket.CLOSED) {
            try { socket.close(1000, "app stopped"); } catch {}
        }
    },

    isConnected() {
        return this._socket && this._socket.readyState === WebSocket.OPEN;
    },

    on(type, handler) {
        (this._handlers[type] ||= []).push(handler);
        return () => {
            this._handlers[type] = (this._handlers[type] || []).filter(h => h !== handler);
        };
    },

    _dispatch(type, payload) {
        (this._handlers[type] || []).forEach(h => {
            try { h(payload); } catch (e) { console.error("WS handler error:", e); }
        });
    },

    // Typing is sent over the existing authenticated socket.
    // A small debounce keeps it realtime without flooding the server.
    sendTyping({ groupId, receiverId }) {
        if (!this.isConnected()) return;
        const key = groupId ? `g:${groupId}` : `d:${receiverId}`;
        const now = Date.now();
        if (!this._typingTimers[key] || now - this._typingTimers[key] >= 900) {
            this._typingTimers[key] = now;
            this._socket.send(JSON.stringify({
                type: "typing",
                group_id: groupId ?? undefined,
                receiver_id: receiverId ?? undefined,
                typing: true,
            }));
        }
        clearTimeout(this._typingStopTimers[key]);
        this._typingStopTimers[key] = setTimeout(() => {
            if (!this.isConnected()) return;
            this._socket.send(JSON.stringify({
                type: "typing",
                group_id: groupId ?? undefined,
                receiver_id: receiverId ?? undefined,
                typing: false,
            }));
        }, 1200);
    },

    stopTyping({ groupId, receiverId }) {
        if (!this.isConnected()) return;
        const key = groupId ? `g:${groupId}` : `d:${receiverId}`;
        clearTimeout(this._typingStopTimers[key]);
        this._socket.send(JSON.stringify({
            type: "typing",
            group_id: groupId ?? undefined,
            receiver_id: receiverId ?? undefined,
            typing: false,
        }));
    },

};

window.WS = WS;
