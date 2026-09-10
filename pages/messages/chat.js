const EMOJIS = ["😀","😂","😍","🥹","😎","🤝","🔥","❤️","💯","👏","🎉","✨","🙌","👍","👀","😭","😅","🤔","😮","😴","🚀","💜","🫶","😈","🥳","🤌","🙏","💀","🌟","🎯","📚","☕","🍕","🎮","⚡","💬","😊","😉","😇","😋","😜","🤗","😌","😏","🤩","😢","😤","😡","🤯","🥲"];
const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
const LONG_PRESS_MS = 3000;

const ChatPage = {
    _unsubs: [], _mode: null, _id: null, _typingTimeout: null, _typingNames: new Set(), _groupDetail: null, _messagesById: {},

    _cleanup() {
        this._unsubs.forEach(fn => fn()); this._unsubs = []; clearTimeout(this._typingTimeout); this._typingNames.clear(); this._messagesById = {};
    },

    async renderGroup(container, groupId) {
        this._cleanup(); this._mode = "group"; this._id = groupId; this._lastMsgKey = null; this._lastTheirsAvatarSlot = null;
        this._hasMoreHistory = true; this._loadingOlder = false; this._oldestLoadedId = null; this._topMsgKey = null; this._topTheirsAvatarSlot = null;
        NotificationService?.markConversationRead?.("group", groupId);
        let group = EntityCache.getGroup(groupId);
        try { group = await GroupsApi.detail(groupId); EntityCache.rememberGroup(group); this._groupDetail = group; } catch (err) { if (!group) Toast.fromApiError(err); }
        // Part 16 — announcement groups: only the Owner/Admin may post;
        // everyone else is read + react only. Gated here (not just on
        // the backend) so a Member never even sees a composer to type into.
        const isAnnouncement = group && ["Annoucements", "Announcements"].includes(group.typeo || group.type);
        const canSend = !isAnnouncement || ["Owner", "Admin"].includes(group?.my_role);
        await this._renderShell(container, group?.name || "Group", async () => MessagesApi.getGroupHistory(groupId, 20), { avatarName: group?.name || "Group", avatarPic: group?.profile_pic, subtitle: group?.member_count ? `${group.member_count} members` : "Group chat", onHeader: () => this._openGroupDetails(groupId), canSend, loadOlder: beforeId => MessagesApi.getGroupHistory(groupId, 20, beforeId) });
        this._unsubs.push(WS.on("group_message", data => {
            if (String(data.group_id) !== String(groupId)) return;
            const sender = { id: data.sender_id, name: data.sender_name, username: data.sender_username, profile_pic: data.sender_profile_pic };
            EntityCache.rememberUser(sender); this._appendMessage({ id: data.message_id, sender_id: data.sender_id, sender, sender_name: data.sender_name, sender_profile_pic: data.sender_profile_pic, content: data.content, created_at: data.created_at });
        }));
        this._unsubs.push(WS.on("typing", data => {
            // Tolerate either naming style from the backend (group_id or
            // groupId, user_id/sender_id or userId) so a mismatch there
            // can't be the reason this silently never fires.
            const evtGroupId = data.group_id ?? data.groupId;
            const evtUserId = data.user_id ?? data.sender_id ?? data.userId;
            if (evtGroupId && String(evtGroupId) === String(groupId) && String(evtUserId) !== String(this._currentUserId)) {
                if (data.typing === false) this._hideTyping();
                else this._showTyping(data.user_name || data.username || data.sender_name || "Someone");
            }
        }));
        this._unsubs.push(WS.on("reactions_updated", data => {
            if (String(data.group_id) !== String(groupId)) return;
            this._applyReactions(data.message_id, data.reactions);
        }));
    },

    async renderDm(container, otherUserId) {
        this._cleanup(); this._mode = "dm"; this._id = otherUserId; this._lastMsgKey = null; this._lastTheirsAvatarSlot = null; this._dmUser = null;
        this._hasMoreHistory = true; this._loadingOlder = false; this._oldestLoadedId = null; this._topMsgKey = null; this._topTheirsAvatarSlot = null;
        NotificationService?.markConversationRead?.("dm", otherUserId);
        let user = EntityCache.getUser(otherUserId);
        try { user = await UsersApi.get(otherUserId); EntityCache.rememberUser(user); RecentDmStore?.remember?.(user); } catch (err) { if (!user) Toast.fromApiError(err); }
        if (user) { this._dmUser = user; RecentDmStore?.remember?.(user); }
        await this._renderShell(container, user?.name || "Direct message", async () => MessagesApi.getDirectHistory(otherUserId, 20), { avatarName: user?.name || user?.username || "?", avatarPic: user?.profile_pic, subtitle: user?.username ? `@${user.username}` : null, onHeader: () => openProfilePreview(user || { id: otherUserId, username: "user" }, { onMessage: null }), loadOlder: beforeId => MessagesApi.getDirectHistory(otherUserId, 20, beforeId) });
        this._unsubs.push(WS.on("direct_message", data => {
            if (String(data.sender_id) !== String(otherUserId)) return;
            const sender = { id: data.sender_id, name: data.sender_name, username: data.sender_username, profile_pic: data.sender_profile_pic };
            EntityCache.rememberUser(sender); this._appendMessage({ id: data.message_id, sender_id: data.sender_id, sender, content: data.content, created_at: data.created_at });
        }));
        this._unsubs.push(WS.on("typing", data => {
            const evtGroupId = data.group_id ?? data.groupId;
            const evtUserId = data.user_id ?? data.sender_id ?? data.userId;
            if (!evtGroupId && String(evtUserId) === String(otherUserId)) {
                if (data.typing === false) this._hideTyping();
                else this._showTyping(data.user_name || data.username || data.sender_name || user?.name || "Someone");
            }
        }));
        this._unsubs.push(WS.on("reactions_updated", data => {
            if (data.group_id) return;
            if (String(data.sender_id) !== String(otherUserId) && String(data.receiver_id) !== String(otherUserId)) return;
            this._applyReactions(data.message_id, data.reactions);
        }));
    },

    async _renderShell(container, title, loadHistory, { avatarName, avatarPic, subtitle, onHeader, canSend = true, loadOlder = null } = {}) {
        container.classList.add("chat-page");
        const user = await Session.getUser(); this._currentUserId = user?.id;
        const titleWrap = subtitle ? h("div", { className: "chat-header-text" }, [h("h1", {}, title), h("span", { className: "chat-header-sub" }, subtitle)]) : h("h1", {}, title);
        const header = h("div", { className: "chat-topbar" }, [
            h("button", { className: "back-btn", onClick: () => Router.goBack("messages") }, [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("button", { className: "chat-identity", onClick: onHeader }, [Avatar(avatarName || title, avatarPic, "sm"), titleWrap]),
            this._mode === "group" ? h("button", { className: "btn-icon", onClick: onHeader }, [h("span", { className: "material-symbols-rounded" }, "info")]) : null,
        ]);
        const scroll = h("div", { className: "chat-scroll", id: "chat-scroll" });
        // Sits above the earliest loaded message at all times; scrolling
        // near it is what triggers _loadMoreHistory. Never removed from
        // the DOM — just shown/hidden — so it's always a stable
        // insertBefore anchor for prepended pages.
        const topLoader = h("div", { className: "inline-loading history-loader hidden" }, [h("span", { className: "material-symbols-rounded spin" }, "progress_activity"), " Loading earlier messages…"]);
        this._topLoaderEl = topLoader;
        mount(scroll, topLoader);
        const typingIndicator = h("div", { id: "typing-indicator", className: "typing-status hidden" }, "Someone is typing…");
        const textarea = h("textarea", { placeholder: "Message…", rows: "1" });
        const emojiDock = h("div", { className: "emoji-dock", id: "emoji-dock" }, EMOJIS.map(emoji => h("button", {
            type: "button",
            onClick: () => { textarea.value += emoji; textarea.dispatchEvent(new Event("input")); this._focusComposer(textarea); },
        }, emoji)));
        const emojiBtn = h("button", {
            className: "composer-icon", type: "button",
            // Prevent the button's own mousedown from stealing focus off
            // the textarea — that focus-steal is what closes the native
            // keyboard on mobile the moment you tap the emoji icon.
            onMouseDown: e => e.preventDefault(),
            onClick: () => this._toggleEmojiDock(emojiBtn, emojiDock, textarea),
        }, [h("span", { className: "material-symbols-rounded" }, "mood")]);
        const sendBtn = h("button", {
            className: "send-btn", type: "button", disabled: "true",
            onMouseDown: e => e.preventDefault(),
        }, [h("span", { className: "material-symbols-rounded" }, "arrow_upward")]);
        const composer = h("div", { className: "composer" }, [emojiBtn, textarea, sendBtn]);
        const announcementNotice = h("div", { className: "dm-wall" }, [
            h("p", {}, "Only the group admin can post here. You can still react to messages."),
        ]);
        mount(container, header, scroll, typingIndicator, canSend ? composer : announcementNotice, canSend ? emojiDock : null);
        textarea.addEventListener("input", () => {
            sendBtn.disabled = textarea.value.trim().length === 0;
            textarea.style.height = "auto";
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
            WS.sendTyping(this._mode === "group" ? { groupId: this._id } : { receiverId: this._id });
        });
        // Tapping into the text field is how you ask for the native
        // keyboard back — so the in-app emoji dock steps aside for it,
        // the same swap WhatsApp/Instagram do.
        textarea.addEventListener("focus", () => this._closeEmojiDock(emojiBtn, emojiDock));
        textarea.addEventListener("blur", () => WS.stopTyping(this._mode === "group" ? { groupId: this._id } : { receiverId: this._id }));
        // Optimistic send: the message paints into the thread the instant
        // you hit send (no waiting on the network), then the POST happens
        // in the background. A 15s watchdog treats a request that never
        // comes back as failed and pulls the bubble rather than leaving a
        // "sending…" message stuck forever.
        const doSend = async () => {
            const content = textarea.value.trim(); if (!content) return;
            textarea.value = ""; sendBtn.disabled = true; textarea.style.height = "auto";

            const tempId = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            this._appendMessage({
                id: tempId,
                sender_id: this._currentUserId,
                content,
                created_at: new Date().toISOString(),
                reactions: [],
                _pending: true,
            });

            let settled = false;
            const watchdog = setTimeout(() => {
                if (settled) return;
                settled = true;
                this._removeMessageRow(tempId);
                Toast.error("Message didn't send. Check your connection and try again.");
            }, 15000);

            try {
                const sent = this._mode === "group" ? await MessagesApi.sendGroup(this._id, content) : await MessagesApi.sendDirect(this._id, content);
                if (settled) return; // already timed out and removed locally; drop the late reply
                clearTimeout(watchdog); settled = true;
                if (this._mode === "dm") RecentDmStore?.remember?.(this._dmUser);
                this._reconcileMessage(tempId, sent);
            } catch (err) {
                if (settled) return;
                clearTimeout(watchdog); settled = true;
                this._removeMessageRow(tempId);
                if (err.status === 403 && this._mode === "dm") this._showDmWall(err.detail); else Toast.fromApiError(err);
                sendBtn.disabled = textarea.value.trim().length === 0;
            }
            // Sending shouldn't dismiss the keyboard — you're usually about
            // to type the next line. Only re-focus if the emoji dock isn't
            // the thing the person is actively using.
            if (!emojiDock.classList.contains("open")) this._focusComposer(textarea);
        };
        sendBtn.addEventListener("click", doSend); textarea.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } });
        try {
            const history = await loadHistory();
            history.forEach(m => this._appendMessage(m, { skipScroll: true }));
            scroll.scrollTop = scroll.scrollHeight;
            // A short first page (fewer than 20) means there's nothing
            // older left to fetch — skip wiring the scroll listener
            // entirely rather than let it fire a request that'll just
            // come back empty every time.
            this._oldestLoadedId = history[0]?.id ?? null;
            this._hasMoreHistory = !!loadOlder && history.length >= 20;
            if (this._hasMoreHistory) {
                scroll.addEventListener("scroll", () => {
                    if (scroll.scrollTop < 80 && this._hasMoreHistory && !this._loadingOlder) this._loadMoreHistory(scroll, loadOlder);
                });
            }
        }
        catch (err) { if (err.status === 403 && this._mode === "dm") this._showDmWall(err.detail); else Toast.fromApiError(err); }
    },

    // Infinite-scroll-up: fetches the next 20 messages older than the
    // earliest one currently rendered and prepends them above it,
    // keeping the user's scroll position visually anchored (see the
    // scrollHeight diff below) instead of yanking the view around.
    async _loadMoreHistory(scroll, loadOlder) {
        this._loadingOlder = true;
        this._topLoaderEl.classList.remove("hidden");
        try {
            const older = await loadOlder(this._oldestLoadedId);
            if (!older || !older.length) { this._hasMoreHistory = false; return; }
            const heightBefore = scroll.scrollHeight;
            this._prependMessages(older, scroll);
            this._oldestLoadedId = older[0]?.id ?? this._oldestLoadedId;
            this._hasMoreHistory = older.length >= 20;
            scroll.scrollTop += scroll.scrollHeight - heightBefore;
        } catch (err) {
            Toast.fromApiError(err);
        } finally {
            this._loadingOlder = false;
            this._topLoaderEl.classList.add("hidden");
        }
    },

    // Renders a page of older messages (oldest→newest, same order the
    // backend already returns for the initial page) into a fragment and
    // inserts it in one shot just below the loader row — a single DOM
    // write instead of N, which matters once "N" can mean scrolling
    // through a thread with lakhs of messages in it. Clustering here is
    // scoped to the batch itself (its own top/bottom), not stitched onto
    // whatever cluster was already at the top of the list — a deliberate
    // small trade-off to keep pagination simple; worst case is one extra
    // avatar/name at the page boundary, never a wrong one.
    _prependMessages(older, scroll) {
        const fragment = document.createDocumentFragment();
        let localLastKey = null, localLastAvatarSlot = null;
        older.forEach(msg => {
            this._messagesById[msg.id] = msg;
            const mine = String(msg.sender_id) === String(this._currentUserId);
            const sender = msg.sender || { id: msg.sender_id, name: msg.sender_name, username: msg.sender_username, profile_pic: msg.sender_profile_pic };
            if (sender?.id) EntityCache.rememberUser(sender);
            const clusterKey = mine ? "me" : String(msg.sender_id);
            const clusterStart = localLastKey !== clusterKey;
            localLastKey = clusterKey;
            const showIdentity = this._mode === "group" && !mine && clusterStart;
            const { row, avatarSlot } = this._buildMessageRow(msg, { mine, sender, clusterStart, showIdentity });
            if (avatarSlot) {
                if (!clusterStart && localLastAvatarSlot) localLastAvatarSlot.classList.add("spacer");
                localLastAvatarSlot = avatarSlot;
            }
            fragment.appendChild(row);
        });
        scroll.insertBefore(fragment, this._topLoaderEl.nextSibling);
    },

    // Re-focusing right after a DOM update can fail silently on some
    // mobile browsers if it doesn't happen in the same tick as the user
    // gesture; the rAF keeps it inside that window without blocking.
    _focusComposer(textarea) { requestAnimationFrame(() => textarea.focus()); },

    _appendMessage(msg, { skipScroll = false } = {}) {
        const scroll = qs("#chat-scroll"); if (!scroll) return;
        const mine = String(msg.sender_id) === String(this._currentUserId);
        const sender = msg.sender || { id: msg.sender_id, name: msg.sender_name, username: msg.sender_username, profile_pic: msg.sender_profile_pic };
        // Our own optimistic placeholder doesn't carry sender identity
        // fields (it's rendered before the server confirms anything) —
        // don't let that blank shape clobber a good cached entry.
        if (sender?.id && !msg._pending) EntityCache.rememberUser(sender);

        // ---- Instagram-style clustering ----
        // Consecutive messages from the same sender (with nothing from
        // anyone else in between) form one visual cluster: bubbles sit
        // close together, and — in a group thread — only the LAST bubble
        // of the other person's cluster carries their avatar, with their
        // name shown once above the FIRST bubble. A message from the
        // other side always breaks the cluster, even mid-conversation.
        const clusterKey = mine ? "me" : String(msg.sender_id);
        const clusterStart = this._lastMsgKey !== clusterKey;
        this._lastMsgKey = clusterKey;
        const showIdentity = this._mode === "group" && !mine && clusterStart;

        this._messagesById[msg.id] = msg;
        const { row, reactionRow, avatarSlot } = this._buildMessageRow(msg, { mine, sender, clusterStart, showIdentity });

        if (avatarSlot) {
            // A continuing cluster means the PREVIOUS bubble is no longer
            // the last one — hand the visible avatar off to this new row.
            if (!clusterStart && this._lastTheirsAvatarSlot) this._lastTheirsAvatarSlot.classList.add("spacer");
            this._lastTheirsAvatarSlot = avatarSlot;
        }

        scroll.appendChild(row);
        if (!skipScroll) scroll.scrollTop = scroll.scrollHeight;
    },

    // Pure row construction shared by _appendMessage (bottom, "live"
    // state) and _prependMessages (top, its own batch-local state) — no
    // DOM insertion and no global cluster-state mutation happens in here,
    // callers own that so the two directions can't stomp on each other.
    _buildMessageRow(msg, { mine, sender, clusterStart, showIdentity }) {
        const reactionRow = h("div", { className: "reaction-row" });

        let longPressFired = false, longPressTimer = null;
        const startLongPress = e => {
            longPressFired = false;
            const target = e.currentTarget;
            target.classList.add("long-pressing");
            longPressTimer = setTimeout(() => {
                longPressFired = true;
                target.classList.remove("long-pressing");
                target.classList.add("long-press-release");
                target.addEventListener("animationend", () => target.classList.remove("long-press-release"), { once: true });
                this._openReactionPicker(msg.id);
            }, LONG_PRESS_MS);
        };
        const cancelLongPress = e => { clearTimeout(longPressTimer); e.currentTarget.classList.remove("long-pressing"); };

        const bubble = h("div", {
            className: "bubble",
            onClick: () => { if (longPressFired || msg._pending) return; if (mine) this._offerDelete(msg.id); },
            onPointerDown: msg._pending ? null : startLongPress, onPointerUp: cancelLongPress, onPointerLeave: cancelLongPress, onPointerCancel: cancelLongPress,
            onContextMenu: e => { e.preventDefault(); if (!msg._pending) this._openReactionPicker(msg.id); },
        }, [
            h("span", { className: "bubble-text" }, msg.content),
            h("span", { className: "bubble-time" }, msg._pending ? "Sending…" : messageTime(msg.created_at)),
        ]);
        const bubbleCol = h("div", { className: "bubble-col" }, [bubble, reactionRow]);

        const openSenderProfile = e => { e.stopPropagation(); openProfilePreview(sender, { onMessage: () => Router.go(`messages/dm/${sender.id}`) }); };

        let avatarSlot = null;
        if (this._mode === "group" && !mine) {
            avatarSlot = h("button", { className: "msg-avatar-slot", type: "button", onClick: openSenderProfile }, [Avatar(sender.name || sender.username, sender.profile_pic, "xs")]);
        }

        const senderLabel = showIdentity
            ? h("button", { className: "msg-sender-label", type: "button", onClick: openSenderProfile }, sender.name || sender.username)
            : null;

        const line = avatarSlot ? h("div", { className: "msg-line" }, [avatarSlot, bubbleCol]) : bubbleCol;

        const row = h("div", {
            className: `msg-row ${mine ? "mine" : "theirs"} ${clusterStart ? "cluster-start" : ""} ${msg._pending ? "pending" : ""}`,
            "data-msg-id": String(msg.id ?? ""),
        }, [senderLabel, line]);
        this._paintReactions(reactionRow, msg.id, msg.reactions || []);
        return { row, reactionRow, avatarSlot };
    },

    // Swaps a locally-rendered "sending…" bubble for the server-confirmed
    // message in place (same DOM node) once the POST resolves, so there's
    // no flicker/re-scroll — just the pending styling and timestamp updating.
    _reconcileMessage(tempId, sent) {
        const optimisticMsg = this._messagesById[tempId];
        delete this._messagesById[tempId];
        const row = qs(`.msg-row[data-msg-id="${tempId}"]`);
        if (!row || !optimisticMsg) { this._appendMessage(sent); return; }

        Object.assign(optimisticMsg, sent, { _pending: false });
        this._messagesById[sent.id] = optimisticMsg;
        row.dataset.msgId = String(sent.id);
        row.classList.remove("pending");
        const timeEl = qs(".bubble-time", row);
        if (timeEl) timeEl.textContent = messageTime(sent.created_at);
        this._paintReactions(qs(".reaction-row", row), sent.id, sent.reactions || []);
    },

    _removeMessageRow(id) {
        delete this._messagesById[id];
        const row = qs(`.msg-row[data-msg-id="${id}"]`);
        if (row) row.remove();
    },

    _paintReactions(reactionRow, messageId, reactions) {
        clear(reactionRow);
        (reactions || []).filter(r => r.count > 0).forEach(r => {
            const mine = (r.user_ids || []).map(String).includes(String(this._currentUserId));
            reactionRow.appendChild(h("button", {
                className: `reaction-chip ${mine ? "mine" : ""}`,
                onClick: e => { e.stopPropagation(); this._react(messageId, r.emoji); },
            }, `${r.emoji} ${r.count}`));
        });
    },

    _applyReactions(messageId, reactions) {
        const msg = this._messagesById[messageId]; if (msg) msg.reactions = reactions;
        const row = qs(`.msg-row[data-msg-id="${messageId}"] .reaction-row`);
        if (row) this._paintReactions(row, messageId, reactions);
    },

    // Builds what the reaction list would look like the instant this
    // toggle lands, so the chip can paint before the network is even
    // asked. Mirrors the backend's toggle rule: same emoji again removes
    // your reaction, a different emoji swaps it, keeping counts in sync.
    _predictReactions(current, messageId, emoji) {
        const myId = String(this._currentUserId);
        const list = (current || []).map(r => ({ ...r, user_ids: (r.user_ids || []).map(String) }));
        const mineNow = list.find(r => r.user_ids.includes(myId));
        if (mineNow && mineNow.emoji === emoji) {
            mineNow.user_ids = mineNow.user_ids.filter(id => id !== myId);
            mineNow.count = Math.max(0, (mineNow.count || 1) - 1);
        } else {
            if (mineNow) {
                mineNow.user_ids = mineNow.user_ids.filter(id => id !== myId);
                mineNow.count = Math.max(0, (mineNow.count || 1) - 1);
            }
            let target = list.find(r => r.emoji === emoji);
            if (!target) { target = { emoji, count: 0, user_ids: [] }; list.push(target); }
            if (!target.user_ids.includes(myId)) { target.user_ids.push(myId); target.count = (target.count || 0) + 1; }
        }
        return list;
    },

    // Reactions paint the instant you tap — no waiting on the ~500ms
    // round trip. The real toggle happens in the background; if it
    // fails, or the server hasn't confirmed within 20s, the chip is
    // rolled back to what it looked like before the tap.
    _react(messageId, emoji) {
        const msg = this._messagesById[messageId]; if (!msg) return;
        const previous = msg.reactions || [];
        const optimistic = this._predictReactions(previous, messageId, emoji);
        Optimistic.run({
            timeoutMs: 20000,
            apply: () => this._applyReactions(messageId, optimistic),
            action: () => MessagesApi.react(messageId, emoji),
            revert: () => this._applyReactions(messageId, previous),
            reconcile: (result) => { if (result?.reactions) this._applyReactions(messageId, result.reactions); },
            onError: () => Toast.error("Couldn't send that reaction. Check your connection."),
        });
    },

    _openReactionPicker(messageId) {
        const picker = h("div", { className: "reaction-picker" }, QUICK_REACTIONS.map(emoji => h("button", { onClick: () => { this._react(messageId, emoji); picker.remove(); document.removeEventListener("click", closeOnOutside); } }, emoji)));
        const closeOnOutside = (e) => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener("click", closeOnOutside); } };
        const row = qs(`.msg-row[data-msg-id="${messageId}"]`);
        if (!row) return;
        row.appendChild(picker);

        // Flip below the message when there isn't room above — near the
        // top of .chat-scroll (overflow:auto) a picker positioned above
        // would otherwise be silently clipped by the scroll container.
        const scroll = qs("#chat-scroll");
        const rowRect = row.getBoundingClientRect();
        const scrollRect = scroll ? scroll.getBoundingClientRect() : { top: 0 };
        if (rowRect.top - scrollRect.top < 56) picker.classList.add("below");

        // Clamp horizontally so it can't be pushed off a narrow viewport.
        requestAnimationFrame(() => {
            const pRect = picker.getBoundingClientRect();
            if (pRect.left < 4) picker.style.left = "4px";
            else if (pRect.right > window.innerWidth - 4) picker.style.right = "4px";
        });

        setTimeout(() => document.addEventListener("click", closeOnOutside), 0);
    },

    // Docks the emoji grid in place of the native keyboard (WhatsApp/
    // Instagram style) instead of floating a box over the composer.
    _toggleEmojiDock(btn, dock, textarea) {
        if (dock.classList.contains("open")) this._closeEmojiDock(btn, dock, { refocus: true });
        else this._openEmojiDock(btn, dock, textarea);
    },

    _openEmojiDock(btn, dock, textarea) {
        // Dismiss the native keyboard first so it doesn't fight the dock
        // for the same screen space.
        textarea.blur();
        dock.classList.add("open");
        btn.classList.add("active");
        qs(".material-symbols-rounded", btn).textContent = "keyboard";
    },

    _closeEmojiDock(btn, dock, { refocus = false } = {}) {
        if (!dock.classList.contains("open")) return;
        dock.classList.remove("open");
        btn.classList.remove("active");
        const icon = qs(".material-symbols-rounded", btn);
        if (icon) icon.textContent = "mood";
        if (refocus) { const textarea = qs(".composer textarea"); if (textarea) this._focusComposer(textarea); }
    },

    _showTyping(name) {
        const indicator = qs("#typing-indicator"); if (!indicator) return;
        indicator.textContent = `${name} is typing…`;
        indicator.classList.remove("hidden");
        clearTimeout(this._typingTimeout);
        this._typingTimeout = setTimeout(() => this._hideTyping(), 1800);
    },

    _hideTyping() {
        const indicator = qs("#typing-indicator");
        if (indicator) indicator.classList.add("hidden");
    },

    async _openGroupDetails(groupId) {
        let group = this._groupDetail;
        try { group = await GroupsApi.detail(groupId); this._groupDetail = group; } catch (err) { Toast.fromApiError(err); return; }
        (group.members || []).forEach(m => EntityCache.rememberUser(m));
        const current = group.members?.find(m => m.is_current_user);
        const myRole = current?.group_role || group.my_role || "Member";
        const canManage = ["Owner", "Admin", "Helper"].includes(myRole);
        const canManageRoles = ["Owner", "Admin"].includes(myRole);
        const canChangePhoto = ["Owner", "Admin"].includes(myRole);
        const fileInput = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", className: "hidden" });
        const avatarWrap = h("div", { className: `group-hero-avatar ${canChangePhoto ? "editable" : ""}` }, [
            Avatar(group.name, group.profile_pic, "xl"),
            canChangePhoto ? h("span", { className: "avatar-edit-badge" }, [h("span", { className: "material-symbols-rounded" }, "photo_camera")]) : null,
        ]);
        if (canChangePhoto) { avatarWrap.style.cursor = "pointer"; avatarWrap.addEventListener("click", () => fileInput.click()); }
        const roleIcon = myRole === "Owner" ? "workspace_premium" : myRole === "Admin" ? "shield_person" : myRole === "Teacher" ? "school" : "person";
        const hero = h("div", { className: "group-detail-hero" }, [
            avatarWrap,
            h("div", { className: "group-hero-copy" }, [h("span", { className: "sheet-kicker" }, `${group.type || group.typeo || "GROUP"} · ${group.member_count || 0} PEOPLE`), h("h2", {}, group.name), h("p", {}, group.description || "No description yet"), h("div", { className: "group-hero-meta" }, [h("span", { className: "role-pill" }, [h("span", { className: "material-symbols-rounded" }, roleIcon), myRole]), group.school_id ? h("span", { className: "role-pill muted" }, [h("span", { className: "material-symbols-rounded" }, "school"), "School linked"]) : null])]),
        ]);
        fileInput.addEventListener("change", () => {
            const file = fileInput.files[0];
            if (!file) return;
            fileInput.value = "";

            // Paint the new photo instantly from the picked file; the
            // upload itself runs in the background (up to 40s — photo
            // uploads can take a while) and only rolls the avatar back
            // if it actually fails or never confirms.
            const localUrl = URL.createObjectURL(file);
            let img = qs("img", avatarWrap);
            const previousSrc = img ? img.src : null;
            if (img) { img.src = localUrl; }
            else { const holder = qs(".avatar", avatarWrap); if (holder) { clear(holder); img = h("img", { src: localUrl, alt: group.name }); holder.appendChild(img); } }

            Optimistic.run({
                timeoutMs: 40000,
                action: () => GroupsApi.uploadProfilePic(groupId, file),
                revert: () => {
                    URL.revokeObjectURL(localUrl);
                    if (previousSrc) { const el = qs("img", avatarWrap); if (el) el.src = previousSrc; }
                    else this._openGroupDetails(groupId);
                },
                reconcile: (r) => {
                    if (r?.profile_pic !== undefined) { group.profile_pic = r.profile_pic; EntityCache.rememberGroup(group); }
                    Toast.success("Group photo updated");
                },
                onError: () => Toast.error("Couldn't update the group photo. Please try again."),
            });
        });

        const memberList = h("div", { className: "group-members" }, (group.members || []).map(m => {
            const canEditThis = canManageRoles && !m.is_current_user && m.group_role !== "Owner";
            const roleButton = canEditThis
                ? h("button", { className: "member-role-btn", onClick: e => { e.stopPropagation(); this._openRoleSheet(groupId, m, myRole); } }, [m.group_role, h("span", { className: "material-symbols-rounded" }, "expand_more")])
                : h("span", { className: `badge ${m.group_role === "Owner" ? "badge-owner" : "badge-role"}` }, m.group_role);
            return h("button", { className: "member-card", onClick: () => openProfilePreview(m, { onMessage: m.is_current_user ? undefined : u => { Sheet.close(); RecentDmStore?.remember?.(u); Router.go(`messages/dm/${u.id}`); } }) }, [
                Avatar(m.name || m.username, m.profile_pic, "sm"),
                h("div", { className: "member-copy" }, [h("strong", {}, m.name || m.username), h("span", {}, `@${m.username}`), h("small", {}, m.role ? `App role · ${m.role}` : "")]),
                roleButton,
            ]);
        }));

        const inviteBtn = canManage ? h("button", { className: "btn btn-primary btn-block", onClick: () => this._openInviteSheet(groupId, group) }, [h("span", { className: "material-symbols-rounded" }, "person_add"), " Invite people"]) : null;
        const schoolAddBtn = canManage && group.school_id ? h("button", { className: "btn btn-soft btn-block", onClick: () => this._openSchoolPeopleSheet(groupId, group) }, [h("span", { className: "material-symbols-rounded" }, "group_add"), " Add from school"]) : null;
        const leaveBtn = group.my_role === "Owner" ? h("button", { className: "btn btn-outline-danger btn-block danger-zone-btn", onClick: () => this._confirmDeleteGroup(groupId, group.name) }, [h("span", { className: "material-symbols-rounded" }, "delete"), " Delete group"]) : h("button", { className: "btn btn-ghost btn-block", onClick: () => this._confirmLeaveGroup(groupId) }, [h("span", { className: "material-symbols-rounded" }, "logout"), " Leave group"]);
        Sheet.open(h("div", { className: "group-detail-sheet" }, [
            h("div", { className: "sheet-handle" }), hero,
            h("div", { className: "group-action-stack" }, [inviteBtn, schoolAddBtn]),
            h("div", { className: "group-members-head" }, [h("div", {}, [h("h3", {}, "People"), h("span", {}, "Tap anyone for their profile")]), h("span", { className: "member-count" }, `${group.members?.length || 0}`)]),
            memberList,
            leaveBtn,
            fileInput,
        ]));
    },

    _openRoleSheet(groupId, member, actorRole = "Member") {
        const levels = { Member: 1, Helper: 2, Admin: 3, Owner: 4 };
        const actorLevel = levels[actorRole] || 0;
        if (!['Owner', 'Admin'].includes(actorRole)) {
            Toast.show("Only Owner and Admin can manage group roles");
            return;
        }
        const roles = ["Admin", "Helper", "Member"].filter(role => (levels[role] || 0) < actorLevel);
        if (!roles.length) { Toast.show("No lower roles available"); return; }
        const options = roles.map(role => h("button", {
            className: `action-tile role-option ${role === member.group_role ? "selected" : ""}`,
            onClick: async () => {
                try {
                    await GroupsApi.changeMemberRole(groupId, member.id, role);
                    Toast.success(`Role changed to ${role}`);
                    Sheet.close();
                    this._openGroupDetails(groupId);
                } catch (err) { Toast.fromApiError(err); }
            },
        }, [
            h("span", { className: "material-symbols-rounded" }, role === "Admin" ? "shield_person" : role === "Helper" ? "volunteer_activism" : "person"),
            h("div", {}, [h("strong", {}, role), h("span", {}, role === "Admin" ? "Can manage lower-level members" : role === "Helper" ? "Trusted group helper" : "Regular group member")]),
            role === member.group_role ? h("span", { className: "material-symbols-rounded role-selected" }, "check_circle") : null,
        ]));
        const actorCanRemove = ["Owner", "Admin"].includes(actorRole) && member.group_role !== "Owner";
        const remove = actorCanRemove ? h("button", { className: "btn btn-outline-danger btn-block", onClick: () => confirmAction({ title: `Remove ${member.name || member.username}?`, message: "They can be invited again later.", confirmLabel: "Remove member", danger: true, onConfirm: async () => { try { await GroupsApi.removeMember(groupId, member.id); Toast.success("Member removed"); Sheet.close(); this._openGroupDetails(groupId); } catch (err) { Toast.fromApiError(err); } } }) }, [h("span", { className: "material-symbols-rounded" }, "person_remove"), " Remove from group"]) : null;
        Sheet.open(h("div", { className: "role-sheet" }, [h("div", { className: "sheet-handle" }), h("div", { className: "sheet-kicker" }, "ROLE MANAGEMENT"), h("h3", {}, `Manage ${member.name || member.username}`), h("p", { className: "profile-meta" }, `You are ${actorRole}. You can only assign roles below your own level.`), ...options, remove]));
    },

    _openInviteSheet(groupId, group) {
        const searchInput = h("input", { placeholder: "Search by name or username" });
        const results = h("div", { className: "invite-results" });
        const recent = RecentDmStore?.all?.() || [];
        const renderResults = (users, title = "People") => {
            clear(results);
            if (!users.length) { results.appendChild(h("div", { className: "empty-inline compact" }, [h("span", { className: "material-symbols-rounded" }, "person_search"), "No people found"])); return; }
            results.appendChild(h("div", { className: "picker-heading" }, [h("strong", {}, title), h("span", {}, "Invite sends a request")]))
            users.slice(0, 10).forEach(u => {
                const row = h("button", { className: "invite-person" }, [Avatar(u.name || u.username, u.profile_pic, "sm"), h("div", { className: "picker-person-copy" }, [h("strong", {}, u.name || u.username), h("span", {}, `@${u.username}`)]), h("span", { className: "material-symbols-rounded" }, "person_add")]);
                row.addEventListener("click", () => {
                    // Invited instantly — the row locks and shows "sent"
                    // right away; the request itself confirms in the
                    // background (20s) and un-locks the row if it fails.
                    const icon = qs(".material-symbols-rounded", row);
                    Optimistic.run({
                        timeoutMs: 20000,
                        apply: () => { row.classList.add("optimistic-busy"); if (icon) icon.textContent = "check"; },
                        action: () => GroupsApi.inviteByUsername(groupId, u.username),
                        revert: () => { row.classList.remove("optimistic-busy"); if (icon) icon.textContent = "person_add"; },
                        reconcile: () => Toast.success(`Invite sent to ${u.name || u.username}`),
                        onError: () => Toast.error(`Couldn't invite ${u.name || u.username}. Try again.`),
                    });
                });
                results.appendChild(row);
            });
        };
        renderResults(recent, "Recent DMs");
        let timer;
        searchInput.addEventListener("input", () => {
            clearTimeout(timer);
            const q = searchInput.value.trim();
            if (q.length < 2) { renderResults(recent, "Recent DMs"); return; }
            mount(results, h("div", { className: "search-loading" }, "Searching…"));
            timer = setTimeout(async () => { try { renderResults(await UsersApi.search(q), "Search results"); } catch (err) { mount(results, h("div", { className: "empty-inline compact" }, err?.message || "Search unavailable")); } }, 250);
        });
        Sheet.open(h("div", { className: "invite-sheet" }, [h("div", { className: "sheet-handle" }), h("div", { className: "sheet-kicker" }, "INVITE PEOPLE"), h("h3", {}, `Bring people into ${group.name}`), h("p", { className: "sheet-copy" }, "Tap a person. Notely sends the group invitation through Notifications — nobody is added silently."), h("div", { className: "social-search" }, [h("span", { className: "material-symbols-rounded" }, "search"), searchInput]), results]));
    },

    async _openSchoolPeopleSheet(groupId, group) {
        try {
            const members = await SchoolsApi.members(group.school_id);
            const groupIds = new Set((group.members || []).map(m => String(m.id)));
            const currentUser = await Session.getUser();
            const available = members.filter(m => !groupIds.has(String(m.id)) && String(m.id) !== String(currentUser?.id));
            const selected = new Set();
            const list = h("div", { className: "school-member-picker" });
            const count = h("span", { className: "selection-count" }, "0 selected");
            const render = () => {
                clear(list);
                available.forEach(m => {
                    const checked = selected.has(m.id);
                    const row = h("label", { className: `picker-person ${checked ? "selected" : ""}` }, [h("input", { type: "checkbox", checked: checked ? "true" : null }), Avatar(m.full_name || m.username, m.profile_pic, "sm"), h("div", { className: "picker-person-copy" }, [h("strong", {}, m.full_name || m.username), h("span", {}, `${m.role} · @${m.username}`)]), h("span", { className: "picker-check material-symbols-rounded" }, checked ? "check_circle" : "radio_button_unchecked")]);
                    qs("input", row).addEventListener("change", e => { if (e.target.checked) selected.add(m.id); else selected.delete(m.id); render(); });
                    list.appendChild(row);
                });
                count.textContent = `${selected.size} selected`;
                addBtn.disabled = selected.size === 0;
            };
            const addBtn = h("button", { className: "btn btn-primary btn-block", disabled: "true" }, "Add selected people");
            addBtn.addEventListener("click", () => {
                // Close and hand control back immediately — adding a
                // batch of members is exactly the kind of thing that used
                // to hold this sheet open. It now runs in the background
                // and reports back with a toast once it's actually done.
                const ids = [...selected];
                Sheet.close();
                Toast.show(`Adding ${ids.length} ${ids.length === 1 ? "person" : "people"}…`);
                Promise.all(ids.map(id => GroupsApi.addMember(groupId, id, group.school_id).then(() => true).catch(() => false)))
                    .then(outcomes => {
                        const added = outcomes.filter(Boolean).length;
                        Toast.success(added ? `${added} people added` : "Nobody was added");
                    })
                    .catch(() => Toast.error("Couldn't add those people. Try again."));
            });
            render();
            Sheet.open(h("div", { className: "school-people-sheet" }, [h("div", { className: "sheet-handle" }), h("div", { className: "sheet-kicker" }, "SCHOOL PEOPLE"), h("h3", {}, "Add several people"), h("p", { className: "sheet-copy" }, "Select multiple school members at once. This uses the existing school-membership permission rules."), h("div", { className: "picker-heading" }, [h("strong", {}, `${available.length} available`), count]), list, addBtn]));
        } catch (err) { Toast.fromApiError(err); }
    },

    _confirmLeaveGroup(groupId) { confirmAction({ title: "Leave group?", message: "You'll need another invite to come back.", confirmLabel: "Leave", onConfirm: async () => { try { await GroupsApi.leave(groupId); Toast.success("Left group"); Sheet.close(); Router.goBack("messages"); } catch (err) { Toast.fromApiError(err); } } }); },
    _confirmDeleteGroup(groupId, name) { confirmAction({ title: `Delete ${name}?`, message: "Every message and member connection in this group will be removed. This cannot be undone.", confirmLabel: "Delete group", danger: true, onConfirm: async () => { try { await GroupsApi.remove(groupId); Toast.success("Group deleted"); Sheet.close(); Router.goBack("messages"); } catch (err) { Toast.fromApiError(err); } } }); },
    _offerDelete(messageId) { confirmAction({ title: "Delete message?", message: "This can't be undone.", confirmLabel: "Delete", onConfirm: async () => { await MessagesApi.deleteMessage(messageId); const row = qs(`.msg-row[data-msg-id="${messageId}"]`); if (row) row.remove(); Toast.success("Message deleted"); } }); },
    _showDmWall(detail) { const composer = qs(".composer"); if (!composer) return; qs(".dm-wall")?.remove(); composer.parentElement.insertBefore(h("div", { className: "dm-wall" }, [h("p", {}, detail || "You can't send more messages here yet.")] ), composer); },
};
window.ChatPage = ChatPage;