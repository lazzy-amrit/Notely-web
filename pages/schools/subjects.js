// ------------------------------------------------------------------
// pages/schools/subjects.js
// routes (delegated to from SchoolsPage.render):
//   schools/:id/class/:className/:section/subjects
//   schools/:id/class/:className/:section/subject/:subjectId/:subjectName
//
// Both lists are vertical, one-row-per-item cards (never horizontal
// scrollers), matching the Classes list style. Selecting a chapter
// hands off to NotesPage, scoped by chapter_id.
//
// Create/rename/delete are Owner/Teacher-only on the backend, and
// status-toggle is Owner/Teacher/Helper — same as subjects, class role
// comes from ClassesApi.me() and is used to hide the controls a viewer
// can't use, rather than showing them and relying on a 403 toast.
// ------------------------------------------------------------------

const SUBJECT_MAX_PER_ADD = 20; // Part 4: hard cap per add operation

const SchoolSubjectsPage = {
    // ---------------- SUBJECTS (inside a class) ----------------

    // Selecting a section lands straight here: the section's subjects.
    // There is no in-between "section detail" screen with info/notes
    // boxes any more — a section IS its subject list.
    async renderSubjects(container, schoolId, className, section) {
        const ctx = { schoolId, className, section };
        const repaint = () => SchoolSubjectsPage.renderSubjects(qs("#app-content"), schoolId, className, section);

        mount(container, this._classTopbar(ctx, null, repaint),
            h("div", { className: "skeleton-row" }, [h("div", { className: "skeleton skeleton-line" })]));

        // Membership is read, never implied — but it no longer blocks the
        // screen. A viewer who hasn't joined simply gets a Join button in
        // the top right corner of the class bar.
        const myClass = await Membership.state(schoolId, className, section, { force: true });
        const topbar = this._classTopbar(ctx, myClass, repaint);

        const [subjectsOrErr, stars] = await Promise.all([
            SubjectsApi.list(schoolId, className, section).catch(err => err),
            StarsApi.list().catch(() => null),
        ]);
        const loadError = subjectsOrErr instanceof Error ? subjectsOrErr : null;
        const subjects = Array.isArray(subjectsOrErr) ? subjectsOrErr : [];

        if (loadError) {
            // The backend is still the authority. If it refuses this list,
            // show the Join surface instead of an error wall.
            if (loadError.status === 403) {
                mount(container, topbar, Membership.lockedView(ctx, myClass, repaint, {
                    title: `Join ${className} ${section}`,
                    subtitle: `Subjects and notes in ${className} ${section} are only available to members of this section.`,
                }));
                return;
            }
            mount(container, topbar, EmptyState({ icon: "menu_book", title: "Couldn't load subjects", subtitle: loadError.message }));
            return;
        }

        // Class role decides what is even rendered: Owner/Teacher manage
        // subjects, Helpers upload notes inside them, Members read only.
        const myRole = myClass?.role || null;
        const canManage = myRole === "Owner" || myRole === "Teacher";
        const starredSubjects = new Set((stars?.subjects || []).map(x => x.id));

        const list = subjects.length
            ? h("div", { className: "subjects-list" }, subjects.map(subject => {
                const row = h("div", {
                    className: "card-row subject-row",
                    // A subject opens its notes directly.
                    onClick: () => Router.go(`notes/subject/${schoolId}/${encodeURIComponent(className)}/${encodeURIComponent(section)}/${subject.id}/${encodeURIComponent(subject.name)}`),
                }, [
                    h("div", { className: "subject-row-icon" }, [
                        h("span", { className: "material-symbols-rounded" }, "auto_stories"),
                    ]),
                    h("div", { className: "card-row-text" }, [
                        h("div", { className: "card-row-title" }, subject.name),
                        h("span", { className: "card-row-sub" }, subject.description || "Tap to open its notes"),
                    ]),
                    NotesPage._starButton("subject", subject.id, starredSubjects.has(subject.id), null),
                ]);

                // Hold a subject -> tiny two-option card (Edit / Delete).
                // Owner/Teacher only; nobody else gets the gesture at all.
                if (canManage) {
                    let timer = null, firedLongPress = false;
                    const openManage = (e) => {
                        row.classList.remove("is-holding");
                        this._openSubjectMenu(row, schoolId, className, section, subject, e);
                    };
                    const start = (e) => {
                        firedLongPress = false;
                        row.classList.add("is-holding");
                        timer = setTimeout(() => { firedLongPress = true; openManage(e); }, 480);
                    };
                    const cancel = () => { clearTimeout(timer); row.classList.remove("is-holding"); };
                    row.addEventListener("pointerdown", start);
                    row.addEventListener("pointerup", cancel);
                    row.addEventListener("pointerleave", cancel);
                    row.addEventListener("pointercancel", cancel);
                    row.addEventListener("contextmenu", (e) => { e.preventDefault(); cancel(); openManage(e); });
                    row.addEventListener("click", (e) => { if (firedLongPress) e.stopImmediatePropagation(); }, true);
                }

                return row;
            }))
            : EmptyState({
                icon: "menu_book",
                title: "No subjects yet",
                subtitle: canManage ? "Tap + to add subjects to this section." : "Your teachers haven't added any subjects yet.",
            });

        const fab = canManage ? h("button", { className: "fab", type: "button", onClick: () => this._openCreateSubjectsSheet(schoolId, className, section) }, [
            h("span", { className: "material-symbols-rounded" }, "add"),
        ]) : null;

        mount(container, topbar,
            h("div", { className: "section-label" }, [
                h("span", {}, "Subjects"),
                h("span", {}, String(subjects.length)),
            ]),
            list, fab);
    },

    // The class bar: back, tappable identity (opens the class card with
    // its members), and — only when the viewer hasn't joined — a Join
    // button on the right.
    _classTopbar(ctx, myClass, repaint) {
        const { schoolId, className, section } = ctx;
        const label = `${className} ${section}`;
        const count = myClass?.member_count ?? null;
        const role = myClass?.role || null;
        const isMember = Membership.isMember(myClass);

        return h("div", { className: "school-topbar" }, [
            h("button", {
                className: "back-btn", type: "button", title: "Back",
                onClick: () => Router.go(`schools/${schoolId}/class/${encodeURIComponent(className)}`),
            }, [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("button", {
                className: "school-identity", type: "button",
                onClick: () => this._openClassCard(ctx, myClass, repaint),
            }, [
                h("span", { className: `entity-badge${String(section).length > 3 ? " is-long" : ""}` }, String(section).slice(0, 4)),
                h("div", { className: "school-identity-text" }, [
                    h("strong", {}, label),
                    h("span", {}, count === null
                        ? "Tap for members"
                        : `${count} ${count === 1 ? "member" : "members"}${isMember && role ? ` · You're ${role}` : ""}`),
                ]),
            ]),
            !myClass || isMember ? null : Membership.button(ctx, myClass, () => repaint?.(), {}),
        ].filter(Boolean));
    },

    // The class card — the same shape as the school/group card: name,
    // member count, then the member list itself. Names and class roles
    // only, no profile pictures and no profile previews. Owners and
    // Teachers can change a role; Helpers and Members never can.
    async _openClassCard(ctx, myClass, repaint) {
        const { schoolId, className, section } = ctx;
        const myRole = myClass?.role || null;
        const canManageRoles = myRole === "Owner" || myRole === "Teacher";
        const listWrap = h("div", { className: "class-member-list" }, [
            h("div", { className: "skeleton skeleton-line" }),
        ]);

        const body = h("div", { className: "class-card-sheet" }, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "CLASS"),
            h("h3", {}, `${className} ${section}`),
            h("p", { className: "sheet-copy" }, Membership.isMember(myClass)
                ? `You're ${myRole || "a Member"} in this section.`
                : "You haven't joined this section yet."),
            h("div", { className: "section-label" }, [h("span", {}, "Members")]),
            listWrap,
            Membership.isMember(myClass)
                ? Membership.button(ctx, myClass, () => { Sheet.close(); repaint?.(); }, { block: true })
                : Membership.button(ctx, myClass, () => { Sheet.close(); repaint?.(); }, { block: true }),
        ]);
        Sheet.open(body);

        let members = [];
        try { members = await ClassesApi.members(schoolId, className, section); }
        catch (err) {
            mount(listWrap, h("p", { className: "field-hint" }, err.message || "Couldn't load members."));
            return;
        }

        const currentUserId = (await Session.getUser())?.id;
        const paint = () => mount(listWrap, ...(members.length ? members.map(m => {
            const isSelf = String(m.id) === String(currentUserId);
            return h("div", { className: "class-member-row" }, [
                h("div", { className: "class-member-name" }, [
                    h("strong", {}, m.full_name || m.username),
                    isSelf ? h("span", {}, "You") : null,
                ].filter(Boolean)),
                canManageRoles && !isSelf
                    ? h("button", {
                        className: "member-role-btn", type: "button",
                        onClick: () => this._openClassRoleSheet(ctx, m, () => {
                            Sheet.close();
                            this._openClassCard(ctx, myClass, repaint);
                        }),
                    }, [m.role, h("span", { className: "material-symbols-rounded" }, "expand_more")])
                    : h("span", { className: `badge ${m.role === "Owner" ? "badge-owner" : "badge-role"}` }, m.role),
            ]);
        }) : [h("p", { className: "field-hint" }, "No members yet.")]));

        paint();
    },

    // Class roles: Teacher, Helper or Member. Owner is the school owner's
    // role and is never handed out here (the backend refuses it too).
    // A Helper can upload and delete notes — nothing else.
    _openClassRoleSheet(ctx, member, onDone) {
        const { schoolId, className, section } = ctx;
        const roleCopy = {
            Teacher: "Manages subjects, notes and roles",
            Helper: "Can upload and delete notes only",
            Member: "Read only",
        };
        const roleIcon = { Teacher: "school", Helper: "support_agent", Member: "person" };

        const options = ["Teacher", "Helper", "Member"].map(role => h("button", {
            className: `action-tile role-option ${role === member.role ? "selected" : ""}`, type: "button",
            onClick: async () => {
                if (role === member.role) { Sheet.close(); return; }
                try {
                    await ClassesApi.changeMemberRole(schoolId, member.id, className, section, role);
                    Toast.success(`${member.full_name || member.username} is now ${role}`);
                    onDone?.();
                } catch (err) { Toast.fromApiError(err); }
            },
        }, [
            h("span", { className: "material-symbols-rounded" }, roleIcon[role]),
            h("div", {}, [h("strong", {}, role), h("span", {}, roleCopy[role])]),
            role === member.role ? h("span", { className: "material-symbols-rounded role-selected" }, "check_circle") : null,
        ].filter(Boolean)));

        Sheet.open(h("div", { className: "role-sheet" }, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "CLASS ROLE"),
            h("h3", {}, member.full_name || member.username),
            h("p", { className: "profile-meta" }, `Currently ${member.role} in ${className} ${section}.`),
            ...options,
        ]));
    },

    // One subject at a time — a name (never a comma-separated list) and an
    // optional description. Subjects already added to the list below are
    // kept, and a name still sitting in the field is included on Create,
    // so nothing is lost by not tapping "Add another subject".
    _openCreateSubjectsSheet(schoolId, className, section) {
        const queued = [];
        const nameField = h("input", { placeholder: "e.g. Mathematics" });
        const descField = h("textarea", { placeholder: "Description (optional)", rows: "2" });
        const chipRow = h("div", { className: "class-chip-row" });
        const note = h("div", { className: "limit-note" }, [
            h("span", { className: "material-symbols-rounded" }, "info"),
            h("span", {}, `Up to ${SUBJECT_MAX_PER_ADD} subjects in one go.`),
        ]);
        const addBtn = h("button", { className: "btn btn-soft btn-block", type: "button" }, [
            h("span", { className: "material-symbols-rounded" }, "add"), " Add another subject",
        ]);
        const btn = h("button", { className: "btn btn-primary btn-block", type: "button" }, "Create");

        const refresh = () => {
            mount(chipRow, ...queued.map((s, i) => h("span", { className: "class-chip" }, [
                s.name,
                h("button", {
                    type: "button", title: "Remove",
                    onClick: () => { queued.splice(i, 1); refresh(); },
                }, [h("span", { className: "material-symbols-rounded" }, "close")]),
            ])));
            const atMax = queued.length >= SUBJECT_MAX_PER_ADD;
            addBtn.disabled = atMax;
            nameField.disabled = atMax;
            descField.disabled = atMax;
            note.classList.toggle("warn", atMax);
            qs("span:last-child", note).textContent = atMax
                ? `Maximum of ${SUBJECT_MAX_PER_ADD} subjects per add reached.`
                : `${queued.length} of ${SUBJECT_MAX_PER_ADD} subjects queued.`;
            btn.disabled = queued.length === 0 && !nameField.value.trim();
        };

        nameField.addEventListener("input", refresh);

        // Takes whatever is typed in the fields and pushes it onto the list.
        const takePending = ({ silent = false } = {}) => {
            const name = nameField.value.trim();
            if (!name) {
                if (!silent) { Toast.error("Subject name is required"); nameField.focus(); }
                return false;
            }
            if (queued.some(s => s.name.toLowerCase() === name.toLowerCase())) {
                if (!silent) Toast.error(`${name} is already in this list`);
                return false;
            }
            if (queued.length >= SUBJECT_MAX_PER_ADD) return false;
            queued.push({ name, description: descField.value.trim() });
            nameField.value = ""; descField.value = "";
            return true;
        };

        addBtn.addEventListener("click", () => { if (takePending()) { nameField.focus(); refresh(); } });

        btn.addEventListener("click", async () => {
            takePending({ silent: true });
            refresh();
            if (!queued.length) { Toast.error("Add a subject name first."); return; }
            btn.disabled = true; btn.textContent = "Creating...";
            try {
                await SubjectsApi.create(schoolId, className, section, queued);
                Toast.success(queued.length > 1 ? "Subjects added" : "Subject added");
                Sheet.close();
                SchoolSubjectsPage.renderSubjects(qs("#app-content"), schoolId, className, section);
            } catch (err) { Toast.fromApiError(err); btn.disabled = false; btn.textContent = "Create"; }
        });

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "SUBJECTS"),
            h("h3", {}, `Add a subject to ${className} ${section}`),
            h("div", { className: "field" }, [h("label", {}, "Subject name"), nameField]),
            h("div", { className: "field" }, [h("label", {}, "Description"), descField]),
            addBtn,
            h("div", { style: "height:12px" }),
            chipRow,
            note,
            btn,
        ]));

        refresh();
    },

    // Holding a subject opens this tiny card next to it: Edit or Delete,
    // nothing else. Owner/Teacher only (gated by the caller).
    _openSubjectMenu(anchor, schoolId, className, section, subject, event) {
        TinyMenu.open(anchor, event, [
            {
                icon: "edit", label: "Edit",
                onSelect: () => this._openEditSubjectSheet(schoolId, className, section, subject),
            },
            {
                icon: "delete", label: "Delete", danger: true,
                onSelect: () => confirmAction({
                    title: `Delete ${subject.name}?`,
                    message: "Its chapters and notes will be removed from this section for everyone.",
                    confirmLabel: "Delete", danger: true,
                    onConfirm: async () => {
                        await SubjectsApi.remove(schoolId, subject.id);
                        Toast.success("Subject deleted");
                        SchoolSubjectsPage.renderSubjects(qs("#app-content"), schoolId, className, section);
                    },
                }),
            },
        ]);
    },

    // Rename + description, prefilled. Delete lives in the tiny card.
    _openEditSubjectSheet(schoolId, className, section, subject) {
        const nameField = h("input", { value: subject.name });
        const descField = h("textarea", { rows: "3" });
        descField.value = subject.description || "";
        const btn = h("button", { className: "btn btn-primary btn-block", type: "button" }, "Save changes");
        btn.addEventListener("click", async () => {
            const name = nameField.value.trim();
            if (!name) { Toast.error("Name can't be empty."); return; }
            btn.disabled = true; btn.textContent = "Saving…";
            try {
                await SubjectsApi.rename(schoolId, subject.id, name, descField.value.trim());
                Toast.success("Subject updated");
                Sheet.close();
                SchoolSubjectsPage.renderSubjects(qs("#app-content"), schoolId, className, section);
            } catch (err) { Toast.fromApiError(err); btn.disabled = false; btn.textContent = "Save changes"; }
        });
        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "SUBJECT"),
            h("h3", {}, "Rename subject"),
            h("div", { className: "field", style: "margin-top:12px" }, [h("label", {}, "Name"), nameField]),
            h("div", { className: "field" }, [h("label", {}, "Description"), descField]),
            btn,
        ]));
    },

    async renderChapters(container, schoolId, className, section, subjectId, subjectName) {
        const header = h("div", { className: "app-header" }, [
            h("button", { className: "back-btn", onClick: () => Router.goBack(`schools/${schoolId}/class/${encodeURIComponent(className)}/${encodeURIComponent(section)}/subjects`) }, [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("h1", {}, subjectName || "Subject"),
        ]);
        mount(container, header, h("div", { className: "skeleton-row" }, [h("div", { className: "skeleton skeleton-line" })]));

        // Membership gate before any chapter data is requested.
        const myClass = await Membership.state(schoolId, className, section);
        if (!Membership.isMember(myClass)) {
            mount(container, header, Membership.lockedView({ schoolId, className, section }, myClass,
                () => SchoolSubjectsPage.renderChapters(container, schoolId, className, section, subjectId, subjectName),
                { title: `Join ${className} ${section}`, subtitle: "Chapters and notes are only available to members of this section." }));
            return;
        }

        let chapters = [];
        let role = myClass?.role || null;
        let loadError = null;
        try {
            chapters = await ChaptersApi.list(schoolId, subjectId);
        }
        catch (err) { loadError = err; }


        if (loadError) {
            mount(container, header, EmptyState({ icon: "bookmark", title: "Couldn't load chapters", subtitle: loadError.message }));
            return;
        }

        this._paintChapters(container, header, schoolId, className, section, subjectId, subjectName, chapters, role);
    },

    _paintChapters(container, header, schoolId, className, section, subjectId, subjectName, chapters, role) {
        const canCreate = role === "Owner" || role === "Teacher";
        const canToggleStatus = canCreate || role === "Helper";
        const list = chapters.length
            ? h("div", { className: "chapters-list" }, chapters.map(chapter => h("div", { className: "card-row chapter-row", onClick: () => Router.go(`notes/chapter/${chapter.id}/${schoolId}/${encodeURIComponent(className)}/${encodeURIComponent(section)}/${subjectId}/${encodeURIComponent(subjectName)}/${encodeURIComponent(chapter.name)}`) }, [
                h("div", { className: "chapter-row-icon" }, [
                    h("span", { className: "material-symbols-rounded" }, "bookmark"),
                ]),
                h("div", { className: "card-row-text" }, [
                    h("div", { className: "card-row-title" }, chapter.name),
                    h("span", { className: "card-row-sub" }, `${chapter.note_count} ${chapter.note_count === 1 ? "note" : "notes"}`),
                ]),
                canToggleStatus
                    ? h("button", {
                        className: `badge ${chapter.status === "Completed" ? "badge-success" : "badge-warning"}`,
                        style: "border:none;cursor:pointer;font:inherit;font-size:.72rem;font-weight:700;flex-shrink:0",
                        onClick: async (e) => {
                            e.stopPropagation();
                            const next = chapter.status === "Completed" ? "Not_Completed" : "Completed";
                            try {
                                await ChaptersApi.setStatus(schoolId, chapter.id, next);
                                chapter.status = next;
                                this._paintChapters(container, header, schoolId, className, section, subjectId, subjectName, chapters, role);
                            } catch (err) { Toast.fromApiError(err); }
                        },
                    }, chapter.status === "Completed" ? "Completed" : "Not Completed")
                    : h("span", { className: `badge ${chapter.status === "Completed" ? "badge-success" : "badge-warning"}`, style: "flex-shrink:0" }, chapter.status === "Completed" ? "Completed" : "Not Completed"),
            ])))
            : EmptyState({
                icon: "bookmark",
                title: "No chapters yet",
                subtitle: canCreate ? "Add chapters for this subject to get started." : "Your teachers haven't added any chapters yet.",
            });

        // Owner/Teacher only, matching the backend (Part 10/11) — a
        // Member or Helper never sees this at all, rather than seeing
        // it fail with a 403.
        const fab = canCreate ? h("button", { className: "fab", onClick: () => this._openCreateChaptersSheet(schoolId, className, section, subjectId, subjectName) }, [
            h("span", { className: "material-symbols-rounded" }, "add"),
        ]) : null;

        mount(container, header, list, fab);
    },

    _openCreateChaptersSheet(schoolId, className, section, subjectId, subjectName) {
        const namesField = h("input", { placeholder: "e.g. Chapter 1, Chapter 2" });
        const btn = h("button", { className: "btn btn-primary btn-block" }, "Create");
        btn.addEventListener("click", async () => {
            const names = namesField.value.split(",").map(s => s.trim()).filter(Boolean);
            if (names.length === 0) return;
            btn.disabled = true; btn.textContent = "Creating...";
            try {
                await ChaptersApi.create(schoolId, subjectId, names);
                Toast.success(names.length > 1 ? "Chapters added" : "Chapter added");
                Sheet.close();
                SchoolSubjectsPage.renderChapters(qs("#app-content"), schoolId, className, section, subjectId, subjectName);
            } catch (err) { Toast.fromApiError(err); btn.disabled = false; btn.textContent = "Create"; }
        });
        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:14px" }, "Add chapters"),
            h("div", { className: "field" }, [h("label", {}, "Chapter names (comma separated)"), namesField]),
            btn,
        ]));
    },
};

window.SchoolSubjectsPage = SchoolSubjectsPage;