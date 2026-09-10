// ------------------------------------------------------------------
// services/notifications.js — app-wide notification center
// ------------------------------------------------------------------
// Realtime events arrive through the single WS connection. This service
// turns them into a persistent in-app notification list, unread count,
// toast/ring alerts, and optional browser notifications.
// ------------------------------------------------------------------

const NotificationService = {
    _items: [],
    _knownIds: new Set(),
    _storageKey: null,
    _maxItems: 100,
    _requestIds: new Set(),
    _inviteIds: new Set(),
    _soundReady: false,
    _vibrateKey: "notely_vibrate_enabled",
    _unreadCounts: {},
    _unreadKey: null,
    _lastSeenAt: {},
    _lastSeenKey: null,
    _coldFlags: {},

    async init() {
        const user = await Session.getUser();
        const identity = user?.id ?? user?.username ?? "current";
        this._storageKey = `notely_notifications_${identity}`;
        this._unreadKey = `notely_unread_${identity}`;
        this._lastSeenKey = `notely_lastseen_${identity}`;
        this._loadUnread();
        this._loadLastSeen();
        this._load();
        this._bindRealtime();
        this._warmGroups();

        // Reconcile missed invites/requests once at startup. Live changes
        // are delivered by the backend WebSocket; there is intentionally no
        // polling loop anymore.
        this.refreshPending();
    },

    async _warmGroups() {
        try {
            const groups = await GroupsApi.list();
            (groups || []).forEach(group => EntityCache.rememberGroup(group));
        } catch { /* notification labels can fall back gracefully */ }
    },

    _load() {
        try {
            const raw = localStorage.getItem(this._storageKey);
            const parsed = raw ? JSON.parse(raw) : [];
            this._items = Array.isArray(parsed) ? parsed.slice(0, this._maxItems) : [];
        } catch {
            this._items = [];
        }
        this._knownIds = new Set(this._items.map(item => item.id));
    },

    _save() {
        localStorage.setItem(this._storageKey, JSON.stringify(this._items.slice(0, this._maxItems)));
    },

    _bindRealtime() {
        WS.on("group_message", data => {
            const groupId = data.group_id;
            const group = EntityCache.getGroup(groupId);
            const groupName = data.group_name || group?.name || "a group";
            const currentHash = location.hash;
            const isOpen = currentHash === `#/messages/group/${groupId}`;
            if (isOpen) return;
            this._bumpUnread("group", groupId);

            this.add({
                id: this._eventId("group_message", data.message_id, `${groupId}:${data.created_at || ""}`),
                type: "group_message",
                title: `New message from ${groupName}`,
                body: data.content || "You have a new group message.",
                icon: "groups",
                route: `messages/group/${groupId}`,
            });
        });

        WS.on("direct_message", data => {
            const senderId = data.sender_id;
            const sender = data.sender || EntityCache.getUser(senderId);
            const isOpen = location.hash === `#/messages/dm/${senderId}`;
            if (isOpen) return;
            this._bumpUnread("dm", senderId);

            const senderName = data.sender_name || sender?.name || sender?.username || "Someone";
            this.add({
                id: this._eventId("direct_message", data.message_id, `${senderId}:${data.created_at || ""}`),
                type: "direct_message",
                title: `New message from ${senderName}`,
                body: data.content || "You have a new direct message.",
                icon: "chat",
                route: `messages/dm/${senderId}`,
            });
        });

        WS.on("group_invite", data => {
            this.add({
                id: this._eventId("group_invite", data.invite_id ?? data.id, `${data.group_id || ""}:${data.group_name || ""}`),
                type: "group_invite",
                title: `Group invite from ${data.sender_username || "someone"}`,
                body: data.group_name ? `You've been invited to ${data.group_name}.` : "You have a new group invite.",
                icon: "group_add",
                meta: { inviteId: data.invite_id ?? data.id, groupId: data.group_id, groupName: data.group_name, senderUsername: data.sender_username, senderId: data.sender_id },
            });
        });

        const handleRequest = data => {
            const requesterId = data.requester_id ?? data.sender_id ?? data.user_id;
            this.add({
                id: this._eventId("dm_request", data.id, String(requesterId || "")),
                type: "dm_request",
                title: `New message request${data.sender_username ? ` from ${data.sender_username}` : ""}`,
                body: "Someone wants to start a direct conversation with you.",
                icon: "mark_chat_unread",
                meta: { requestId: data.id, senderId: requesterId, senderUsername: data.sender_username },
            });
        };
        WS.on("dm_request", handleRequest);
        WS.on("message_request", handleRequest);
        WS.on("notification", data => {
            if (data?.type === "dm_request" || data?.type === "message_request") handleRequest(data);
        });
    },

    // Defaults on: only an explicit "0" written by setVibrateEnabled turns
    // it off, so existing installs (nothing written yet) keep today's
    // always-vibrate behaviour.
    vibrateEnabled() {
        return localStorage.getItem(this._vibrateKey) !== "0";
    },

    setVibrateEnabled(enabled) {
        localStorage.setItem(this._vibrateKey, enabled ? "1" : "0");
    },

    // ---- Per-conversation unread badges (Instagram-style "1", "9+" on
    // the inbox row) ----
    // Counts only what this device has seen arrive live over the socket
    // since a thread was last opened — there's no unread_count field
    // coming back from the backend's inbox endpoints, so this can't
    // reconstruct an exact count of what piled up while the app was
    // fully closed (a push arriving doesn't carry a running total, just
    // that one message).
    //
    // What we CAN reconstruct on a cold start: whether *anything at all*
    // arrived since we last opened a thread, by comparing the inbox
    // list's last_message_at (from /chat/dms or /chats/groups) against a
    // locally-stored "last seen" timestamp per conversation. That can
    // only ever be a dot, not a number — see flagColdUnread /
    // unreadDisplay below.
    _loadUnread() {
        try { this._unreadCounts = JSON.parse(localStorage.getItem(this._unreadKey) || "{}") || {}; }
        catch { this._unreadCounts = {}; }
    },

    _saveUnread() {
        localStorage.setItem(this._unreadKey, JSON.stringify(this._unreadCounts));
    },

    _loadLastSeen() {
        try { this._lastSeenAt = JSON.parse(localStorage.getItem(this._lastSeenKey) || "{}") || {}; }
        catch { this._lastSeenAt = {}; }
    },

    _saveLastSeen() {
        localStorage.setItem(this._lastSeenKey, JSON.stringify(this._lastSeenAt));
    },

    _bumpUnread(kind, id) {
        const key = `${kind}:${id}`;
        this._unreadCounts[key] = (this._unreadCounts[key] || 0) + 1;
        this._saveUnread();
        document.dispatchEvent(new CustomEvent("notely:unread-changed", { detail: { kind, id } }));
    },

    unreadForConversation(kind, id) {
        return this._unreadCounts[`${kind}:${id}`] || 0;
    },

    // Call this once per conversation after fetching the inbox list
    // (currently only meaningful for DMs — see note above), passing the
    // thread's last_message_at from the backend. If that's newer than
    // the last time this device marked the thread read, and we don't
    // already have a live exact count running for it, flag a dot.
    //
    // A conversation with no stored lastSeenAt yet (first time this
    // device has ever seen it) is intentionally left unflagged rather
    // than dotted — otherwise every existing thread would light up the
    // very first time this code runs on a device, which isn't "new",
    // it's just "never tracked before."
    flagColdUnread(kind, id, lastMessageAt) {
        if (!lastMessageAt) return;
        const key = `${kind}:${id}`;
        const seenAt = this._lastSeenAt[key];
        if (!seenAt) return;
        if (this._unreadCounts[key]) return;
        if (new Date(lastMessageAt).getTime() <= seenAt) return;
        if (this._coldFlags[key]) return;
        this._coldFlags[key] = true;
        document.dispatchEvent(new CustomEvent("notely:unread-changed", { detail: { kind, id } }));
    },

    // What the inbox row should render: an exact count when we have one
    // (live, this session), otherwise a plain dot if flagColdUnread
    // caught something new since last open, otherwise nothing.
    unreadDisplay(kind, id) {
        const key = `${kind}:${id}`;
        const count = this._unreadCounts[key] || 0;
        if (count) return { count, dot: false };
        if (this._coldFlags[key]) return { count: 0, dot: true };
        return { count: 0, dot: false };
    },

    markConversationRead(kind, id) {
        const key = `${kind}:${id}`;
        this._lastSeenAt[key] = Date.now();
        this._saveLastSeen();
        const hadLive = !!this._unreadCounts[key];
        const hadCold = !!this._coldFlags[key];
        delete this._unreadCounts[key];
        delete this._coldFlags[key];
        if (hadLive) this._saveUnread();
        if (hadLive || hadCold) document.dispatchEvent(new CustomEvent("notely:unread-changed", { detail: { kind, id } }));
    },

    _eventId(type, primary, fallback = "") {
        return `${type}:${primary ?? fallback}`;
    },

    add(item, { silent = false } = {}) {
        if (!item?.id || this._knownIds.has(item.id)) return;
        const notification = {
            id: item.id,
            type: item.type || "general",
            title: item.title || "New notification",
            body: item.body || "",
            icon: item.icon || "notifications",
            route: item.route || null,
            meta: item.meta || {},
            createdAt: item.createdAt || new Date().toISOString(),
            read: false,
        };
        this._items.unshift(notification);
        this._items = this._items.slice(0, this._maxItems);
        this._knownIds.add(notification.id);
        this._save();
        this._updateBadges();
        if (!silent) this._alert(notification);
    },

    unreadCount() {
        return this._items.reduce((count, item) => count + (item.read ? 0 : 1), 0);
    },

    markAllRead() {
        this._items.forEach(item => { item.read = true; });
        this._save();
        this._updateBadges();
    },

    clearAll() {
        this._items = [];
        this._knownIds.clear();
        this._save();
        this._updateBadges();
    },

    syncBadge() {
        this._updateBadges();
    },

    _updateBadges() {
        const count = this.unreadCount();
        qsa("[data-notification-badge]").forEach(badge => {
            badge.textContent = count > 99 ? "99+" : String(count);
            badge.classList.toggle("hidden", count === 0);
        });
    },

    _alert(item) {
        Toast.show(item.title);
        this._ring();
        if (navigator.vibrate && this.vibrateEnabled()) navigator.vibrate([100, 50, 100]);

        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
                const notification = new Notification(item.title, {
                    body: item.body,
                    icon: "assets/images/logo.png",
                    badge: "assets/images/logo.png",
                    tag: item.id,
                });
                notification.onclick = () => {
                    window.focus();
                    if (item.route) Router.go(item.route);
                    notification.close();
                };
            } catch { /* browser may not expose web notifications */ }
        }
    },

    async enableDeviceAlerts() {
        this._soundReady = true;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const ctx = new AudioCtx();
                await ctx.resume();
                ctx.close();
            }
        } catch { /* sound is optional */ }

        if (typeof Notification !== "undefined" && Notification.permission === "default") {
            try { await Notification.requestPermission(); } catch { /* optional */ }
        }
    },

    _ring() {
        if (!this._soundReady) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(880, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.16);
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
            oscillator.connect(gain).connect(ctx.destination);
            oscillator.start();
            oscillator.stop(ctx.currentTime + 0.2);
            oscillator.addEventListener("ended", () => ctx.close(), { once: true });
        } catch { /* sound is optional */ }
    },

    async refreshPending() {
        if (!(await Session.isLoggedIn())) return;
        try {
            const [requests, invites] = await Promise.all([
                MessagesApi.getPendingDmRequests(),
                GroupsApi.invites(),
            ]);

            (requests || []).forEach(request => {
                const requestId = request.id;
                if (requestId === undefined || requestId === null) return;
                const senderId = request.sender_id ?? request.requester_id;
                const sender = request.sender || EntityCache.getUser(senderId);
                if (!sender) {
                    // Keep the cache neutral; the notification can still be shown.
                }
                this.add({
                    id: `dm_request:${requestId}`,
                    type: "dm_request",
                    title: `New message request${sender?.name ? ` from ${sender.name}` : ""}`,
                    body: "Someone wants to start a direct conversation with you.",
                    icon: "mark_chat_unread",
                    meta: { requestId, senderId, senderUsername: sender?.username, senderName: sender?.name, senderProfilePic: sender?.profile_pic },
                }, { silent: this._requestIds.has(String(requestId)) });
                this._requestIds.add(String(requestId));
            });

            (invites || []).forEach(invite => {
                const inviteId = invite.id;
                if (inviteId === undefined || inviteId === null) return;
                this.add({
                    id: `group_invite:${inviteId}`,
                    type: "group_invite",
                    title: `Group invite from ${invite.sender_username || "someone"}`,
                    body: invite.group_name ? `You've been invited to ${invite.group_name}.` : "You have a new group invite.",
                    icon: "group_add",
                    meta: { inviteId, groupId: invite.group_id, groupName: invite.group_name, senderUsername: invite.sender_username },
                }, { silent: this._inviteIds.has(String(inviteId)) });
                this._inviteIds.add(String(inviteId));
            });
        } catch {
            // Notification refresh must never break the rest of the app.
        }
    },

    async openCenter() {
        await this.enableDeviceAlerts();
        this.markAllRead();
        this._renderCenter();
    },

    _renderCenter() {
        const list = this._items.length
            ? h("div", { className: "notification-list" }, this._items.map(item => this._notificationRow(item)))
            : EmptyState({ icon: "notifications_none", title: "You're all caught up 🎉", subtitle: "New messages, requests and invites will appear here." });

        const content = h("div", { className: "notification-center" }, [
            h("div", { className: "notification-center-head" }, [
                h("div", {}, [
                    h("div", { className: "sheet-handle" }),
                    h("h3", {}, "Notifications"),
                ]),
                this._items.length ? h("button", { className: "btn btn-ghost btn-sm", onClick: () => { this.clearAll(); this._renderCenter(); } }, "Clear all") : null,
            ]),
            list,
        ]);
        Sheet.open(content, { onClose: () => this._updateBadges() });
    },

    // Instant accept/decline: the row settles in place the moment you
    // tap (no full notification-center re-render, no wait), the request
    // confirms in the background, and a failure un-locks the row with an
    // error toast instead of leaving the tap looking like it did nothing.
    _respond(row, item, { action, onSuccess }) {
        Optimistic.run({
            timeoutMs: 20000,
            apply: () => row.classList.add("optimistic-busy"),
            action,
            revert: () => row.classList.remove("optimistic-busy"),
            reconcile: () => { row.remove(); this._remove(item.id); onSuccess?.(); },
            onError: () => Toast.error("That didn't go through. Check your connection and try again."),
        });
    },

    _notificationRow(item) {
        const row = h("div", { className: `notification-row ${item.read ? "" : "unread"}` });

        const openThread = () => {
            this._remove(item.id);
            Sheet.close();
            if (item.type === "dm_request") Router.go(`messages/dm/${item.meta?.senderId}`);
            else if (item.type === "group_invite") Router.go("messages");
            else if (item.route) Router.go(item.route);
        };

        const actions = [];
        if (item.type === "dm_request" && item.meta?.requestId !== undefined && item.meta?.requestId !== null) {
            actions.push(h("button", {
                className: "btn btn-sm btn-primary",
                onClick: () => this._respond(row, item, {
                    action: () => MessagesApi.respondToDmRequest(item.meta.requestId, "accepted"),
                    onSuccess: () => { Sheet.close(); if (item.meta?.senderId != null) Router.go(`messages/dm/${item.meta.senderId}`); Toast.success("Conversation accepted"); },
                }),
            }, "Accept"));
            actions.push(h("button", {
                className: "btn btn-sm btn-ghost",
                onClick: () => this._respond(row, item, {
                    action: () => MessagesApi.respondToDmRequest(item.meta.requestId, "declined"),
                }),
            }, "Decline"));
        } else if (item.type === "group_invite" && item.meta?.inviteId !== undefined && item.meta?.inviteId !== null) {
            actions.push(h("button", {
                className: "btn btn-sm btn-primary",
                onClick: () => this._respond(row, item, {
                    action: () => GroupsApi.respondToInvite(item.meta.inviteId, "accepted"),
                    onSuccess: () => { Sheet.close(); Router.go("messages"); Toast.success("Joined group"); },
                }),
            }, "Accept"));
            actions.push(h("button", {
                className: "btn btn-sm btn-ghost",
                onClick: () => this._respond(row, item, {
                    action: () => GroupsApi.respondToInvite(item.meta.inviteId, "declined"),
                }),
            }, "Decline"));
        }

        if (!actions.length) row.addEventListener("click", openThread);
        row.appendChild(h("div", { className: `notification-icon type-${item.type}` }, [h("span", { className: "material-symbols-rounded" }, item.icon)]));
        row.appendChild(h("div", { className: "notification-content" }, [
            h("div", { className: "notification-title" }, item.title),
            h("div", { className: "notification-body" }, item.body),
            h("div", { className: "notification-time" }, timeAgo(item.createdAt)),
            actions.length ? h("div", { className: "notification-actions" }, actions) : null,
        ]));
        if (!item.read) row.appendChild(h("span", { className: "notification-dot" }));
        return row;
    },

    _remove(id) {
        this._items = this._items.filter(item => item.id !== id);
        this._knownIds.delete(id);
        this._save();
        this._updateBadges();
    },
};

window.NotificationService = NotificationService;
