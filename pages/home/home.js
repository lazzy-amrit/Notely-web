// ------------------------------------------------------------------
// pages/home/home.js — dashboard
// ------------------------------------------------------------------

const HomePage = {
    async render(container) {
        const user = await Session.getUser();

        const topBar = h("div", { className: "app-header dashboard-header" }, [
            h("h1", {}, "Notely"),
        ]);

        const header = h("div", { className: "greeting" }, [
            h("h1", {}, `Hi, ${(user?.name || user?.username || "there").split(" ")[0]} 👋`),
            h("p", {}, "Here's what's happening in Notely."),
        ]);

        const quickActions = h("div", { className: "quick-actions-wrap" }, [
            h("div", { className: "quick-actions" }, [
                this._quickAction("star", "Starred", () => Router.go("notes")),
                this._quickAction("school", "Join school", () => Router.go("schools")),
                this._quickAction("menu_book", "Notes", () => Router.go("notes")),
                this._quickAction("person", "Profile", () => Router.go("profile")),
            ]),
        ]);

        const body = h("div", { id: "home-body" });
        mount(container, topBar, header, quickActions, body);

        // Stale-while-revalidate for the whole dashboard:
        //  1. paint instantly from the last snapshot we saved on this device
        //     (survives cache invalidation after mutations, unlike the
        //     per-request cache), so nothing waits on the network;
        //  2. fire both requests independently — each one updates just
        //     its own part of the screen the moment it lands;
        //  3. also listen for background cache refreshes, so data that was
        //     served stale gets swapped in when the fresh copy arrives.
        const snap = this._loadSnapshot();
        const state = {
            schools: snap?.schools ?? null,
            stars: snap?.stars ?? null,
        };
        const alive = () => body.isConnected;
        const persist = () => this._saveSnapshot(state);

        let raf = 0;
        const schedule = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                if (alive()) this._paint(body, state, persist);
            });
        };

        const sources = {
            schools: { path: "/school/dashboard", load: () => SchoolsApi.dashboard() },
            stars:   { path: "/stars",            load: () => StarsApi.list() },
        };

        const apply = (key, value) => {
            if (state[key] !== null && JSON.stringify(state[key]) === JSON.stringify(value)) return;
            state[key] = value;
            persist();
            schedule();
        };

        const onCache = (event) => {
            if (!alive()) { window.removeEventListener(CACHE_EVENT, onCache); return; }
            const path = event.detail?.path;
            const key = Object.keys(sources).find(k => sources[k].path === path);
            if (key && event.detail.data) apply(key, event.detail.data);
        };
        window.addEventListener(CACHE_EVENT, onCache);

        schedule();

        Object.entries(sources).forEach(([key, src]) => {
            src.load()
                .then(value => apply(key, value))
                .catch(() => {
                    // Keep whatever we already showed; only stop the
                    // skeleton if there was nothing to show at all.
                    if (state[key] === null) { state[key] = key === "stars" ? { classes: [], subjects: [], notes: [] } : []; schedule(); }
                });
        });
    },

    // ---- Dashboard snapshot (last good data, shown instantly next visit) ----
    _snapKey() {
        return `${APP_CACHE_VERSION}:home_snapshot:${CacheService._userScope()}`;
    },

    _loadSnapshot() {
        try {
            const raw = localStorage.getItem(this._snapKey());
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    },

    _saveSnapshot(state) {
        try {
            localStorage.setItem(this._snapKey(), JSON.stringify(state));
        } catch { /* storage full — the screen still works without a snapshot */ }
    },

    _paint(body, state, persist) {
        const allEmpty = state.schools === null && state.stars === null;
        if (allEmpty) {
            mount(body, h("div", { className: "skeleton-row" }, [h("div", { className: "skeleton skeleton-avatar" }), h("div", { className: "skeleton skeleton-line" })]));
            return;
        }

        const schools = state.schools;
        const stars = state.stars || { classes: [], subjects: [], notes: [] };
        const starredTotal = (stars.classes?.length || 0) + (stars.subjects?.length || 0) + (stars.notes?.length || 0);

        const statRow = h("div", { className: "stat-row" }, [
            this._stat(schools ? schools.length : "–", "Schools"),
            this._stat(state.stars ? starredTotal : "–", "Starred"),
            this._stat(state.stars ? (stars.notes?.length || 0) : "–", "Notes"),
        ]);

        const sections = [];

        sections.push(h("div", { className: "section-title" }, [
            h("span", {}, "Your schools"),
            schools && schools.length ? h("span", { className: "link", onClick: () => Router.go("schools") }, "See all") : null,
        ]));

        if (schools === null) {
            sections.push(h("div", { className: "skeleton-row" }, [h("div", { className: "skeleton skeleton-avatar" }), h("div", { className: "skeleton skeleton-line" })]));
        } else if (schools.length === 0) {
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

        sections.push(h("div", { className: "section-title" }, [
            h("span", {}, "Starred"),
            starredTotal ? h("span", { className: "link", onClick: () => Router.go("notes") }, "See all") : null,
        ]));

        if (state.stars === null) {
            sections.push(h("div", { className: "skeleton-row" }, [h("div", { className: "skeleton skeleton-avatar" }), h("div", { className: "skeleton skeleton-line" })]));
        } else if (starredTotal === 0) {
            sections.push(EmptyState({
                icon: "star",
                title: "Nothing starred yet",
                subtitle: "Star classes, subjects or notes and they'll show up here for one-tap access.",
                actionLabel: "Go to Notes",
                onAction: () => Router.go("notes"),
            }));
        } else {
            const list = h("div", { className: "card" });
            this._starredRows(stars).slice(0, 5).forEach(row => list.appendChild(row));
            sections.push(list);
        }

        mount(body, statRow, ...sections);
    },

    // Mixed starred preview for the dashboard — classes first (the widest
    // container), then subjects, then notes. Routing mirrors the Notes tab
    // (see NotesPage._starGroups); a starred note opens its class's notes
    // list, where it sits alongside its siblings.
    _starredRows(stars) {
        const row = (icon, title, subtitle, onClick) => h("div", {
            className: "card-row", onClick,
        }, [
            h("span", { className: "material-symbols-rounded home-star-icon" }, icon),
            h("div", { className: "card-row-text" }, [
                h("div", { className: "card-row-title" }, title),
                h("div", { className: "card-row-sub" }, subtitle || ""),
            ]),
        ]);

        const classRows = (stars.classes || []).map(x => row(
            "school",
            `${x.class_name}${x.section ? ` ${x.section}` : ""}`,
            x.school_name || "",
            () => Router.go(`notes/school/${x.school_id}/class/${encodeURIComponent(x.class_name)}/${encodeURIComponent(x.section)}`),
        ));

        const subjectRows = (stars.subjects || []).map(x => row(
            "auto_stories",
            x.name,
            [x.school_name, `${x.class_name} ${x.section}`].filter(Boolean).join(" • "),
            () => Router.go(`notes/subject/${x.school_id}/${encodeURIComponent(x.class_name)}/${encodeURIComponent(x.section)}/${x.id}/${encodeURIComponent(x.name)}`),
        ));

        const noteRows = (stars.notes || []).map(x => row(
            "picture_as_pdf",
            x.name,
            [x.school_name, `${x.class_name} ${x.section}`].filter(Boolean).join(" • "),
            () => Router.go(`notes/school/${x.school_id}/class/${encodeURIComponent(x.class_name)}/${encodeURIComponent(x.section)}`),
        ));

        return [...classRows, ...subjectRows, ...noteRows];
    },

    _quickAction(icon, label, onClick) {
        return h("button", { className: "quick-action", onClick }, [
            h("span", { className: "material-symbols-rounded" }, icon),
            h("span", {}, label),
        ]);
    },

    _stat(num, label) {
        return h("div", { className: "stat-card" }, [
            h("div", { className: "stat-num" }, String(num)),
            h("div", { className: "stat-label" }, label),
        ]);
    },
};

window.HomePage = HomePage;
