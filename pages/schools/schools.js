// ------------------------------------------------------------------
// pages/schools/schools.js
// routes:
//   schools                                        -> school list + explore bar
//   schools/:id                                    -> school screen (CLASSES ONLY)
//   schools/:id/members                            -> school members
//   schools/:id/class/:className                   -> sections of that class
//   schools/:id/class/:className/members            -> ALL members of the
//                                                       class, merged across
//                                                       every section (no
//                                                       "pick a section"
//                                                       step in between)
//   schools/:id/class/:className/:section/subjects -> subjects (Part 2 surface)
//   schools/:id/class/:className/:section/members  -> members of just that
//                                                       one section (role
//                                                       management lives here)
//
// Hierarchy rule (never flattened):  School -> Classes -> Sections -> Subjects
// ------------------------------------------------------------------

const SCHOOL_MAX_CLASSES = 30;          // backend: MAX_CLASSES_PER_SCHOOL
const SCHOOL_MAX_SECTIONS_PER_ADD = 10; // one add operation

const SchoolsPage = {
    async render(container, params) {
        if (!params || params.length === 0) return this._renderList(container);
        const schoolId = params[0];
        if (params[1] === "members") return this._renderMembers(container, schoolId);
        if (params[1] === "classes") return this._renderSchool(container, schoolId);

        if (params[1] === "class" && params[2]) {
            const className = decodeURIComponent(params[2]);
            // schools/:id/class/:className -> SECTIONS of this class
            if (params.length === 3) return this._renderSections(container, schoolId, className);

            // Class-level "Members" — one combined roster across every
            // section, reached directly from the class info card. This is
            // checked before params[3] is treated as a section name so a
            // class with several sections never makes the user pick one
            // first.
            if (params[3] === "members" && params.length === 4) {
                return this._renderAllClassMembers(container, schoolId, className);
            }

            const section = decodeURIComponent(params[3]);
            if (params[4] === "subjects") {
                return SchoolSubjectsPage.renderSubjects(container, schoolId, className, section);
            }
            if (params[4] === "members") {
                return this._renderClassMembers(container, schoolId, className, section);
            }
            if (params[4] === "subject" && params[5]) {
                const subjectName = params[6] ? decodeURIComponent(params[6]) : "";
                return SchoolSubjectsPage.renderChapters(container, schoolId, className, section, params[5], subjectName);
            }
            // A bare class + section IS its subjects: selecting a section
            // opens that section's subjects straight away (no in-between
            // info/notes boxes screen).
            return SchoolSubjectsPage.renderSubjects(container, schoolId, className, section);

        }

        return this._renderSchool(container, schoolId);
    },

    // ---------------- helpers ----------------

    _skeleton() {
        return h("div", { className: "skeleton-row" }, [
            h("div", { className: "skeleton skeleton-avatar" }),
            h("div", { className: "skeleton skeleton-line" }),
        ]);
    },

    _canManage(role) { return role === "Owner" || role === "Teacher"; },

    // ---------------- LIST ----------------

    async _renderList(container) {
        const header = h("div", { className: "app-header" }, [h("h1", {}, "Schools")]);
        mount(container, header, this._skeleton());

        let schools = [];
        try { schools = await SchoolsApi.dashboard(); }
        catch (err) { Toast.fromApiError(err); }

        // ---- Explore bar (always at the very top of the school area) ----
        const input = h("input", {
            placeholder: "Explore schools or search yours",
            autocomplete: "off", type: "search",
        });
        const clearBtn = h("button", { className: "explore-clear", type: "button", title: "Clear" }, [
            h("span", { className: "material-symbols-rounded" }, "close"),
        ]);
        clearBtn.style.display = "none";
        const exploreBar = h("div", { className: "explore-bar" }, [
            h("span", { className: "material-symbols-rounded" }, "search"),
            input,
            clearBtn,
        ]);

        const results = h("div", { className: "explore-results" });
        const listWrap = h("div", { className: "entity-list" });

        const paintMine = (query = "") => {
            const q = query.trim().toLowerCase();
            const mine = q ? schools.filter(s => (s.name || "").toLowerCase().includes(q)) : schools;

            if (!mine.length) {
                mount(listWrap, q
                    ? h("p", { className: "explore-hint" }, "None of your schools match that name.")
                    : EmptyState({
                        icon: "school",
                        title: "You haven't joined a school yet",
                        subtitle: "Create a school as a teacher, or join one with a code.",
                    }));
                return;
            }

            mount(listWrap, ...mine.map(s => h("button", {
                className: "entity-row", type: "button",
                onClick: () => Router.go(`schools/${s.id}`),
            }, [
                h("div", { className: "school-row-avatar" }, [
                    Avatar(s.name, s.profile_pic, "md"),
                    h("span", { className: `grid-tile-badge ${s.role === "Owner" ? "badge-owner" : ""}` }, s.role[0]),
                ]),
                h("div", { className: "entity-copy" }, [
                    h("strong", {}, s.name),
                    h("span", {}, s.description || "Tap to open classes"),
                ]),
                h("span", { className: "material-symbols-rounded entity-chevron" }, "chevron_right"),
            ])));
        };

        let timer = null;
        input.addEventListener("input", () => {
            const q = input.value.trim();
            clearBtn.style.display = q ? "grid" : "none";
            paintMine(q);
            clearTimeout(timer);
            if (q.length < 2) { clear(results); return; }
            timer = setTimeout(async () => {
                let found = [];
                try { found = await SchoolsApi.explore(q); } catch { clear(results); return; }
                const mineIds = new Set(schools.map(s => String(s.id)));
                const others = found.filter(f => !mineIds.has(String(f.id)));
                if (!others.length) { clear(results); return; }
                mount(results,
                    h("div", { className: "section-label" }, [h("span", {}, "Explore")]),
                    h("div", { className: "entity-list" }, others.map(sc => h("button", {
                        className: "entity-row", type: "button",
                        onClick: () => this._openCreateJoinSheet(),
                    }, [
                        Avatar(sc.name, sc.profile_pic, "md"),
                        h("div", { className: "entity-copy" }, [
                            h("strong", {}, sc.name),
                            h("span", {}, sc.joined ? "You're already a member" : "Ask a teacher for the join code"),
                        ]),
                        h("span", { className: "material-symbols-rounded entity-chevron" }, sc.joined ? "check" : "lock"),
                    ]))));
            }, 300);
        });
        clearBtn.addEventListener("click", () => {
            input.value = ""; clearBtn.style.display = "none"; clear(results); paintMine("");
        });

        paintMine("");

        const fab = h("button", { className: "fab", type: "button", onClick: () => this._openCreateJoinSheet() }, [
            h("span", { className: "material-symbols-rounded" }, "add"),
        ]);

        mount(container, header, exploreBar, results,
            h("div", { className: "section-label" }, [h("span", {}, "Your schools")]),
            listWrap, fab);
    },

    async _openCreateJoinSheet() {
        const user = await Session.getUser();
        const body = h("div", { className: "new-chat-sheet" }, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "SCHOOLS"),
            h("h3", {}, "Join or create a school"),
            h("div", { className: "tab-row" }, [
                h("button", { className: "tab-btn active", type: "button", dataset: { tab: "join" } }, "Join"),
                user?.role === "teacher" ? h("button", { className: "tab-btn", type: "button", dataset: { tab: "create" } }, "Create") : null,
            ].filter(Boolean)),
            h("div", { id: "school-sheet-body" }),
        ]);

        const overlay = Sheet.open(body);
        const tabs = qsa(".tab-btn", overlay);
        const showJoin = () => mount(qs("#school-sheet-body", overlay), this._joinForm());
        const showCreate = () => mount(qs("#school-sheet-body", overlay), this._createForm());

        tabs.forEach(btn => btn.addEventListener("click", () => {
            tabs.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            btn.dataset.tab === "join" ? showJoin() : showCreate();
        }));
        showJoin();
    },

    _joinForm() {
        const codeField = h("input", { placeholder: "e.g. ABC-123", maxlength: "8", style: "text-transform:uppercase" });
        const btn = h("button", { className: "btn btn-primary btn-block", type: "button" }, "Join school");
        btn.addEventListener("click", async () => {
            const code = codeField.value.trim();
            if (!code) return;
            btn.disabled = true; btn.textContent = "Joining...";
            try {
                await SchoolsApi.join(code);
                Toast.success("Joined the school");
                Sheet.close();
                SchoolsPage._renderList(qs("#app-content"));
            } catch (err) {
                Toast.fromApiError(err);
                btn.disabled = false; btn.textContent = "Join school";
            }
        });
        return h("div", {}, [
            h("div", { className: "field" }, [h("label", {}, "Join code"), codeField]),
            h("p", { className: "field-hint" }, "The join code is the only way into a school — ask an Owner or Teacher for it."),
            btn,
        ]);
    },

    // ---------------- CREATE: STEP 1 (school information) ----------------

    _createForm() {
        let iconFile = null;

        const preview = h("div", { className: "icon-picker-ring" }, [
            h("span", { className: "material-symbols-rounded" }, "add_a_photo"),
        ]);
        const fileInput = h("input", { type: "file", accept: "image/*", style: "display:none" });
        const pickBtn = h("button", { className: "", type: "button" }, [
            preview,
            h("span", { className: "avatar-edit-badge" }, [h("span", { className: "material-symbols-rounded" }, "photo_camera")]),
        ]);
        pickBtn.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            iconFile = file;
            mount(preview, h("img", { src: URL.createObjectURL(file), alt: "School icon" }));
        });

        const nameField = h("input", { placeholder: "e.g. Greenwood High" });
        const addressField = h("input", { placeholder: "Street, city" });
        const phoneField = h("input", { type: "tel", placeholder: "+91 90000 00000" });
        const descField = h("textarea", { placeholder: "What is this school about?" });

        const btn = h("button", { className: "btn btn-primary btn-block", type: "button" }, "Continue");
        btn.addEventListener("click", async () => {
            const name = nameField.value.trim();
            if (!name) { Toast.error("School name is required"); nameField.focus(); return; }
            btn.disabled = true; btn.textContent = "Creating...";
            try {
                const result = await SchoolsApi.create({
                    name,
                    description: descField.value.trim(),
                    address: addressField.value.trim(),
                    phone: phoneField.value.trim(),
                });
                const school = result?.school || {};
                if (iconFile && school.id) {
                    try { await SchoolsApi.uploadProfilePic(school.id, iconFile); }
                    catch { Toast.error("School created, but the icon didn't upload"); }
                }
                Sheet.close();
                SchoolsPage._openClassSetupSheet(school.id, school.name || name, school.join_code, 0, true);
            } catch (err) {
                Toast.fromApiError(err);
                btn.disabled = false; btn.textContent = "Continue";
            }
        });

        return h("div", {}, [
            this._steps(1),
            h("div", { className: "icon-picker" }, [pickBtn, fileInput]),
            h("p", { className: "icon-picker-label" }, "Add a school icon"),
            h("div", { className: "field" }, [h("label", {}, "School name"), nameField]),
            h("div", { className: "field" }, [h("label", {}, "Address"), addressField]),
            h("div", { className: "field" }, [h("label", {}, "Phone number"), phoneField]),
            h("div", { className: "field" }, [h("label", {}, "Description"), descField]),
            btn,
        ]);
    },

    _steps(active) {
        const step = (n, label) => h("div", { className: `create-step ${active === n ? "active" : ""}` }, [
            h("span", { className: "create-step-dot" }, String(n)),
            h("span", {}, label),
        ]);
        return h("div", { className: "create-steps" }, [
            step(1, "Details"),
            h("span", { className: "create-step-line" }),
            step(2, "Classes"),
        ]);
    },

    // ---------------- CREATE: STEP 2 (classes) ----------------

    // Shared by the creation flow and the "+" on the school screen.
    // `isSetup` shows the two-step header and a "Done" exit.
    _openClassSetupSheet(schoolId, schoolName, joinCode, existingCount = 0, isSetup = false) {
        const added = [];
        const nameField = h("input", { placeholder: "e.g. 10th" });
        const sectionsField = h("input", { placeholder: "A, B, C" });
        const chipRow = h("div", { className: "class-chip-row" });
        const note = h("div", { className: "limit-note" }, [
            h("span", { className: "material-symbols-rounded" }, "info"),
            h("span", {}, ""),
        ]);
        const addBtn = h("button", { className: "btn btn-soft btn-block", type: "button" }, [
            h("span", { className: "material-symbols-rounded" }, "add"), " Add another class",
        ]);
        const saveBtn = h("button", { className: "btn btn-primary btn-block", type: "button" },
            isSetup ? "Create classes" : "Add classes");
        const doneBtn = isSetup
            ? h("button", { className: "btn btn-ghost btn-block", type: "button", style: "margin-top:8px" }, "Skip for now")
            : null;

        const total = () => existingCount + added.length;

        const refresh = () => {
            mount(chipRow, ...added.map((cls, i) => h("span", { className: "class-chip" }, [
                `${cls.name} · ${cls.sections.join(", ")}`,
                h("button", {
                    type: "button", title: "Remove",
                    onClick: () => { added.splice(i, 1); refresh(); },
                }, [h("span", { className: "material-symbols-rounded" }, "close")]),
            ])));
            const atMax = total() >= SCHOOL_MAX_CLASSES;
            addBtn.disabled = atMax;
            nameField.disabled = atMax;
            sectionsField.disabled = atMax;
            note.classList.toggle("warn", atMax);
            qs("span:last-child", note).textContent = atMax
                ? `Maximum of ${SCHOOL_MAX_CLASSES} classes reached.`
                : `${total()} of ${SCHOOL_MAX_CLASSES} classes · up to ${SCHOOL_MAX_SECTIONS_PER_ADD} sections per class`;
            // The typed-but-not-added row still counts: the save button is
            // live as soon as there is a class name in the field.
            saveBtn.disabled = added.length === 0 && !nameField.value.trim();
        };

        nameField.addEventListener("input", refresh);

        // Moves whatever is typed in the two fields onto the list below.
        const takePending = ({ silent = false } = {}) => {
            const name = nameField.value.trim();
            const sections = sectionsField.value.split(",").map(s => s.trim()).filter(Boolean);
            if (!name) {
                if (!silent) { Toast.error("Class name is required"); nameField.focus(); }
                return false;
            }
            if (!sections.length) {
                if (!silent) { Toast.error("Add at least one section, e.g. A, B"); sectionsField.focus(); }
                return false;
            }
            if (sections.length > SCHOOL_MAX_SECTIONS_PER_ADD) {
                if (!silent) Toast.error(`You can add up to ${SCHOOL_MAX_SECTIONS_PER_ADD} sections at a time`);
                return false;
            }
            if (added.some(c => c.name.toLowerCase() === name.toLowerCase())) {
                if (!silent) Toast.error(`${name} is already in this list`);
                return false;
            }
            if (total() >= SCHOOL_MAX_CLASSES) return false;
            added.push({ name, sections: [...new Set(sections)] });
            nameField.value = ""; sectionsField.value = "";
            return true;
        };

        addBtn.addEventListener("click", () => {
            if (takePending()) { nameField.focus(); refresh(); }
        });

        saveBtn.addEventListener("click", async () => {
            // Save what's in the fields too — forgetting to tap "Add
            // another class" must never silently drop a class.
            takePending({ silent: true });
            refresh();
            if (!added.length) { Toast.error("Add a class name and its sections first."); return; }
            saveBtn.disabled = true; saveBtn.textContent = "Saving...";
            try {
                await ClassesApi.create(schoolId, added);
                Toast.success(added.length === 1 ? "Class created" : "Classes created");
                Sheet.close();
                if (isSetup && joinCode) SchoolsPage._showJoinCode(schoolName, joinCode);
                else SchoolsPage._reopenSchool(schoolId);
            } catch (err) {
                Toast.fromApiError(err);
                saveBtn.disabled = false; saveBtn.textContent = isSetup ? "Create classes" : "Add classes";
            }
        });

        if (doneBtn) doneBtn.addEventListener("click", () => {
            Sheet.close();
            if (joinCode) SchoolsPage._showJoinCode(schoolName, joinCode);
            else SchoolsPage._reopenSchool(schoolId);
        });

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            isSetup ? this._steps(2) : null,
            h("div", { className: "sheet-kicker" }, "CLASSES"),
            h("h3", {}, isSetup ? `Add classes to ${schoolName}` : "Add a class"),
            h("p", { className: "sheet-copy" }, "Give the class a name and its sections. Tap \"Add another class\" only if you want to set up more than one — otherwise just save."),
            h("div", { className: "field" }, [h("label", {}, "Class name"), nameField]),
            h("div", { className: "field" }, [h("label", {}, "Sections"), sectionsField]),
            addBtn,
            h("div", { style: "height:12px" }),
            chipRow,
            note,
            saveBtn,
            doneBtn,
        ].filter(Boolean)));

        refresh();
    },

    _reopenSchool(schoolId) {
        const container = qs("#app-content");
        if (container) this._renderSchool(container, schoolId);
    },

    _showJoinCode(schoolName, code) {
        const copyBtn = h("button", { className: "btn btn-primary btn-block", type: "button" }, "Copy join code");
        copyBtn.addEventListener("click", async () => {
            if (await copyToClipboard(code)) Toast.success("Join code copied");
            else Toast.error("Couldn't copy — note it down instead");
        });
        const closeBtn = h("button", { className: "btn btn-ghost btn-block", type: "button", style: "margin-top:8px" }, "Done");
        closeBtn.addEventListener("click", () => { Sheet.close(); SchoolsPage._renderList(qs("#app-content")); });

        Sheet.open(h("div", { style: "text-align:center" }, [
            h("div", { className: "sheet-handle" }),
            h("span", { className: "material-symbols-rounded", style: "font-size:40px;color:var(--primary)" }, "check_circle"),
            h("h3", { style: "margin-top:8px" }, `${schoolName} is ready`),
            h("p", { style: "color:var(--muted);font-size:.88rem;margin:6px 0 14px" },
                "Share this code with teachers and students so they can join."),
            h("div", { className: "school-info-code", style: "justify-content:center;margin-bottom:14px" }, [
                h("strong", { style: "letter-spacing:.18em;font-size:1.3rem" }, code),
            ]),
            copyBtn,
            closeBtn,
        ]));
    },

    // ---------------- SCHOOL SCREEN (CLASSES ONLY) ----------------

    async _renderSchool(container, schoolId) {
        const backHeader = h("div", { className: "app-header" }, [
            h("button", { className: "back-btn", type: "button", onClick: () => Router.goBack("schools") },
                [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("h1", {}, "School"),
        ]);
        mount(container, backHeader, this._skeleton());

        const [info, classes] = await Promise.all([
            SchoolsApi.info(schoolId).catch(() => null),
            ClassesApi.list(schoolId).catch(err => err),
        ]);

        if (classes instanceof Error) {
            mount(container, backHeader, EmptyState({
                icon: "class", title: "Couldn't load classes", subtitle: classes.message,
            }));
            return;
        }

        const role = info?.role || null;
        const canManage = this._canManage(role);

        // Groups-style header: back + school icon/name, tapping the identity
        // opens the school information card.
        const topbar = h("div", { className: "school-topbar" }, [
            h("button", { className: "back-btn", type: "button", onClick: () => Router.goBack("schools") },
                [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("button", {
                className: "school-identity", type: "button",
                onClick: () => this._openSchoolInfoSheet(schoolId, info, classes.length),
            }, [
                Avatar(info?.name || "School", info?.profile_pic, "sm"),
                h("div", { className: "school-identity-text" }, [
                    h("strong", {}, info?.name || "School"),
                    h("span", {}, `${classes.length} ${classes.length === 1 ? "class" : "classes"}${role ? ` · ${role}` : ""}`),
                ]),
            ]),
            h("button", {
                className: "header-action", type: "button", title: "School information",
                onClick: () => this._openSchoolInfoSheet(schoolId, info, classes.length),
            }, [h("span", { className: "material-symbols-rounded" }, "info")]),
        ]);

        // CLASSES ONLY at this level — sections live inside a class.
        const list = classes.length
            ? h("div", { className: "entity-list" }, classes.map(cls => {
                const count = cls.sections?.length || 0;
                const row = h("button", {
                    className: "entity-row", type: "button",
                    onClick: () => Router.go(`schools/${schoolId}/class/${encodeURIComponent(cls.name)}`),
                }, [
                    h("div", { className: "entity-badge is-long", style: `background:${colorFor(String(cls.name))};color:#fff` }, String(cls.name).slice(0, 4)),
                    h("div", { className: "entity-copy" }, [
                        h("strong", {}, cls.name),
                        h("span", {}, `${count} ${count === 1 ? "section" : "sections"}`),
                    ]),
                    h("span", { className: "material-symbols-rounded entity-chevron" }, "chevron_right"),
                ]);

                // Press-and-hold a class card — Owner/Teacher only. Same
                // gesture and same hold -> action sheet (Edit/Delete)
                // pattern as sections/subjects/notes; normal tap still
                // just opens the class. Reuses _openClassOptions, the
                // same sheet already reachable from the "⋮" button one
                // level in, so there's exactly one rename/delete flow.
                if (canManage) {
                    let timer = null, firedLongPress = false;
                    const openManage = () => {
                        row.classList.remove("is-holding");
                        this._openClassOptions(schoolId, cls.name, role);
                    };
                    const start = () => {
                        firedLongPress = false;
                        row.classList.add("is-holding");
                        timer = setTimeout(() => { firedLongPress = true; openManage(); }, 480);
                    };
                    const cancel = () => { clearTimeout(timer); row.classList.remove("is-holding"); };
                    row.addEventListener("pointerdown", start);
                    row.addEventListener("pointerup", cancel);
                    row.addEventListener("pointerleave", cancel);
                    row.addEventListener("pointercancel", cancel);
                    row.addEventListener("contextmenu", (e) => { e.preventDefault(); cancel(); openManage(); });
                    row.addEventListener("click", (e) => { if (firedLongPress) e.stopImmediatePropagation(); }, true);
                }

                return row;
            }))
            : EmptyState({
                icon: "class",
                title: "No classes yet",
                subtitle: canManage
                    ? "Tap + to add the first class for this school."
                    : "Your teachers haven't added any classes yet.",
            });

        const atMax = classes.length >= SCHOOL_MAX_CLASSES;
        const fab = canManage && !atMax ? h("button", {
            className: "fab", type: "button",
            onClick: () => this._openClassSetupSheet(schoolId, info?.name || "this school", null, classes.length, false),
        }, [h("span", { className: "material-symbols-rounded" }, "add")]) : null;

        mount(container, topbar,
            h("div", { className: "section-label" }, [
                h("span", {}, "Classes"),
                h("span", {}, String(classes.length)),
            ]),
            list,
            canManage && atMax ? h("div", { className: "limit-note warn", style: "margin-top:12px" }, [
                h("span", { className: "material-symbols-rounded" }, "info"),
                h("span", {}, `Maximum of ${SCHOOL_MAX_CLASSES} classes reached.`),
            ]) : null,
            fab);
    },

    // ---------------- SCHOOL INFORMATION CARD ----------------

    _openSchoolInfoSheet(schoolId, info, classCount = 0) {
        if (!info) { Toast.error("Couldn't load school information"); return; }
        const role = info.role || null;
        const isOwner = role === "Owner";
        const canManage = this._canManage(role);

        const avatarWrap = h("div", { className: "school-avatar-edit" }, [
            Avatar(info.name, info.profile_pic, "lg"),
            isOwner ? h("span", { className: "avatar-edit-badge" }, [h("span", { className: "material-symbols-rounded" }, "photo_camera")]) : null,
        ].filter(Boolean));

        if (isOwner) {
            const fileInput = h("input", { type: "file", accept: "image/*", style: "display:none" });
            avatarWrap.appendChild(fileInput);
            avatarWrap.addEventListener("click", () => fileInput.click());
            fileInput.addEventListener("change", async () => {
                const file = fileInput.files?.[0];
                if (!file) return;
                avatarWrap.classList.add("uploading");
                try {
                    await SchoolsApi.uploadProfilePic(schoolId, file);
                    Toast.success("School icon updated");
                    Sheet.close();
                    this._reopenSchool(schoolId);
                } catch (err) { Toast.fromApiError(err); avatarWrap.classList.remove("uploading"); }
            });
        }

        const infoItem = (icon, value, label, opts = {}) => h("div", {
            className: `school-info-item ${opts.onClick ? "tappable" : ""}`,
            onClick: opts.onClick,
        }, [
            h("span", { className: "material-symbols-rounded" }, icon),
            h("div", { className: "school-info-item-copy" }, [
                h("strong", {}, value),
                h("span", {}, label),
            ]),
            opts.chevron ? h("span", { className: "material-symbols-rounded school-info-chevron" }, "chevron_right") : null,
        ].filter(Boolean));

        const items = [
            infoItem("group", `${info.member_count ?? 0} ${info.member_count === 1 ? "member" : "members"}`, "Members", {
                chevron: true,
                onClick: () => { Sheet.close(); Router.go(`schools/${schoolId}/members`); },
            }),
            infoItem("class", `${classCount} ${classCount === 1 ? "class" : "classes"}`, "Classes"),
            info.description ? infoItem("info", info.description, "Description") : null,
            info.address ? infoItem("location_on", info.address, "Address") : null,
            info.phone ? infoItem("call", info.phone, "Phone number") : null,
            info.join_code ? infoItem("key", info.join_code, "Join code · tap to copy", {
                onClick: async () => {
                    if (await copyToClipboard(info.join_code)) Toast.success("Join code copied");
                    else Toast.error("Couldn't copy — note it down instead");
                },
            }) : null,
        ].filter(Boolean);

        const actions = [];
        if (isOwner) {
            actions.push(h("button", {
                className: "btn btn-soft btn-block", type: "button",
                onClick: () => this._openEditSchoolSheet(schoolId, info),
            }, [h("span", { className: "material-symbols-rounded" }, "edit"), " Edit school details"]));
        }
        if (canManage) {
            actions.push(h("button", {
                className: "btn btn-ghost btn-block", type: "button",
                onClick: () => { Sheet.close(); Router.go(`schools/${schoolId}/members`); },
            }, [h("span", { className: "material-symbols-rounded" }, "manage_accounts"), " Manage members & roles"]));
        }
        if (!isOwner) {
            actions.push(h("button", {
                className: "btn btn-outline-danger btn-block", type: "button",
                onClick: () => {
                    Sheet.close();
                    confirmAction({
                        title: "Leave school?",
                        message: `You'll lose access to ${info.name}'s classes and notes.`,
                        confirmLabel: "Leave",
                        onConfirm: async () => {
                            await SchoolsApi.leave(schoolId);
                            Toast.success("Left the school");
                            Router.go("schools");
                        },
                    });
                },
            }, "Leave school"));
        }

        Sheet.open(h("div", { className: "school-info-sheet" }, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "school-info-hero" }, [
                avatarWrap,
                h("div", { className: "school-info-hero-copy" }, [
                    h("h2", {}, info.name),
                    role ? h("span", { className: "role-pill" }, [
                        h("span", { className: "material-symbols-rounded" }, "verified"), role,
                    ]) : null,
                ].filter(Boolean)),
            ]),
            h("div", { className: "school-info-list" }, items),
            h("div", { className: "school-action-stack" }, actions),
        ]));
    },

    _openEditSchoolSheet(schoolId, info) {
        const nameField = h("input", { value: info.name || "", placeholder: "School name" });
        const addressField = h("input", { value: info.address || "", placeholder: "Address" });
        const phoneField = h("input", { type: "tel", value: info.phone || "", placeholder: "Phone number" });
        const descField = h("textarea", { placeholder: "Description" });
        descField.value = info.description || "";

        const btn = h("button", { className: "btn btn-primary btn-block", type: "button" }, "Save changes");
        btn.addEventListener("click", async () => {
            const name = nameField.value.trim();
            if (!name) { Toast.error("School name is required"); return; }
            btn.disabled = true; btn.textContent = "Saving...";
            try {
                await SchoolsApi.update(schoolId, {
                    name,
                    address: addressField.value.trim(),
                    phone: phoneField.value.trim(),
                    description: descField.value.trim(),
                });
                Toast.success("School updated");
                Sheet.close();
                this._reopenSchool(schoolId);
            } catch (err) { Toast.fromApiError(err); btn.disabled = false; btn.textContent = "Save changes"; }
        });

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "SCHOOL DETAILS"),
            h("h3", {}, "Edit school"),
            h("p", { className: "sheet-copy" }, "Only the Owner can change the school's identity."),
            h("div", { className: "field" }, [h("label", {}, "School name"), nameField]),
            h("div", { className: "field" }, [h("label", {}, "Address"), addressField]),
            h("div", { className: "field" }, [h("label", {}, "Phone number"), phoneField]),
            h("div", { className: "field" }, [h("label", {}, "Description"), descField]),
            btn,
        ]));
    },

    // ---------------- CLASS SCREEN (SECTIONS) ----------------

    async _renderSections(container, schoolId, className) {
        const header = h("div", { className: "app-header" }, [
            h("button", { className: "back-btn", type: "button", onClick: () => Router.goBack(`schools/${schoolId}`) },
                [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("h1", {}, className),
        ]);
        mount(container, header, this._skeleton());

        const [info, classes] = await Promise.all([
            SchoolsApi.info(schoolId).catch(() => null),
            ClassesApi.list(schoolId).catch(err => err),
        ]);

        if (classes instanceof Error) {
            mount(container, header, EmptyState({
                icon: "class", title: "Couldn't load this class", subtitle: classes.message,
            }));
            return;
        }

        const cls = classes.find(c => c.name === className);
        if (!cls) {
            mount(container, header, EmptyState({
                icon: "class", title: "Class not found",
                subtitle: "It may have been renamed or removed.",
            }));
            return;
        }

        const role = info?.role || null;
        const canManage = this._canManage(role);
        const sections = cls.sections || [];

        // Class-level header only — no school address/phone/join code here.
        // Tapping the identity (name) opens the class info card, the same
        // interaction pattern as the school topbar — but the card only
        // ever shows the class name and its member count. No avatar, no
        // description, and it is never a "Members / Classes" chooser.
        const topbar = h("div", { className: "school-topbar" }, [
            h("button", { className: "back-btn", type: "button", onClick: () => Router.goBack(`schools/${schoolId}`) },
                [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("button", {
                className: "school-identity", type: "button",
                onClick: () => this._openClassInfoSheet(className, sections, info, schoolId),
            }, [
                h("span", {
                    className: `entity-badge${String(className).length > 3 ? " is-long" : ""}`,
                }, String(className).slice(0, 4)),
                h("div", { className: "school-identity-text" }, [
                    h("strong", {}, className),
                    h("span", {},
                        `${sections.length} ${sections.length === 1 ? "section" : "sections"}${info?.name ? ` · ${info.name}` : ""}`),
                ]),
            ]),
            canManage ? h("button", {
                className: "header-action", type: "button", title: "Class options",
                onClick: () => this._openClassOptions(schoolId, className, role),
            }, [h("span", { className: "material-symbols-rounded" }, "more_vert")]) : null,
        ].filter(Boolean));

        // Starred class-sections power the Notes tab, so the star has to
        // be reachable from the section list — it's the only place a
        // class exists as a row. Failing to load stars must not break
        // the list itself, hence the silent catch.
        const stars = await StarsApi.list().catch(() => null);
        const starredClasses = new Set((stars?.classes || []).map(c => c.id));

        const list = sections.length
            ? h("div", { className: "entity-list" }, sections.map(sec => {
                const row = h("div", {
                    className: "entity-row",
                    // Opens this section's subjects directly.
                    onClick: () => Router.go(`schools/${schoolId}/class/${encodeURIComponent(className)}/${encodeURIComponent(sec.section)}/subjects`),
                }, [
                    h("div", { className: "entity-badge is-long", style: `background:${colorFor(String(sec.section))};color:#fff` }, String(sec.section).slice(0, 4)),
                    h("div", { className: "entity-copy" }, [
                        h("strong", {}, `${className} ${sec.section}`),
                        h("span", {}, sec.teacher_name
                            ? `${sec.teacher_name} · ${sec.member_count} ${sec.member_count === 1 ? "member" : "members"}`
                            : `${sec.member_count} ${sec.member_count === 1 ? "member" : "members"}`),
                    ]),
                    this._classStarToggle(sec.id, starredClasses.has(sec.id)),
                ]);

                // Press-and-hold to manage a section — Owner/Teacher only.
                // Same gesture AND same two-step pattern (hold -> action
                // sheet -> Delete -> confirm) used for subjects and notes,
                // rather than jumping straight to the confirm dialog.
                if (canManage) {
                    let timer = null, firedLongPress = false;
                    const openManage = () => {
                        row.classList.remove("is-holding");
                        this._openSectionActionsSheet(schoolId, className, sec);
                    };
                    const start = () => {
                        firedLongPress = false;
                        row.classList.add("is-holding");
                        timer = setTimeout(() => { firedLongPress = true; openManage(); }, 480);
                    };
                    const cancel = () => { clearTimeout(timer); row.classList.remove("is-holding"); };
                    row.addEventListener("pointerdown", start);
                    row.addEventListener("pointerup", cancel);
                    row.addEventListener("pointerleave", cancel);
                    row.addEventListener("pointercancel", cancel);
                    row.addEventListener("contextmenu", (e) => { e.preventDefault(); cancel(); openManage(); });
                    row.addEventListener("click", (e) => { if (firedLongPress) e.stopImmediatePropagation(); }, true);
                }

                return row;
            }))

            : EmptyState({
                icon: "meeting_room",
                title: "No sections yet",
                subtitle: canManage ? "Tap + to add sections to this class." : "No sections have been added yet.",
            });

        const fab = canManage ? h("button", {
            className: "fab", type: "button",
            onClick: () => this._openAddSectionsSheet(schoolId, className, sections.map(s => s.section)),
        }, [h("span", { className: "material-symbols-rounded" }, "add")]) : null;

        mount(container, topbar,
            h("div", { className: "section-label" }, [
                h("span", {}, "Sections"),
                h("span", {}, String(sections.length)),
            ]),
            list, fab);
    },

    // Press-and-hold on a section row — Owner/Teacher only, reached via
    // long press. Only Delete applies here (a section's name/letter isn't
    // independently renamable — renaming the class itself, which covers
    // all of its sections, stays on the class "⋮" menu), but it still
    // goes through the same action-sheet step as subjects and notes
    // rather than confirming immediately.
    _openSectionActionsSheet(schoolId, className, sec) {
        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "SECTION"),
            h("h3", {}, `${className} ${sec.section}`),
            h("button", {
                className: "action-tile", type: "button",
                onClick: () => {
                    Sheet.close();
                    confirmAction({
                        title: `Delete ${className} ${sec.section}?`,
                        message: "This removes the section along with its subjects, chapters and notes for everyone. This can't be undone.",
                        confirmLabel: "Delete", danger: true,
                        onConfirm: async () => {
                            try {
                                await ClassesApi.deleteSection(schoolId, className, sec.section);
                                Toast.success("Section deleted");
                                SchoolsPage._renderSections(qs("#app-content"), schoolId, className);
                            } catch (err) { Toast.fromApiError(err); }
                        },
                    });
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "delete"),
                h("div", {}, [h("strong", {}, "Delete section"), h("span", {}, "Removes this section and its subjects, chapters and notes")]),
            ]),
        ]));
    },

    // Class identity card. It stays minimal (a class has no photo /
    // description / join code of its own — those belong to the school),
    // but the member count is now a way in, not a dead fact: tapping it
    // closes this card and goes straight to the class's combined member
    // roster (every section merged into one list) — no in-between "which
    // section?" step, even when the class has several sections.
    _openClassInfoSheet(className, sections = [], schoolInfo, schoolId) {
        const totalMembers = sections.reduce((sum, s) => sum + (s.member_count || 0), 0);
        const openMembers = () => {
            Sheet.close();
            Router.go(`schools/${schoolId}/class/${encodeURIComponent(className)}/members`);
        };

        const membersEntry = (!schoolId || !sections.length)
            ? h("div", { className: "school-info-item" }, [
                h("span", { className: "material-symbols-rounded" }, "group"),
                h("div", { className: "school-info-item-copy" }, [
                    h("strong", {}, `${totalMembers} ${totalMembers === 1 ? "member" : "members"}`),
                    h("span", {}, `Across ${sections.length} ${sections.length === 1 ? "section" : "sections"}`),
                ]),
            ])
            : h("div", {
                className: "school-info-item tappable", role: "button", tabindex: "0",
                onClick: openMembers,
            }, [
                h("span", { className: "material-symbols-rounded" }, "group"),
                h("div", { className: "school-info-item-copy" }, [
                    h("strong", {}, `${totalMembers} ${totalMembers === 1 ? "member" : "members"}`),
                    h("span", {}, sections.length === 1
                        ? "View members and manage their roles"
                        : `Across ${sections.length} sections · tap to view and manage roles`),
                ]),
                h("span", { className: "material-symbols-rounded school-info-chevron" }, "chevron_right"),
            ]);

        Sheet.open(h("div", { className: "school-info-sheet" }, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "school-info-hero" }, [
                h("span", {
                    className: `entity-badge${String(className).length > 3 ? " is-long" : ""}`,
                }, String(className).slice(0, 4)),
                h("div", { className: "school-info-hero-copy" }, [
                    h("h2", {}, className),
                    schoolInfo?.name ? h("span", { className: "role-pill" }, [
                        h("span", { className: "material-symbols-rounded" }, "school"), schoolInfo.name,
                    ]) : null,
                ].filter(Boolean)),
            ]),
            h("div", { className: "school-info-list" }, [membersEntry]),
        ]));
    },

    // Star toggle for a class-section row. Rendered as a <span> with a
    // button role on purpose: the row itself is already a <button>, and
    // a nested <button> is invalid HTML (Android WebView drops the
    // inner click target entirely). Stars are personal — this only
    // pins the class to the user's Notes tab.
    _classStarToggle(classId, isStarred) {
        const el = h("span", {
            className: `btn-icon star-btn ${isStarred ? "starred" : ""}`,
            role: "button",
            tabindex: "0",
            "aria-pressed": String(isStarred),
            title: isStarred ? "Remove from starred" : "Star for quick access",
        }, [h("span", { className: "material-symbols-rounded" }, isStarred ? "star" : "star_border")]);

        let starred = isStarred;
        const paint = s => {
            el.classList.toggle("starred", s);
            el.setAttribute("aria-pressed", String(s));
            el.title = s ? "Remove from starred" : "Star for quick access";
            qs("span", el).textContent = s ? "star" : "star_border";
        };

        // Instant flip, background confirm: the star (and its toast) show
        // right away instead of waiting on the round trip. A failed or
        // stuck (20s+) toggle rolls the icon back to what it was.
        const toggle = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const previous = starred;
            const next = !starred;
            starred = next;
            Optimistic.run({
                timeoutMs: 20000,
                apply: () => { paint(next); Toast.show(next ? "Added to your Notes tab" : "Removed from your Notes tab"); },
                action: () => StarsApi.toggle("class", classId, previous),
                revert: () => { starred = previous; paint(previous); },
                onError: () => Toast.error("Couldn't update your star. Check your connection."),
            });
        };

        el.addEventListener("click", toggle);
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") toggle(e); });
        return el;
    },

    _openAddSectionsSheet(schoolId, className, existing = []) {
        const field = h("input", { placeholder: "A, B, C, D" });
        const note = h("div", { className: "limit-note" }, [
            h("span", { className: "material-symbols-rounded" }, "info"),
            h("span", {}, `Up to ${SCHOOL_MAX_SECTIONS_PER_ADD} sections in one go.`),
        ]);
        const btn = h("button", { className: "btn btn-primary btn-block", type: "button" }, "Add sections");

        field.addEventListener("input", () => {
            const count = field.value.split(",").map(s => s.trim()).filter(Boolean).length;
            const over = count > SCHOOL_MAX_SECTIONS_PER_ADD;
            note.classList.toggle("warn", over);
            qs("span:last-child", note).textContent = over
                ? `Too many — remove ${count - SCHOOL_MAX_SECTIONS_PER_ADD}. Maximum ${SCHOOL_MAX_SECTIONS_PER_ADD} per add.`
                : `${count} of ${SCHOOL_MAX_SECTIONS_PER_ADD} sections in one go.`;
            btn.disabled = over || count === 0;
        });

        btn.addEventListener("click", async () => {
            const sections = [...new Set(field.value.split(",").map(s => s.trim()).filter(Boolean))];
            if (!sections.length) return;
            if (sections.length > SCHOOL_MAX_SECTIONS_PER_ADD) {
                Toast.error(`You can add up to ${SCHOOL_MAX_SECTIONS_PER_ADD} sections at a time`); return;
            }
            const clash = sections.find(s => existing.includes(s));
            if (clash) { Toast.error(`Section ${clash} already exists in ${className}`); return; }

            btn.disabled = true; btn.textContent = "Adding...";
            try {
                await ClassesApi.create(schoolId, [{ name: className, sections }]);
                Toast.success(sections.length === 1 ? "Section added" : "Sections added");
                Sheet.close();
                this._renderSections(qs("#app-content"), schoolId, className);
            } catch (err) { Toast.fromApiError(err); btn.disabled = false; btn.textContent = "Add sections"; }
        });

        btn.disabled = true;

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "SECTIONS"),
            h("h3", {}, `Add sections to ${className}`),
            h("p", { className: "sheet-copy" }, "Separate section names with commas — each one becomes its own section."),
            h("div", { className: "field" }, [h("label", {}, "Section names"), field]),
            note,
            btn,
        ]));
    },

    _openClassOptions(schoolId, className, role) {
        const canDelete = this._canManage(role);
        const options = [];

        options.push(h("button", {
            className: "action-tile", type: "button",
            onClick: () => { Sheet.close(); this._openRenameClassSheet(schoolId, className); },
        }, [
            h("span", { className: "material-symbols-rounded" }, "edit"),
            h("div", {}, [h("strong", {}, "Rename class"), h("span", {}, "Change the class name")]),
        ]));

        if (canDelete) {
            options.push(h("button", {
                className: "action-tile", type: "button",
                onClick: () => {
                    Sheet.close();
                    confirmAction({
                        title: `Delete ${className}?`,
                        message: "All of its sections and their content will be removed.",
                        confirmLabel: "Delete",
                        onConfirm: async () => {
                            await ClassesApi.deleteClass(schoolId, className);
                            Toast.success("Class deleted");
                            Router.go(`schools/${schoolId}`);
                        },
                    });
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "delete"),
                h("div", {}, [h("strong", {}, "Delete class"), h("span", {}, "Removes the class and its sections")]),
            ]));
        }

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "CLASS"),
            h("h3", {}, className),
            h("p", { className: "sheet-copy" }, "Class-level actions only."),
            ...options,
        ]));
    },

    _openRenameClassSheet(schoolId, className) {
        const field = h("input", { value: className, placeholder: "Class name" });
        const btn = h("button", { className: "btn btn-primary btn-block", type: "button" }, "Rename");
        btn.addEventListener("click", async () => {
            const newName = field.value.trim();
            if (!newName || newName === className) return;
            btn.disabled = true; btn.textContent = "Renaming...";
            try {
                await ClassesApi.rename(schoolId, className, newName);
                Toast.success("Class renamed");
                Sheet.close();
                Router.go(`schools/${schoolId}/class/${encodeURIComponent(newName)}`);
            } catch (err) { Toast.fromApiError(err); btn.disabled = false; btn.textContent = "Rename"; }
        });
        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "CLASS"),
            h("h3", {}, `Rename ${className}`),
            h("div", { className: "field", style: "margin-top:14px" }, [h("label", {}, "Class name"), field]),
            btn,
        ]));
    },

    // ---------------- MEMBERS ----------------

    async _renderMembers(container, schoolId) {
        const header = h("div", { className: "app-header" }, [
            h("button", { className: "back-btn", type: "button", onClick: () => Router.goBack(`schools/${schoolId}`) },
                [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("h1", {}, "Members"),
        ]);
        mount(container, header, this._skeleton());

        let members = [];
        let loadError = null;
        try { members = await SchoolsApi.members(schoolId); }
        catch (err) { loadError = err; }

        if (loadError) {
            mount(container, header, EmptyState({ icon: "group", title: "Couldn't load members", subtitle: loadError.message }));
            return;
        }

        members.forEach(m => EntityCache.rememberUser({ id: m.id, username: m.username, name: m.full_name, profile_pic: m.profile_pic }));

        const currentUserId = (await Session.getUser())?.id;
        const myRole = members.find(m => String(m.id) === String(currentUserId))?.role;
        const canManageRoles = myRole === "Owner" || myRole === "Teacher";
        const assignableRoles = myRole === "Owner" ? ["Owner", "Teacher", "Helper", "Member"] : ["Teacher", "Helper", "Member"];

        const list = members.length
            ? h("div", { className: "card" }, members.map(m => {
                const isSelf = String(m.id) === String(currentUserId);
                return h("div", {
                    className: "card-row", onClick: () => openProfilePreview({
                        id: m.id, username: m.username, name: m.full_name, role: m.role, profile_pic: m.profile_pic,
                    }, {
                        onMessage: isSelf ? undefined : (u) => Router.go(`messages/dm/${u.id}`),
                    }),
                }, [
                    Avatar(m.full_name || m.username, m.profile_pic, "sm"),
                    h("div", { className: "card-row-text" }, [
                        h("div", { className: "card-row-title" }, m.full_name || m.username),
                        h("div", { className: "card-row-sub" }, `@${m.username}`),
                    ]),
                    canManageRoles && !isSelf
                        ? h("button", {
                            className: "member-role-btn", type: "button",
                            onClick: (e) => { e.stopPropagation(); this._openRoleMenu(schoolId, m, assignableRoles); },
                        }, [m.role, h("span", { className: "material-symbols-rounded" }, "expand_more")])
                        : h("span", { className: `badge ${m.role === "Owner" ? "badge-owner" : "badge-role"}` }, m.role),
                ]);
            }))
            : EmptyState({ icon: "group", title: "No members found" });

        mount(container, header, list);
    },

    // Role menu — mirrors the Groups role-changing system exactly: same
    // action-tile sheet, same "backend is the source of truth" rule
    // (only an Owner may assign Owner, so a Teacher never sees it).
    _openRoleMenu(schoolId, member, assignableRoles) {
        const roleCopy = { Owner: "Full control of the school", Teacher: "Can manage classes and members", Helper: "Can upload notes only", Member: "Regular school member" };
        const roleIcon = { Owner: "workspace_premium", Teacher: "school", Helper: "support_agent", Member: "person" };
        const options = assignableRoles.map(role => h("button", {
            className: `action-tile role-option ${role === member.role ? "selected" : ""}`, type: "button",
            onClick: async () => {
                if (role === member.role) { Sheet.close(); return; }
                try {
                    await SchoolsApi.changeRole(schoolId, member.id, role);
                    Toast.success(`${member.full_name || member.username} is now ${role}`);
                    Sheet.close();
                    this._renderMembers(qs("#app-content"), schoolId);
                } catch (err) { Toast.fromApiError(err); }
            },
        }, [
            h("span", { className: "material-symbols-rounded" }, roleIcon[role] || "person"),
            h("div", {}, [h("strong", {}, role), h("span", {}, roleCopy[role] || "")]),
            role === member.role ? h("span", { className: "material-symbols-rounded role-selected" }, "check_circle") : null,
        ]));
        Sheet.open(h("div", { className: "role-sheet" }, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "ROLE MANAGEMENT"),
            h("h3", {}, `Manage ${member.full_name || member.username}`),
            h("p", { className: "profile-meta" }, `Currently ${member.role} in this school.`),
            ...options,
        ]));
    },

    // ---------------- CLASS MEMBERS (ALL SECTIONS, MERGED) ----------------
    // Reached from the class info card's "Members" row. Membership is
    // stored per section on the backend, but the user never picks one —
    // this fetches every section's roster in parallel and shows them as
    // one list (with a small section heading between groups when the
    // class has more than one section).
    async _renderAllClassMembers(container, schoolId, className) {
        const header = h("div", { className: "app-header" }, [
            h("button", { className: "back-btn", type: "button", onClick: () => Router.goBack(`schools/${schoolId}/class/${encodeURIComponent(className)}`) },
                [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("div", { className: "chat-header-text" }, [
                h("h1", {}, className),
                h("span", { className: "chat-header-sub" }, "Members"),
            ]),
        ]);
        mount(container, header, this._skeleton());

        let classes = [];
        try { classes = await ClassesApi.list(schoolId); }
        catch (err) {
            mount(container, header, EmptyState({ icon: "group", title: "Couldn't load members", subtitle: err.message }));
            return;
        }

        const cls = classes.find(c => c.name === className);
        const sections = cls?.sections || [];
        if (!sections.length) {
            mount(container, header, EmptyState({ icon: "group", title: "No members found" }));
            return;
        }

        const results = await Promise.all(sections.map(sec =>
            ClassesApi.members(schoolId, className, sec.section)
                .then(members => ({ section: sec.section, members, error: null }))
                .catch(err => ({ section: sec.section, members: [], error: err }))
        ));

        if (results.every(r => r.error) ) {
            mount(container, header, EmptyState({ icon: "group", title: "Couldn't load members", subtitle: results[0].error.message }));
            return;
        }

        let mySchoolRole = null;
        try { const dash = await SchoolsApi.dashboard(); mySchoolRole = dash.find(s => String(s.id) === String(schoolId))?.role; }
        catch { /* role controls just won't show if this fails */ }
        const canManageRoles = this._canManage(mySchoolRole);
        const currentUserId = (await Session.getUser())?.id;

        const refresh = () => this._renderAllClassMembers(qs("#app-content"), schoolId, className);

        const memberRow = (m, sectionName) => {
            const isSelf = String(m.id) === String(currentUserId);
            return h("div", { className: "card-row" }, [
                h("div", { className: "card-row-text" }, [
                    h("div", { className: "card-row-title" }, `${m.full_name || m.username}${isSelf ? " (you)" : ""}`),
                ]),
                canManageRoles && !isSelf
                    ? h("button", {
                        className: "member-role-btn", type: "button",
                        onClick: (e) => { e.stopPropagation(); this._openClassRoleMenu(schoolId, className, sectionName, m, refresh); },
                    }, [m.role, h("span", { className: "material-symbols-rounded" }, "expand_more")])
                    : h("span", { className: `badge ${m.role === "Owner" ? "badge-owner" : "badge-role"}` }, m.role),
            ]);
        };

        const withMembers = results.filter(r => r.members.length);
        if (!withMembers.length) {
            mount(container, header, EmptyState({ icon: "group", title: "No members found" }));
            return;
        }

        const multiSection = sections.length > 1;
        const blocks = withMembers.map(r => h("div", {}, [
            multiSection ? h("div", { className: "section-label" }, [
                h("span", {}, `${className} ${r.section}`),
                h("span", {}, String(r.members.length)),
            ]) : null,
            h("div", { className: "card" }, r.members.map(m => memberRow(m, r.section))),
        ].filter(Boolean)));

        mount(container, header, ...blocks);
    },

    // ---------------- CLASS MEMBERS (SINGLE SECTION) ----------------

    async _renderClassMembers(container, schoolId, className, section) {
        const header = h("div", { className: "app-header" }, [
            h("button", { className: "back-btn", type: "button", onClick: () => Router.goBack(`schools/${schoolId}/class/${encodeURIComponent(className)}/${encodeURIComponent(section)}/subjects`) },
                [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("div", { className: "chat-header-text" }, [
                h("h1", {}, `${className} ${section}`),
                h("span", { className: "chat-header-sub" }, "Members"),
            ]),
        ]);
        mount(container, header, this._skeleton());

        let members = [];
        let loadError = null;
        try { members = await ClassesApi.members(schoolId, className, section); }
        catch (err) { loadError = err; }

        if (loadError) {
            mount(container, header, EmptyState({ icon: "group", title: "Couldn't load members", subtitle: loadError.message }));
            return;
        }

        // Class role management is a SCHOOL-level authority (Owner/Teacher
        // of the school), matching the backend's own check.
        let mySchoolRole = null;
        try { const dash = await SchoolsApi.dashboard(); mySchoolRole = dash.find(s => String(s.id) === String(schoolId))?.role; }
        catch { /* role controls just won't show if this fails */ }
        const canManageRoles = this._canManage(mySchoolRole);
        const currentUserId = (await Session.getUser())?.id;

        const list = members.length
            ? h("div", { className: "card" }, members.map(m => {
                const isSelf = String(m.id) === String(currentUserId);
                // Names and class roles only — a class roster is not a
                // profile browser.
                return h("div", { className: "card-row" }, [
                    h("div", { className: "card-row-text" }, [
                        h("div", { className: "card-row-title" }, `${m.full_name || m.username}${isSelf ? " (you)" : ""}`),
                    ]),
                    canManageRoles && !isSelf
                        ? h("button", {
                            className: "member-role-btn", type: "button",
                            onClick: (e) => { e.stopPropagation(); this._openClassRoleMenu(schoolId, className, section, m); },
                        }, [m.role, h("span", { className: "material-symbols-rounded" }, "expand_more")])
                        : h("span", { className: `badge ${m.role === "Owner" ? "badge-owner" : "badge-role"}` }, m.role),
                ]);
            }))
            : EmptyState({ icon: "group", title: "No members found" });

        mount(container, header, list);
    },

    _openClassRoleMenu(schoolId, className, section, member, refresh) {
        const doRefresh = refresh || (() => this._renderClassMembers(qs("#app-content"), schoolId, className, section));
        const roleCopy = { Teacher: "Teaches this class", Helper: "Trusted class helper", Member: "Regular class member" };
        const roleIcon = { Teacher: "school", Helper: "support_agent", Member: "person" };
        const options = ["Teacher", "Helper", "Member"].map(role => h("button", {
            className: `action-tile role-option ${role === member.role ? "selected" : ""}`, type: "button",
            onClick: async () => {
                if (role === member.role) { Sheet.close(); return; }
                try {
                    await ClassesApi.changeMemberRole(schoolId, member.id, className, section, role);
                    Toast.success(`${member.full_name || member.username} is now ${role}`);
                    Sheet.close();
                    doRefresh();
                } catch (err) { Toast.fromApiError(err); }
            },
        }, [
            h("span", { className: "material-symbols-rounded" }, roleIcon[role]),
            h("div", {}, [h("strong", {}, role), h("span", {}, roleCopy[role])]),
            role === member.role ? h("span", { className: "material-symbols-rounded role-selected" }, "check_circle") : null,
        ]));
        Sheet.open(h("div", { className: "role-sheet" }, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "CLASS ROLE"),
            h("h3", {}, `Manage ${member.full_name || member.username}`),
            h("p", { className: "profile-meta" }, `Currently ${member.role} in ${className} ${section}. Class roles don't affect their school role.`),
            ...options,
        ]));
    },
};

window.SchoolsPage = SchoolsPage;