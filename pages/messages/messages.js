// Messages home — social inbox for groups + direct conversations.
const RECENT_DM_KEY = "notely_recent_dms";

const RecentDmStore = {
    all() {
        try { return JSON.parse(localStorage.getItem(RECENT_DM_KEY) || "[]"); } catch { return []; }
    },
    remember(user) {
        if (!user?.id) return;
        const item = { id: user.id, name: user.name || user.username, username: user.username, profile_pic: user.profile_pic || null, updated_at: Date.now() };
        const next = [item, ...this.all().filter(x => String(x.id) !== String(item.id))].slice(0, 30);
        localStorage.setItem(RECENT_DM_KEY, JSON.stringify(next));
    },
};
window.RecentDmStore = RecentDmStore;

const MessagesPage = {
    _unsubs: [],

    async render(container, params) {
        this._unsubs.forEach(fn => fn()); this._unsubs = [];
        if (params && params[0] === "group" && params[1]) return ChatPage.renderGroup(container, params[1]);
        if (params && params[0] === "dm" && params[1]) return ChatPage.renderDm(container, params[1]);
        if (params && params[0] === "new-dm") return DmSearchPage.render(container);
        return this._renderList(container);
    },

    async _renderList(container) {
        // One entry point for starting a new chat (the pencil icon), not
        // two — the header icon and the old floating "+" button opened
        // the exact same sheet, which just read as a duplicated control.
        const title = h("div", { className: "messages-title" }, [
            h("div", {}, [h("span", { className: "eyebrow" }, "INBOX"), h("h1", {}, "Messages")]),
            h("button", { className: "btn-icon messages-new-btn", title: "New message", onClick: () => this._openNewSheet() }, [h("span", { className: "material-symbols-rounded" }, "edit_square")]),
        ]);
        const search = h("div", { className: "social-search" }, [
            h("span", { className: "material-symbols-rounded" }, "search"),
            h("input", { placeholder: "Search people or groups", autocomplete: "off" }),
        ]);
        const suggestions = h("div", { className: "search-suggestions hidden" });
        const listWrap = h("div", { className: "conversation-list" });
        mount(container, title, search, suggestions, listWrap);

        let groups = [], dms = [];
        try { groups = await GroupsApi.list(); groups.forEach(g => { EntityCache.rememberGroup(g); NotificationService?.flagColdUnread?.("group", g.id, g.last_message_at); }); } catch (err) { Toast.fromApiError(err); }
        try {
            dms = await MessagesApi.listDirectThreads();
            dms.forEach(u => {
                EntityCache.rememberUser(u);
                RecentDmStore.remember(u);
                // Cold-start "something's new" dot — see flagColdUnread in
                // services/notifications.js. No-ops until this device has
                // opened the thread at least once (nothing to compare
                // against yet), and never overrides a real live count.
                NotificationService?.flagColdUnread?.("dm", u.id, u.last_message_at);
            });
        } catch { dms = RecentDmStore.all(); }
        this._renderInbox(listWrap, groups, dms);

        // Keep the "1"/"9+" badges live while sitting on this screen —
        // NotificationService already tracks the count per conversation
        // (services/notifications.js), this just repaints on change
        // instead of waiting for the next time the tab is opened.
        const currentQuery = () => qs("input", search)?.value.trim() || "";
        const refreshBadges = () => this._renderInbox(listWrap, groups, dms, currentQuery());
        this._unsubs.push(WS.on("group_message", refreshBadges));
        this._unsubs.push(WS.on("direct_message", refreshBadges));
        const onUnreadChanged = () => refreshBadges();
        document.addEventListener("notely:unread-changed", onUnreadChanged);
        this._unsubs.push(() => document.removeEventListener("notely:unread-changed", onUnreadChanged));

        let timer;
        const input = qs("input", search);
        input.addEventListener("input", () => {
            clearTimeout(timer);
            const q = input.value.trim();
            this._renderInbox(listWrap, groups, dms, q);
            if (q.length < 2) { suggestions.classList.add("hidden"); suggestions.replaceChildren(); return; }
            suggestions.classList.remove("hidden");
            mount(suggestions, h("div", { className: "search-loading" }, "Searching people…"));
            timer = setTimeout(async () => {
                try {
                    const users = await UsersApi.search(q);
                    users.forEach(u => EntityCache.rememberUser(u));
                    clear(suggestions);
                    if (!users.length) { mount(suggestions, h("div", { className: "search-empty" }, "No people found")); return; }
                    mount(suggestions, h("div", { className: "social-results" }, users.slice(0, 8).map(u => h("button", {
                        className: "social-result", onClick: () => { RecentDmStore.remember(u); EntityCache.rememberUser(u); Router.go(`messages/dm/${u.id}`); },
                    }, [Avatar(u.name || u.username, u.profile_pic, "sm"), h("div", { className: "card-row-text" }, [h("strong", {}, u.name || u.username), h("span", {}, `@${u.username}`)]), h("span", { className: "material-symbols-rounded result-arrow" }, "chevron_right")]))));
                } catch (err) { mount(suggestions, h("div", { className: "search-empty" }, err?.message || "Search unavailable right now")); }
            }, 280);
        });
    },

    // One unified, Instagram-style inbox: DMs and groups interleaved in
    // a single list, sorted by real last-message recency for both now
    // that /chats/groups also returns last_message_at (see
    // Chat/group_dashboard.py::_group_last_message). A small chat-bubble
    // badge on the avatar is the only thing distinguishing a group from
    // a DM, the way Instagram does it — no separate headers.
    _renderInbox(wrap, groups, dms, query = "") {
        clear(wrap);
        const q = query.toLowerCase();
        const filteredGroups = groups.filter(g => !q || `${g.name} ${g.description || ""}`.toLowerCase().includes(q));
        const filteredDms = dms.filter(u => !q || `${u.name || ""} ${u.username || ""}`.toLowerCase().includes(q));

        const dmItems = filteredDms
            .map(u => ({ kind: "dm", data: u, ts: u.last_message_at ? new Date(u.last_message_at).getTime() : 0 }))
            .sort((a, b) => b.ts - a.ts);
        const groupItems = filteredGroups
            .map(g => ({ kind: "group", data: g, ts: g.last_message_at ? new Date(g.last_message_at).getTime() : 0 }))
            .sort((a, b) => b.ts - a.ts);
        const items = [...dmItems, ...groupItems].sort((a, b) => b.ts - a.ts);

        if (!items.length) {
            wrap.appendChild(EmptyState({ icon: "forum", title: query ? "No chats match" : "No chats yet", subtitle: query ? "Try another name." : "Start a message or create a group." }));
            return;
        }

        items.forEach(item => {
            if (item.kind === "dm") {
                const u = item.data;
                const { count, dot } = NotificationService?.unreadDisplay?.("dm", u.id) || { count: 0, dot: false };
                wrap.appendChild(h("button", {
                    className: "conversation-card dm-card", onClick: () => { RecentDmStore.remember(u); Router.go(`messages/dm/${u.id}`); },
                }, [
                    h("div", { className: "convo-avatar" }, [Avatar(u.name || u.username, u.profile_pic, "md")]),
                    h("div", { className: "conversation-main" }, [
                        h("div", { className: "conversation-top" }, [h("strong", {}, u.name || u.username), h("span", {}, conversationTime(u.last_message_at) || "Direct")]),
                        h("div", { className: "conversation-sub" }, u.last_message || `@${u.username}`),
                    ]),
                    count ? h("span", { className: "unread-badge" }, count > 99 ? "99+" : String(count)) : (dot ? h("span", { className: "unread-badge dot-only" }) : null),
                    h("span", { className: "material-symbols-rounded conversation-chevron" }, "chevron_right"),
                ]));
            } else {
                const g = item.data;
                const { count, dot } = NotificationService?.unreadDisplay?.("group", g.id) || { count: 0, dot: false };
                wrap.appendChild(h("button", {
                    className: "conversation-card group-card", onClick: () => Router.go(`messages/group/${g.id}`),
                }, [
                    h("div", { className: "convo-avatar" }, [Avatar(g.name, g.profile_pic, "md"), h("span", { className: "convo-kind-badge material-symbols-rounded", title: "Group" }, "groups")]),
                    h("div", { className: "conversation-main" }, [
                        h("div", { className: "conversation-top" }, [h("strong", {}, g.name), h("span", {}, `${g.member_count || 0} members`)]),
                        h("div", { className: "conversation-sub" }, g.description || g.type || "Group chat"),
                    ]),
                    count ? h("span", { className: "unread-badge" }, count > 99 ? "99+" : String(count)) : (dot ? h("span", { className: "unread-badge dot-only" }) : null),
                    h("span", { className: "material-symbols-rounded conversation-chevron" }, "chevron_right"),
                ]));
            }
        });
    },

    _openNewSheet() {
        Sheet.open(h("div", { className: "new-chat-sheet" }, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "START A CONVERSATION"),
            h("h3", {}, "What are you building?"),
            h("button", { className: "action-tile action-tile-primary", onClick: () => { Sheet.close(); this._openCreateGroupSheet(); } }, [h("span", { className: "material-symbols-rounded" }, "groups"), h("div", {}, [h("strong", {}, "New group"), h("span", {}, "Create a space for your people")]), h("span", { className: "material-symbols-rounded action-arrow" }, "arrow_forward")]),
            h("button", { className: "action-tile", onClick: () => { Sheet.close(); Router.go("messages/new-dm"); } }, [h("span", { className: "material-symbols-rounded" }, "person_add"), h("div", {}, [h("strong", {}, "New message"), h("span", {}, "Find someone and start chatting")]), h("span", { className: "material-symbols-rounded action-arrow" }, "arrow_forward")]),
        ]));
    },

    async _openCreateGroupSheet() {
        const nameField = h("input", { placeholder: "e.g. Eclipse SMP Crew", maxlength: "60" });
        const descField = h("textarea", { placeholder: "What's this group about?", rows: "3", maxlength: "180" });
        const typeField = MessagesPage._segmentedField([
            { value: "Normal", label: "Normal", icon: "groups" },
            { value: "Announcements", label: "Announcements", icon: "campaign" },
            { value: "School", label: "School group", icon: "school" },
        ], "Normal");
        const schoolWrap = h("div", { className: "school-create-panel hidden" });
        // Announcements-only: explicit School-linked vs Manual choice (spec
        // §43 — never force a school onto a Manual announcement).
        const announcementModeField = MessagesPage._segmentedField([
            { value: "manual", label: "Manual", icon: "edit_note" },
            { value: "school", label: "Link to a school", icon: "school" },
        ], "manual");
        const announcementModeRow = h("div", { className: "field hidden" }, [h("label", {}, "Members"), announcementModeField.ui]);
        const submit = h("button", { className: "btn btn-primary btn-block", disabled: "true" }, [h("span", { className: "material-symbols-rounded" }, "groups"), " Create group"]);

        let selectedSchool = null;
        let schoolMembers = [];
        // Audience is a set of "who joins" instructions applied right after
        // the group is created. Identical for School groups and
        // school-linked Announcements.
        let audience = { all: false, roles: new Set(), sections: [], usernames: new Set() };
        const currentUserId = String((await Session.getUser())?.id || "");

        const resetAudience = () => { audience = { all: false, roles: new Set(), sections: [], usernames: new Set() }; };
        const isSchoolLinkRequired = () => typeField.select.value === "School" || (typeField.select.value === "Announcements" && announcementModeField.select.value === "school");
        const setSubmit = () => { submit.disabled = !nameField.value.trim() || (isSchoolLinkRequired() && !selectedSchool); };

        // ---------- audience picker ----------
        const audienceWrap = h("div", { className: "audience-panel" });

        const audienceSummary = () => {
            const bits = [];
            if (audience.all) bits.push("Everyone in the school");
            audience.roles.forEach(r => bits.push(`All ${r}s`));
            audience.sections.forEach(s => bits.push(`${s.name} · ${s.section}`));
            audience.usernames.forEach(u => bits.push(`@${u}`));
            return bits;
        };

        const openManualInvite = () => {
            const input = h("input", { placeholder: "username", autocomplete: "off", autocapitalize: "none" });
            const send = h("button", { className: "btn btn-primary btn-block" }, "Send request");
            const popup = MessagesPage._openStackedPopup(h("div", { className: "manual-invite-sheet" }, [
                h("div", { className: "sheet-kicker" }, "INVITE SOMEONE"),
                h("h3", {}, "Invite by username"),
                h("p", { className: "sheet-copy" }, "They get a request and choose whether to join — just like a direct message request."),
                h("div", { className: "field" }, [h("label", {}, "Username"), input]),
                send,
            ]), { kind: "modal" });
            const done = () => {
                const username = input.value.trim().replace(/^@/, "");
                if (!username) return;
                audience.usernames.add(username);
                popup.close();
                renderAudience();
                Toast.success(`@${username} will get an invite request`);
            };
            send.addEventListener("click", done);
            input.addEventListener("keydown", e => { if (e.key === "Enter") done(); });
            setTimeout(() => input.focus(), 60);
        };

        const openClassPicker = async () => {
            const body = h("div", { className: "class-picker-body" }, [h("div", { className: "inline-loading" }, [h("span", { className: "material-symbols-rounded spin" }, "progress_activity"), " Loading classes…"])]);
            const popup = MessagesPage._openStackedPopup(h("div", { className: "class-picker-sheet" }, [
                h("div", { className: "sheet-handle" }),
                h("div", { className: "sheet-kicker" }, "CLASSES"),
                h("h3", {}, "Add a class section"),
                body,
            ]));
            let classes = [];
            try { classes = await ClassesApi.list(selectedSchool.id); } catch (err) {
                mount(body, h("div", { className: "empty-inline" }, [h("span", { className: "material-symbols-rounded" }, "error_outline"), h("strong", {}, "Couldn't load classes"), h("span", {}, err?.detail || err?.message || "Try again.")]));
                return;
            }
            classes = (classes || []).filter(c => (c.sections || []).length);
            if (!classes.length) {
                mount(body, h("div", { className: "empty-inline" }, [h("span", { className: "material-symbols-rounded" }, "class"), h("strong", {}, "No classes yet"), h("span", {}, "Create classes in the school first.")]));
                return;
            }

            // Step 1 — class names only (never sections here).
            const classSelect = h("select", {}, [h("option", { value: "" }, "Choose a class"), ...classes.map(c => h("option", { value: c.name }, c.name))]);
            // Step 2 — sections of the chosen class appear below.
            const sectionRow = h("div", { className: "field hidden" });
            const add = h("button", { className: "btn btn-primary btn-block", disabled: "true" }, "Add section members");
            let chosenClass = null, chosenSection = null;

            const buildSections = () => {
                clear(sectionRow);
                chosenSection = null;
                add.disabled = true;
                if (!chosenClass) { sectionRow.classList.add("hidden"); return; }
                sectionRow.classList.remove("hidden");
                const sectionSelect = h("select", {}, [
                    h("option", { value: "" }, "Choose a section"),
                    ...chosenClass.sections.map(s => h("option", { value: s.section }, `${s.section} · ${s.member_count || 0} members`)),
                ]);
                sectionSelect.addEventListener("change", () => { chosenSection = sectionSelect.value || null; add.disabled = !chosenSection; });
                mount(sectionRow, h("label", {}, "Section"), sectionSelect);
            };

            classSelect.addEventListener("change", () => {
                chosenClass = classes.find(c => c.name === classSelect.value) || null;
                buildSections();
            });

            add.addEventListener("click", () => {
                if (!chosenClass || !chosenSection) return;
                const exists = audience.sections.some(s => s.name === chosenClass.name && s.section === chosenSection);
                if (!exists) audience.sections.push({ name: chosenClass.name, section: chosenSection });
                popup.close();
                renderAudience();
            });

            mount(body, h("div", { className: "field" }, [h("label", {}, "Class"), classSelect]), sectionRow, add);
        };

        const renderAudience = () => {
            clear(audienceWrap);
            const me = currentUserId;
            const usable = schoolMembers.filter(m => String(m.id) !== me);
            // Only offer roles that actually have members in this school.
            const roleOrder = ["Teacher", "Helper", "Member"];
            const roleCounts = roleOrder
                .map(role => ({ role, count: usable.filter(m => String(m.role) === role).length }))
                .filter(r => r.count > 0);

            const tiles = h("div", { className: "audience-tiles" });
            const tile = ({ icon, label, sub, active, onClick }) => {
                const el = h("button", { type: "button", className: `audience-tile ${active ? "selected" : ""}` }, [
                    h("span", { className: "material-symbols-rounded" }, icon),
                    h("div", { className: "audience-tile-copy" }, [h("strong", {}, label), sub ? h("span", {}, sub) : null]),
                    h("span", { className: "material-symbols-rounded audience-tile-mark" }, active ? "check_circle" : "chevron_right"),
                ]);
                el.addEventListener("click", onClick);
                return el;
            };

            // 1. Manual
            tiles.appendChild(tile({
                icon: "person_add", label: "Manual", sub: "Invite by username",
                active: audience.usernames.size > 0, onClick: openManualInvite,
            }));
            // 2. Everyone
            tiles.appendChild(tile({
                icon: "diversity_3", label: "All", sub: `Every school member · ${usable.length}`,
                active: audience.all,
                onClick: () => { audience.all = !audience.all; if (audience.all) audience.roles.clear(); renderAudience(); },
            }));
            // 3. Roles that exist in this school
            roleCounts.forEach(({ role, count }) => tiles.appendChild(tile({
                icon: role === "Teacher" ? "school" : role === "Helper" ? "volunteer_activism" : "group",
                label: `All ${role}s`, sub: `${count} in school`,
                active: audience.roles.has(role),
                onClick: () => {
                    if (audience.roles.has(role)) audience.roles.delete(role);
                    else { audience.roles.add(role); audience.all = false; }
                    renderAudience();
                },
            })));
            // 4. Classes — always last
            tiles.appendChild(tile({
                icon: "class", label: "Classes", sub: "Pick a class, then a section",
                active: audience.sections.length > 0, onClick: openClassPicker,
            }));

            const chosen = audienceSummary();
            const chips = h("div", { className: "audience-chips" }, chosen.map(label => {
                const chip = h("span", { className: "audience-chip" }, [h("span", {}, label), h("button", { type: "button", className: "chip-x", "aria-label": `Remove ${label}` }, [h("span", { className: "material-symbols-rounded" }, "close")])]);
                qs(".chip-x", chip).addEventListener("click", () => {
                    if (label === "Everyone in the school") audience.all = false;
                    else if (label.startsWith("@")) audience.usernames.delete(label.slice(1));
                    else if (label.startsWith("All ")) audience.roles.delete(label.slice(4, -1));
                    else audience.sections = audience.sections.filter(s => `${s.name} · ${s.section}` !== label);
                    renderAudience();
                });
                return chip;
            }));

            mount(audienceWrap,
                h("div", { className: "picker-heading" }, [h("div", {}, [h("strong", {}, "Who joins?"), h("span", {}, "Pick one or combine several — you can add more later")])]),
                tiles,
                chosen.length ? chips : h("div", { className: "audience-hint" }, "Nothing selected yet — the group starts with just you."),
            );
            setSubmit();
        };

        const loadSchoolMembers = async () => {
            if (!selectedSchool) return;
            clear(schoolWrap);
            mount(schoolWrap, h("div", { className: "inline-loading" }, [h("span", { className: "material-symbols-rounded spin" }, "progress_activity"), " Loading people from ", h("strong", {}, selectedSchool.name), "…"]));
            try {
                schoolMembers = await SchoolsApi.members(selectedSchool.id);
                resetAudience();
                mount(schoolWrap,
                    h("div", { className: "school-selected" }, [Avatar(selectedSchool.name, selectedSchool.profile_pic, "sm"), h("div", {}, [h("strong", {}, selectedSchool.name), h("span", {}, `You are ${selectedSchool.role}`)]), h("span", { className: "material-symbols-rounded" }, "verified")]),
                    audienceWrap,
                );
                renderAudience();
            } catch (err) {
                schoolMembers = [];
                mount(schoolWrap, h("div", { className: "empty-inline" }, [h("span", { className: "material-symbols-rounded" }, "error_outline"), h("strong", {}, "Couldn't load school people"), h("span", {}, err?.detail || err?.message || "Try again.")]));
                setSubmit();
            }
        };

        const renderSchools = async () => {
            clear(schoolWrap); schoolWrap.classList.remove("hidden"); selectedSchool = null; resetAudience(); submit.disabled = true;
            mount(schoolWrap, h("div", { className: "inline-loading" }, [h("span", { className: "material-symbols-rounded spin" }, "progress_activity"), " Checking schools you manage…"]));
            try {
                const all = await SchoolsApi.dashboard();
                const schools = (all || []).filter(s => ["owner", "teacher"].includes(String(s.role || "").toLowerCase()));
                if (!schools.length) {
                    mount(schoolWrap, h("div", { className: "empty-inline" }, [h("span", { className: "material-symbols-rounded" }, "school"), h("strong", {}, "No eligible school found"), h("span", {}, "Only schools where you are Owner or Teacher can be linked.")]));
                    return;
                }
                // Exactly one eligible school → auto-select it, no extra tap.
                if (schools.length === 1) { selectedSchool = schools[0]; await loadSchoolMembers(); return; }
                const list = h("div", { className: "school-choice-list" }, schools.map(s => {
                    const btn = h("button", { type: "button", className: "school-choice" }, [
                        Avatar(s.name, s.profile_pic, "sm"),
                        h("div", { className: "school-choice-copy" }, [h("strong", {}, s.name), h("span", {}, s.role)]),
                        h("span", { className: "material-symbols-rounded" }, "chevron_right"),
                    ]);
                    btn.addEventListener("click", async () => { selectedSchool = s; await loadSchoolMembers(); });
                    return btn;
                }));
                mount(schoolWrap, h("div", { className: "picker-heading" }, [h("div", {}, [h("strong", {}, "Choose a school"), h("span", {}, `${schools.length} schools you manage`)])]), list);
            } catch (err) {
                mount(schoolWrap, h("div", { className: "empty-inline" }, [h("span", { className: "material-symbols-rounded" }, "error_outline"), h("strong", {}, "Couldn't load your schools"), h("span", {}, err?.detail || err?.message || "Try again.")]));
            }
        };

        typeField.select.addEventListener("change", async () => {
            announcementModeRow.classList.toggle("hidden", typeField.select.value !== "Announcements");
            if (isSchoolLinkRequired()) await renderSchools();
            else { selectedSchool = null; resetAudience(); clear(schoolWrap); schoolWrap.classList.add("hidden"); setSubmit(); }
        });
        announcementModeField.select.addEventListener("change", async () => {
            if (isSchoolLinkRequired()) await renderSchools();
            else { selectedSchool = null; resetAudience(); clear(schoolWrap); schoolWrap.classList.add("hidden"); setSubmit(); }
        });
        nameField.addEventListener("input", setSubmit);

        // Applies the chosen audience to a freshly created group.
        const applyAudience = async (groupId) => {
            let added = 0, invited = 0, failed = 0;
            if (audience.all) {
                try { const r = await GroupsApi.addByRole(groupId, "All"); added += r?.added_count || 0; } catch { failed++; }
            } else {
                for (const role of audience.roles) {
                    try { const r = await GroupsApi.addByRole(groupId, role); added += r?.added_count || 0; } catch { failed++; }
                }
            }
            for (const s of audience.sections) {
                try {
                    const members = await ClassesApi.members(selectedSchool.id, s.name, s.section);
                    const me = currentUserId;
                    const ids = (members || []).map(m => m.id ?? m.user_id).filter(id => String(id) !== me);
                    const outcomes = await Promise.all(ids.map(id => GroupsApi.addMember(groupId, id, selectedSchool.id).then(() => true).catch(() => false)));
                    added += outcomes.filter(Boolean).length;
                } catch { failed++; }
            }
            for (const username of audience.usernames) {
                try { await GroupsApi.inviteByUsername(groupId, username); invited++; } catch { failed++; }
            }
            return { added, invited, failed };
        };

        submit.addEventListener("click", async () => {
            const name = nameField.value.trim();
            if (!name || (isSchoolLinkRequired() && !selectedSchool)) return;
            submit.disabled = true; submit.textContent = "Creating…";
            try {
                const group = await GroupsApi.create({ name, description: descField.value.trim(), typeo: typeField.select.value, schoolId: isSchoolLinkRequired() ? (selectedSchool?.id || null) : null });
                EntityCache.rememberGroup(group);
                Toast.success("Group created");
                Sheet.close(); Router.go(`messages/group/${group.id}`);

                // Adding the chosen audience (a whole role, a whole
                // section, or a list of usernames) can mean dozens of
                // sequential requests — that used to hold the group
                // creation sheet open the entire time. It now runs after
                // the group is already open, with its own summary toast
                // once it's done, instead of blocking the "Create" tap.
                if (selectedSchool) {
                    applyAudience(group.id).then(result => {
                        const parts = [];
                        if (result.added) parts.push(`${result.added} added`);
                        if (result.invited) parts.push(`${result.invited} invited`);
                        if (parts.length) Toast.success(parts.join(" · "));
                        if (result.failed) Toast.error?.("Some people couldn't be added");
                    }).catch(() => {});
                }
            } catch (err) { Toast.fromApiError(err); submit.disabled = false; submit.textContent = "Create group"; }
        });

        Sheet.open(h("div", { className: "create-group-sheet" }, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "NEW GROUP"),
            h("h3", {}, "Build your space"),
            h("p", { className: "sheet-copy" }, "Choose a type. School groups connect to a school you manage and let you add people by role, class or username."),
            h("div", { className: "field" }, [h("label", {}, "Name"), nameField]),
            h("div", { className: "field" }, [h("label", {}, "Description"), descField]),
            h("div", { className: "field" }, [h("label", {}, "Type"), typeField.ui]),
            announcementModeRow,
            schoolWrap, submit,
        ]));
    },

    // Touch-friendly segmented control used for Create-Type style choices
    // (spec §45). Keeps a real, detached <select> as the source of truth
    // for .value and "change" events — it's never mounted — so callers
    // that already do `field.addEventListener("change", ...)` /
    // `field.value` work unchanged against `field.select`.
    // A second overlay layer that sits ON TOP of an open Sheet, so
    // sub-pickers (manual invite, class picker) never destroy the
    // create-group sheet and its in-progress selection.
    _openStackedPopup(contentEl, { kind = "sheet" } = {}) {
        const overlay = h("div", { className: "overlay overlay-stacked" }, [
            h("div", { className: kind === "modal" ? "modal-panel" : "sheet-panel" }, [contentEl]),
        ]);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add("overlay-in"));
        const close = () => {
            overlay.classList.remove("overlay-in");
            setTimeout(() => overlay.remove(), 260);
        };
        overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
        return { close, overlay };
    },

    _segmentedField(options, initialValue) {
        const select = h("select", {}, options.map(o => h("option", { value: o.value }, o.label)));
        select.value = initialValue ?? options[0].value;

        const buttons = options.map(o => h("button", {
            type: "button",
            className: `type-segment ${o.value === select.value ? "selected" : ""}`,
            onClick: () => {
                if (select.value === o.value) return;
                select.value = o.value;
                select.dispatchEvent(new Event("change"));
            },
        }, [h("span", { className: "material-symbols-rounded" }, o.icon), h("span", {}, o.label)]));

        select.addEventListener("change", () => {
            buttons.forEach((btn, i) => btn.classList.toggle("selected", options[i].value === select.value));
        });

        const ui = h("div", { className: "type-segment-group", role: "radiogroup" }, buttons);
        return { select, ui };
    },
};
window.MessagesPage = MessagesPage;
