// ------------------------------------------------------------------
// pages/home/home.js — dashboard
// ------------------------------------------------------------------

const HomePage = {
    async render(container) {
        const user = await Session.getUser();

        const topBar = h("div", { className: "app-header dashboard-header" }, [
            h("h1", {}, "Notely"),
            h("button", {
                className: "notification-btn",
                "aria-label": "Notifications",
                onClick: () => NotificationService.openCenter(),
            }, [
                h("span", { className: "material-symbols-rounded" }, "notifications"),
                h("span", { className: "notification-badge hidden", "data-notification-badge": "true" }, "0"),
            ]),
        ]);

        const header = h("div", { className: "greeting" }, [
            h("h1", {}, `Hi, ${(user?.name || user?.username || "there").split(" ")[0]} 👋`),
            h("p", {}, "Here's what's happening in Notely."),
        ]);

        const quickActions = h("div", { className: "quick-actions-wrap" }, [
            h("div", { className: "quick-actions" }, [
                this._quickAction("groups", "New group", () => Router.go("messages")),
                this._quickAction("school", "Join school", () => Router.go("schools")),
                this._quickAction("menu_book", "Notes", () => Router.go("notes")),
                this._quickAction("person", "Profile", () => Router.go("profile")),
            ]),
        ]);

        mount(container, topBar, header, quickActions,
            h("div", { className: "skeleton-row" }, [h("div", { className: "skeleton skeleton-avatar" }), h("div", { className: "skeleton skeleton-line" })]));
        NotificationService.syncBadge();

        // These five are all CacheService-backed GETs — a repeat visit
        // paints from the on-device cache instantly and refreshes behind
        // the scenes, so this normally isn't a real wait at all. What
        // used to make this screen crawl was below: per-group message
        // history fetches gating the very first paint. Those are now
        // fully decoupled — see _upgradeRecent below.
        const [schoolsResult, groupsResult, invitesResult, dmRequestsResult, dmsResult] = await Promise.allSettled([
            SchoolsApi.dashboard(),
            GroupsApi.list(),
            GroupsApi.invites(),
            MessagesApi.getPendingDmRequests(),
            MessagesApi.listDirectThreads(),
        ]);

        const schools = schoolsResult.status === "fulfilled" ? schoolsResult.value : [];
        const groups = groupsResult.status === "fulfilled" ? groupsResult.value : [];
        const invites = invitesResult.status === "fulfilled" ? invitesResult.value : [];
        const dmRequests = dmRequestsResult.status === "fulfilled" ? dmRequestsResult.value : [];
        const dms = dmsResult.status === "fulfilled" ? (dmsResult.value || []) : [];
        groups.forEach(g => EntityCache.rememberGroup(g));
        dms.forEach(u => EntityCache.rememberUser(u));

        const statNums = { invites: invites.length + dmRequests.length };
        const statRow = h("div", { className: "stat-row" }, [
            this._stat(schools.length, "Schools"),
            this._stat(groups.length, "Groups"),
            this._stat(statNums.invites, "Invites", "invites"),
        ]);

        const sections = [];

        if (dmRequests.length) {
            sections.push(h("div", { className: "section-title" }, [h("span", {}, "Message requests")]));
            dmRequests.forEach(req => {
                const card = h("div", { className: "card", style: "margin-bottom:10px" }, [
                    h("div", { className: "card-row" }, [
                        Avatar(req.name || req.username, req.profile_pic, "sm"),
                        h("div", { className: "card-row-text" }, [
                            h("div", { className: "card-row-title" }, req.name || req.username || "Someone"),
                            h("div", { className: "card-row-sub" }, `@${req.username || "unknown"} wants to message you`),
                        ]),
                        h("div", { style: "display:flex;gap:6px" }, [
                            h("button", {
                                className: "btn btn-sm btn-primary",
                                onClick: () => this._respond(card, statNums, {
                                    action: () => MessagesApi.respondToDmRequest(req.id, "accepted"),
                                    successMsg: "Request accepted",
                                }),
                            }, "Accept"),
                            h("button", {
                                className: "btn btn-sm btn-ghost",
                                onClick: () => this._respond(card, statNums, {
                                    action: () => MessagesApi.respondToDmRequest(req.id, "declined"),
                                }),
                            }, "Decline"),
                        ]),
                    ]),
                ]);
                sections.push(card);
            });
        }

        if (invites.length) {
            sections.push(h("div", { className: "section-title" }, [h("span", {}, "Pending invites")]));
            invites.forEach(inv => {
                const card = h("div", { className: "card", style: "margin-bottom:10px" }, [
                    h("div", { className: "card-row" }, [
                        Avatar(inv.sender_username || inv.group_name, null, "sm"),
                        h("div", { className: "card-row-text" }, [
                            h("div", { className: "card-row-title" }, inv.group_name || "Group invite"),
                            h("div", { className: "card-row-sub" }, `From @${inv.sender_username || "someone"}`),
                        ]),
                        h("div", { style: "display:flex;gap:6px" }, [
                            h("button", {
                                className: "btn btn-sm btn-primary",
                                onClick: () => this._respond(card, statNums, {
                                    action: () => GroupsApi.respondToInvite(inv.id, "accepted"),
                                    successMsg: "Joined group",
                                }),
                            }, "Accept"),
                            h("button", {
                                className: "btn btn-sm btn-ghost",
                                onClick: () => this._respond(card, statNums, {
                                    action: () => GroupsApi.respondToInvite(inv.id, "declined"),
                                }),
                            }, "Decline"),
                        ]),
                    ]),
                ]);
                sections.push(card);
            });
        }

        sections.push(h("div", { className: "section-title" }, [
            h("span", {}, "Your schools"),
            schools.length ? h("span", { className: "link", onClick: () => Router.go("schools") }, "See all") : null,
        ]));

        if (schools.length === 0) {
            sections.push(EmptyState({
                icon: "school",
                title: "You haven't joined a school yet",
                subtitle: "Create one as a teacher or join with a code from your school.",
                actionLabel: "Go to Schools",
                onAction: () => Router.go("schools"),
            }));
        } else {
            const list = h("div", { className: "card" });
            schools.slice(0, 4).forEach((s) => {
                list.appendChild(h("div", {
                    className: "card-row", onClick: () => Router.go(`schools/${s.id}`),
                }, [
                    Avatar(s.name, s.profile_pic, "sm"),
                    h("div", { className: "card-row-text" }, [
                        h("div", { className: "card-row-title" }, s.name),
                        h("div", { className: "card-row-sub" }, s.role),
                    ]),
                ]));
            });
            sections.push(list);
        }

        // ---- Recent messages -------------------------------------------------
        // Painted immediately from data already in hand (group descriptions
        // as placeholders, DMs already carry their own last message) so
        // nothing here blocks first paint. The real per-group last message
        // is fetched afterward, in the background, and only that section
        // gets swapped once it's ready — see _upgradeRecent.
        const recentTitle = h("div", { className: "section-title" }, [
            h("span", {}, "Recent messages"),
            h("span", { className: "link hidden", id: "home-recent-seeall" }, "See all"),
        ]);
        const recentWrap = h("div", { id: "home-recent-wrap" });
        sections.push(recentTitle, recentWrap);
        this._paintRecent(recentWrap, recentTitle, this._quickRecentPreviews(groups, dms));

        mount(container, topBar, header, quickActions, statRow, ...sections);
        NotificationService.syncBadge();

        // Background upgrade only — the screen above is already fully
        // interactive and doesn't wait on this at all.
        this._upgradeRecent(groups, dms, recentWrap, recentTitle);
    },

    // Instant accept/decline: the card disappears from the dashboard the
    // moment you tap, no re-render of the whole page. The request runs in
    // the background (20s to confirm); on failure the card comes back and
    // says so. On success it's just gone — no reload needed.
    _respond(card, statNums, { action, successMsg }) {
        Optimistic.run({
            timeoutMs: 20000,
            apply: () => card.classList.add("optimistic-busy"),
            action,
            revert: () => card.classList.remove("optimistic-busy"),
            reconcile: () => {
                card.remove();
                if (statNums) {
                    statNums.invites = Math.max(0, statNums.invites - 1);
                    const el = qs('[data-stat="invites"] .stat-num');
                    if (el) el.textContent = String(statNums.invites);
                }
                if (successMsg) Toast.success(successMsg);
            },
            onError: () => Toast.error("That didn't go through. Check your connection and try again."),
        });
    },

    _quickRecentPreviews(groups, dms) {
        const dmPreviews = dms.map(u => ({
            kind: "dm", id: u.id, name: u.name || u.username, profile_pic: u.profile_pic,
            text: u.last_message || `@${u.username}`, sender: null, at: u.last_message_at || null,
        }));
        const groupPreviews = groups.slice(0, 8).map(g => ({
            kind: "group", id: g.id, name: g.name, profile_pic: g.profile_pic,
            text: g.description || "No messages yet", sender: null, at: null,
        }));
        return this._sortRecent([...dmPreviews, ...groupPreviews]);
    },

    async _upgradeRecent(groups, dms, wrap, title) {
        try {
            const groupPreviews = await Promise.all(groups.slice(0, 8).map(async g => {
                let last = null;
                try {
                    const history = await MessagesApi.getGroupHistory(g.id, 1);
                    last = (history || [])[history?.length - 1] || null;
                } catch { last = null; }
                return {
                    kind: "group", id: g.id, name: g.name, profile_pic: g.profile_pic,
                    text: last?.content || g.description || "No messages yet",
                    sender: last?.sender_name || last?.sender_username || null,
                    at: last?.created_at || null,
                };
            }));
            const dmPreviews = dms.map(u => ({
                kind: "dm", id: u.id, name: u.name || u.username, profile_pic: u.profile_pic,
                text: u.last_message || `@${u.username}`, sender: null, at: u.last_message_at || null,
            }));
            if (!wrap.isConnected) return; // navigated away before this landed
            this._paintRecent(wrap, title, this._sortRecent([...dmPreviews, ...groupPreviews]));
        } catch {
            // The quick preview painted earlier stays put — an upgrade
            // failure is never worse than what's already on screen.
        }
    },

    _sortRecent(list) {
        return list
            .sort((a, b) => {
                const ta = a.at ? new Date(a.at).getTime() : 0;
                const tb = b.at ? new Date(b.at).getTime() : 0;
                return tb - ta;
            })
            .slice(0, 5);
    },

    _paintRecent(wrap, title, recent) {
        clear(wrap);
        const seeAll = qs("#home-recent-seeall", title);
        if (seeAll) seeAll.classList.toggle("hidden", !recent.length);
        if (seeAll) seeAll.onclick = () => Router.go("messages");

        if (!recent.length) {
            wrap.appendChild(EmptyState({
                icon: "chat_bubble",
                title: "Your conversations will appear here",
                subtitle: "Create a group or message someone to get started.",
                actionLabel: "Go to Messages",
                onAction: () => Router.go("messages"),
            }));
            return;
        }
        const list = h("div", { className: "recent-message-list" });
        recent.forEach(c => {
            list.appendChild(h("div", {
                className: "card-row recent-message-row",
                onClick: () => Router.go(c.kind === "group" ? `messages/group/${c.id}` : `messages/dm/${c.id}`),
            }, [
                Avatar(c.name, c.profile_pic, "sm"),
                h("div", { className: "card-row-text" }, [
                    h("div", { className: "card-row-title" }, [
                        h("span", {}, c.name),
                        c.at ? h("small", { className: "recent-time" }, conversationTime(c.at) || "") : null,
                    ]),
                    h("div", { className: "card-row-sub" }, c.sender ? `${c.sender}: ${c.text}` : c.text),
                ]),
            ]));
        });
        wrap.appendChild(list);
    },

    _quickAction(icon, label, onClick) {
        return h("button", { className: "quick-action", onClick }, [
            h("span", { className: "material-symbols-rounded" }, icon),
            h("span", {}, label),
        ]);
    },

    _stat(num, label, key) {
        return h("div", { className: "stat-card", dataset: key ? { stat: key } : undefined }, [
            h("div", { className: "stat-num" }, String(num)),
            h("div", { className: "stat-label" }, label),
        ]);
    },
};

window.HomePage = HomePage;
