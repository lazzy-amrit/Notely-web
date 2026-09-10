// ------------------------------------------------------------------
// pages/notes/notes.js
// routes: notes | notes/school/:schoolId/class/:className/:section
// ------------------------------------------------------------------

const NotesPage = {
    _longPressMs: 480,

    // ---------------- shared: note card w/ long-press actions ----------------

    // Stars are personal: this only pins the note to YOUR Notes tab.
    // The star flips the instant you tap it — the toggle call happens
    // in the background and only unwinds the icon if it fails or
    // doesn't confirm within 20s. onToggle(nextState, {reverted}) fires
    // once right after the optimistic flip (reverted: false), and again
    // if it had to be rolled back (reverted: true), so callers can react
    // (e.g. drop a row from a list) without waiting on the network either.
    _starButton(kind, id, isStarred, onToggle) {
        const iconFor = s => s ? "star" : "star_border";
        const titleFor = s => s ? "Remove from starred" : "Star for quick access";
        const btn = h("button", {
            className: `btn-icon star-btn ${isStarred ? "starred" : ""}`,
            title: titleFor(isStarred),
        }, [h("span", { className: "material-symbols-rounded" }, iconFor(isStarred))]);
        let starred = isStarred;
        const paint = s => { btn.classList.toggle("starred", s); btn.title = titleFor(s); qs("span", btn).textContent = iconFor(s); };
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const previous = starred;
            const next = !starred;
            starred = next;
            Optimistic.run({
                timeoutMs: 20000,
                apply: () => paint(next),
                action: () => StarsApi.toggle(kind, id, previous),
                revert: () => { starred = previous; paint(previous); onToggle?.(previous, { reverted: true }); },
                onError: () => Toast.error("Couldn't update your star. Check your connection."),
            });
            onToggle?.(next, { reverted: false });
        });
        return btn;
    },

    // A note row: small icon-left tile, name + status in the middle,
    // star on the right — the app's normal list-row shape, not a
    // grid of square posts. Everything else (rename/delete/etc.)
    // still lives in the hold-to-open sheet.
    _noteCard(note, { onOpen, onChanged, starred, onStarChanged, role, ctx }) {
        // Owner/Teacher/Helper get the management sheet. A Member gets
        // open + star only.
        const canManage = role === "Owner" || role === "Teacher" || role === "Helper";
        const iconWrap = h("div", { className: "note-row-icon" }, [
            h("span", { className: "material-symbols-rounded" }, "picture_as_pdf"),
        ]);
        const row = h("div", { className: "card-row note-row" }, [
            iconWrap,
            h("div", { className: "card-row-text" }, [
                h("div", { className: "card-row-title" }, note.name),
                h("span", { className: `badge ${note.status === "Finished" ? "badge-success" : "badge-warning"}` },
                    note.status === "Finished" ? "Completed" : "In progress"),
            ]),
            starred === undefined ? null : this._starButton("note", note.id, starred, onStarChanged),
        ]);

        row.addEventListener("click", () => onOpen());

        // Hold the note -> a sheet slides up. Owner/Teacher/Helper get
        // the full management sheet (unchanged, below); a normal
        // Member gets a separate, read-only info sheet — same hold
        // gesture, no editing controls. Exactly one of these two wires
        // up per card since canManage decides which sheet `open` opens.
        const open = canManage
            ? () => this._openNoteSheet(note, { onChanged, role, ctx })
            : () => this._openMemberNoteInfoSheet(note);
        let timer = null, firedLongPress = false;
        const start = () => { firedLongPress = false; timer = setTimeout(() => { firedLongPress = true; open(); }, this._longPressMs); };
        const cancel = () => clearTimeout(timer);
        row.addEventListener("pointerdown", start);
        row.addEventListener("pointerup", cancel);
        row.addEventListener("pointerleave", cancel);
        row.addEventListener("pointercancel", cancel);
        row.addEventListener("contextmenu", (e) => { e.preventDefault(); cancel(); open(); });
        // Suppress the normal open-PDF click that pointerup would also
        // trigger right after a long press resolves.
        row.addEventListener("click", (e) => { if (firedLongPress) e.stopImmediatePropagation(); }, true);

        return row;
    },

    // ---------------- the note sheet (hold a note) ----------------
    //
    // Comes up from the bottom and carries everything a note owner needs:
    // its status, a photo cell that turns pictures into extra PDF pages,
    // "More" for the name/description, plus open and delete.
    // Owner/Teacher can do all of it; a Helper can open and delete only.
    _openNoteSheet(note, { onChanged, role, ctx } = {}) {
        const canEdit = role === "Owner" || role === "Teacher";
        const canDelete = canEdit || role === "Helper";
        const canAddPages = canEdit && !!ctx;

        // ---- status, shown inline and switchable in place
        const statusRow = h("div", { className: "status-seg" });
        const paintStatus = () => {
            mount(statusRow, ...[["Under_progress", "In progress"], ["Finished", "Completed"]].map(([value, label]) => h("button", {
                className: `status-seg-btn${note.status === value ? " active" : ""}`, type: "button",
                onClick: async () => {
                    if (!canEdit || note.status === value) return;
                    try {
                        await NotesApi.update(note.id, { status: value });
                        note.status = value;
                        paintStatus();
                        Toast.success(value === "Finished" ? "Marked as completed" : "Marked as in progress");
                        onChanged?.();
                    } catch (err) { Toast.fromApiError(err); }
                },
            }, label)));
        };
        paintStatus();

        // ---- photo cell -> extra pages on this same PDF
        const picker = canAddPages ? this._buildImagePicker() : null;
        const addLabel = h("span", {}, "Add pages to this PDF");
        const addBtn = canAddPages
            ? h("button", { className: "btn btn-soft btn-block", type: "button" }, [
                h("span", { className: "material-symbols-rounded" }, "note_add"), " ", addLabel,
            ])
            : null;

        addBtn?.addEventListener("click", async () => {
            let file;
            addBtn.disabled = true; addLabel.textContent = "Preparing PDF…";
            try { file = await this._resolveUploadFile(picker); }
            catch (err) {
                Toast.error(err.message);
                addBtn.disabled = false; addLabel.textContent = "Add pages to this PDF";
                return;
            }
            addLabel.textContent = "Adding pages…";
            try {
                // The photos become their own PDF, which is then appended to
                // this note's file so the note stays a single document.
                const res = await NotesApi.upload(ctx.schoolId, ctx.className, ctx.section, {
                    name: `${note.name} (added pages)`,
                    description: "",
                    status: note.status,
                    chapterId: ctx.chapterId,
                    subjectId: ctx.subjectId,
                }, file);
                const newId = res?.note?.id;
                if (!newId) throw new Error("Couldn't add those pages. Please try again.");
                await NotesApi.merge({
                    noteIds: [note.id, newId],
                    name: note.name,
                    description: note.description || "",
                    status: note.status,
                });
                Toast.success("Pages added");
                Sheet.close();
                onChanged?.();
            } catch (err) {
                Toast.fromApiError(err);
                addBtn.disabled = false; addLabel.textContent = "Add pages to this PDF";
            }
        });

        Sheet.open(h("div", { className: "note-actions-sheet" }, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "NOTE"),
            h("h3", { style: "margin-bottom:2px" }, note.name),
            h("p", { style: "color:var(--muted);font-size:.85rem;margin-bottom:14px" }, note.description || "No description"),

            h("div", { className: "field" }, [
                h("label", {}, "Status"),
                statusRow,
                canEdit ? null : h("p", { className: "field-hint" }, "Only a teacher can change the status."),
            ].filter(Boolean)),

            canAddPages ? picker.element : null,
            addBtn,

            h("button", {
                className: "btn btn-ghost btn-block", type: "button",
                onClick: () => { Sheet.close(); this._openNote(note); },
            }, [h("span", { className: "material-symbols-rounded" }, "visibility"), " Open PDF"]),

            canEdit ? h("button", {
                className: "btn btn-ghost btn-block", type: "button",
                onClick: () => this._openEditSheet(note, onChanged),
            }, [h("span", { className: "material-symbols-rounded" }, "more_horiz"), " More — name & description"]) : null,

            canDelete ? h("button", {
                className: "btn btn-outline-danger btn-block", type: "button",
                onClick: () => this._confirmDeleteNote(note, onChanged),
            }, [h("span", { className: "material-symbols-rounded" }, "delete"), " Delete note"]) : null,
        ].filter(Boolean)));
    },

    // ---------------- member hold: read-only note info ----------------
    //
    // A normal Member's hold never reaches _openNoteSheet above — this is
    // its own, separate sheet, and it only ever shows three things: name,
    // description, status. No status switch, no photo cell, no edit/
    // delete buttons. The privileged sheet is untouched by this.
    _openMemberNoteInfoSheet(note) {
        Sheet.open(h("div", { className: "note-info-sheet" }, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "NOTE"),
            h("h3", { style: "margin-bottom:14px" }, note.name),

            h("div", { className: "field" }, [
                h("label", {}, "Description"),
                h("p", { className: "note-info-value" }, note.description || "No description"),
            ]),

            h("div", { className: "field" }, [
                h("label", {}, "Status"),
                h("span", { className: `badge ${note.status === "Finished" ? "badge-success" : "badge-warning"}` },
                    note.status === "Finished" ? "Completed" : "In progress"),
            ]),
        ]));
    },

    _openEditSheet(note, onChanged) {
        // Prefilled with the note's existing values — never an empty form.
        const nameField = h("input", { value: note.name });
        const descField = h("textarea", { rows: "3" });
        descField.value = note.description || "";
        const btn = h("button", { className: "btn btn-primary btn-block", type: "button" }, "Save changes");

        btn.addEventListener("click", async () => {
            const name = nameField.value.trim();
            if (!name) { Toast.error("Name can't be empty."); return; }
            btn.disabled = true; btn.textContent = "Saving…";
            try {
                await NotesApi.update(note.id, { name, description: descField.value.trim() });
                Toast.success("Note updated");
                Sheet.close();
                onChanged?.();
            } catch (err) {
                Toast.fromApiError(err);
                btn.disabled = false; btn.textContent = "Save changes";
            }
        });

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "NOTE"),
            h("h3", { style: "margin-bottom:14px" }, "Edit note"),
            h("div", { className: "field" }, [h("label", {}, "Name"), nameField]),
            h("div", { className: "field" }, [h("label", {}, "Description"), descField]),
            btn,
        ]));
    },

    _confirmDeleteNote(note, onChanged) {
        confirmAction({
            title: "Delete this note?",
            message: `"${note.name}" and its PDF will be permanently removed.`,
            confirmLabel: "Delete", danger: true,
            onConfirm: async () => {
                await NotesApi.remove(note.id);
                Toast.success("Note deleted");
                Sheet.close();
                onChanged?.();
            },
        });
    },

    // ---------------- Parts 7/8: Gallery + Camera image picker ----------------
    // Produces a thumbnail strip of picked images (rounded boxes, remove
    // cross on each), capped at 50 per note. Tapping a thumbnail opens a
    // full-size view with a Remove option — no crop step, a photo's full
    // frame is what gets sent. The final PDF is still built client-side
    // by imagesToPdfBlob (Part 9) — this only manages the in-memory
    // image list that feeds it.
    _MAX_NOTE_IMAGES: 50,

    _buildImagePicker() {
        const state = { files: [] };
        const MAX = this._MAX_NOTE_IMAGES;

        const stripWrap = h("div", { className: "image-picker-strip" });
        const countLabel = h("div", { className: "field-hint" }, "0 photos added");

        const galleryInput = h("input", { type: "file", accept: "image/*", multiple: "true", style: "display:none" });

        // Object URLs are cached per file instead of being recreated on
        // every renderStrip() call (which used to leak one blob URL per
        // existing image on every single add/remove/crop — with up to
        // 50 images that's real, growing memory pressure over one
        // note-creation session). Entries for files no longer present
        // (removed, or replaced by a cropped version) are revoked.
        const urlCache = new Map();
        const urlFor = (file) => {
            let url = urlCache.get(file);
            if (!url) { url = URL.createObjectURL(file); urlCache.set(file, url); }
            return url;
        };

        const renderStrip = () => {
            clear(stripWrap);
            const live = new Set(state.files);
            for (const [file, url] of urlCache) {
                if (!live.has(file)) { URL.revokeObjectURL(url); urlCache.delete(file); }
            }
            state.files.forEach((file, idx) => {
                const url = urlFor(file);
                const thumb = h("div", { className: "image-thumb" }, [
                    h("img", { src: url, alt: `Photo ${idx + 1}` }),
                    h("button", {
                        className: "image-thumb-remove", type: "button", title: "Remove",
                        onClick: (e) => { e.stopPropagation(); state.files.splice(idx, 1); renderStrip(); },
                    }, [h("span", { className: "material-symbols-rounded" }, "close")]),
                ]);
                thumb.addEventListener("click", () => NotesPage._openImagePreview(state, idx, renderStrip));
                stripWrap.appendChild(thumb);
            });
            countLabel.textContent = `${state.files.length} of ${MAX} photos added`;
            galleryBtn.disabled = state.files.length >= MAX;
            cameraBtn.disabled = state.files.length >= MAX;
        };

        // Photos are compressed as soon as they're picked (same
        // compress-on-add pattern used for profile/school/group photos)
        // instead of only being shrunk later while the final PDF is being
        // assembled — so the strip, the full-screen preview and the
        // upload are all working with the same, already-small file.
        const addFiles = async (fileList) => {
            const incoming = Array.from(fileList || []);
            const room = MAX - state.files.length;
            if (room <= 0) { Toast.error(`Maximum ${MAX} images per note.`); return; }
            const accepted = incoming.slice(0, room);
            if (incoming.length > accepted.length) Toast.error(`Only added ${accepted.length} — ${MAX} image limit reached.`);
            galleryBtn.disabled = true; cameraBtn.disabled = true;
            const compressed = await Promise.all(accepted.map(f =>
                FileCompression.compressImageForUpload(f, { maxDimension: 1600, quality: 0.75, maxBytes: 700 * 1024 }).catch(() => f)
            ));
            state.files.push(...compressed);
            renderStrip();
        };

        galleryInput.addEventListener("change", () => { addFiles(galleryInput.files); galleryInput.value = ""; });

        const galleryBtn = h("button", { className: "btn btn-outline btn-sm", type: "button", onClick: () => galleryInput.click() },
            [h("span", { className: "material-symbols-rounded" }, "photo_library"), " Gallery"]);
        // Camera -> device camera -> photo lands straight in the strip.
        // See _captureCameraPhoto below.
        const cameraBtn = h("button", { className: "btn btn-outline btn-sm", type: "button" },
            [h("span", { className: "material-symbols-rounded" }, "photo_camera"), " Camera"]);
        cameraBtn.addEventListener("click", async () => {
            if (state.files.length >= MAX) { Toast.error(`Maximum ${MAX} images per note.`); return; }
            cameraBtn.disabled = true;
            let photo;
            try { photo = await NotesPage._captureCameraPhoto(); }
            catch (err) {
                if (err?.message !== "cancelled") Toast.error("Couldn't open the camera.");
                cameraBtn.disabled = false;
                return;
            }
            cameraBtn.disabled = false;
            if (!photo) return;
            addFiles([photo]);
        });

        renderStrip();

        const element = h("div", { className: "field" }, [
            h("label", {}, "Photos"),
            h("div", { style: "display:flex;gap:8px;margin-bottom:10px" }, [galleryBtn, cameraBtn]),
            stripWrap,
            countLabel,
            galleryInput,
        ]);

        return { element, getFiles: () => state.files.slice() };
    },

    // Full-screen tap-to-view (matches the in-app PDF viewer's fullscreen
    // treatment instead of a small card), plus a Discard action in the
    // header that removes the photo from the note entirely. Kept
    // intentionally minimal (Part 8: "do not create a huge editing
    // application") — no crop, no zoom, just view + remove.
    _openImagePreview(state, idx, onDone) {
        const file = state.files[idx];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const cleanup = () => URL.revokeObjectURL(url);

        const backBtn = h("button", { className: "pdfv-icon-btn", type: "button", title: "Close" },
            [h("span", { className: "material-symbols-rounded" }, "arrow_back")]);
        const titleEl = h("div", { className: "pdfv-title" }, `Photo ${idx + 1} of ${state.files.length}`);
        const removeBtn = h("button", { className: "pdfv-icon-btn", type: "button", title: "Remove photo" },
            [h("span", { className: "material-symbols-rounded" }, "delete")]);
        const header = h("div", { className: "pdfv-header" }, [backBtn, titleEl, removeBtn]);

        const img = h("img", { src: url, className: "imgv-img", draggable: "false" });
        const body = h("div", { className: "imgv-body" }, [img]);
        const panel = h("div", { className: "imgv-panel" }, [header, body]);

        backBtn.addEventListener("click", () => { cleanup(); Sheet.close(); });
        removeBtn.addEventListener("click", () => {
            cleanup();
            state.files.splice(idx, 1);
            Sheet.close();
            onDone();
        });

        Sheet.open(panel, { kind: "fullscreen" });
    },

    // ---------------- camera capture ----------------
    // Website build: no native camera bridge, so this always uses a
    // plain file input with capture=environment, which opens the
    // device camera in mobile browsers.
    async _captureCameraPhoto() {
        return this._captureViaFileInput();
    },

    // Throwaway file input with capture=environment, not kept in the
    // DOM permanently so it can't be reused stale between calls.
    _captureViaFileInput() {
        return new Promise((resolve, reject) => {
            const input = h("input", { type: "file", accept: "image/*", capture: "environment", style: "display:none" });
            document.body.appendChild(input);
            input.addEventListener("change", () => {
                const file = input.files && input.files[0];
                input.remove();
                if (!file) { reject(new Error("cancelled")); return; }
                resolve(file);
            }, { once: true });
            input.click();
        });
    },

    // Part 9: images -> one client-side PDF -> uploaded as a single file.
    // imagesToPdfBlob returns a plain Blob with no filename; FormData
    // would send that as a nameless "blob" part, which the backend's
    // multipart handler (expects a .pdf upload) can reject. Wrap it in
    // a real File so the part always carries a proper .pdf filename.
    async _resolveUploadFile(picker) {
        const files = picker.getFiles();
        if (!files.length) throw new Error("Add at least one photo (gallery or camera).");
        const blob = await imagesToPdfBlob(files);
        return new File([blob], "note.pdf", { type: "application/pdf" });
    },

    // A lightweight "Uploading…" placeholder card, shown at the top of
    // the notes list the instant someone hits Continue — before the PDF
    // is even assembled, let alone sent. Mirrors the real note-card look
    // so it doesn't jump around when it's swapped for the real thing.
    _pendingNoteCard(name) {
        return h("div", { className: "card-row note-row pending-note" }, [
            h("div", { className: "note-row-icon" }, [
                h("span", { className: "material-symbols-rounded" }, "picture_as_pdf"),
            ]),
            h("div", { className: "card-row-text" }, [
                h("div", { className: "card-row-title" }, name),
                h("span", { className: "badge badge-warning" }, "Uploading…"),
            ]),
            h("div", { className: "spinner spinner-sm" }),
        ]);
    },

    // Shared by both upload sheets: validates synchronously, closes the
    // sheet immediately, drops a pending card into the list right away,
    // then assembles the PDF and uploads it in the background. Nothing
    // about PDF prep or the network is on the critical path the user
    // watches — the sheet is already gone and the list already shows the
    // note "arriving". A failure (or 40s with no confirmation) pulls the
    // pending card back out and says so.
    _submitNoteUpload({ nameField, descField, statusField, picker, uploadFn, onReload }) {
        const name = nameField.value.trim();
        if (!name) { Toast.error("Add a name first."); return; }
        if (!picker.getFiles().length) { Toast.error("Add at least one photo (gallery or camera)."); return; }
        const description = descField.value.trim();
        const status = statusField.value;

        Sheet.close();
        const pendingCard = this._pendingNoteCard(name);
        const listWrap = qs("#notes-list");
        if (listWrap) listWrap.prepend(pendingCard);

        Optimistic.run({
            timeoutMs: 40000,
            action: async () => {
                const file = await this._resolveUploadFile(picker);
                return uploadFn(file, { name, description, status });
            },
            revert: () => pendingCard.remove(),
            reconcile: () => { Toast.success("Note uploaded"); onReload(); },
            onError: (err) => Toast.error(err?.message && err.message !== "timed_out" ? err.message : "That note couldn't be uploaded. Please try again."),
        });
    },

    async render(container, params) {
        if (params && params[0] === "chapter" && params.length >= 8) {
            return this._renderChapterNotes(container, {
                chapterId: params[1],
                schoolId: params[2],
                className: decodeURIComponent(params[3]),
                section: decodeURIComponent(params[4]),
                subjectId: params[5],
                subjectName: decodeURIComponent(params[6]),
                chapterName: decodeURIComponent(params[7]),
            });
        }
        // A subject opens straight onto its notes — chapters are optional
        // grouping, not a step the reader is forced through.
        if (params && params[0] === "subject" && params.length >= 5) {
            return this._renderChapterNotes(container, {
                mode: "subject",
                schoolId: params[1],
                className: decodeURIComponent(params[2]),
                section: decodeURIComponent(params[3]),
                subjectId: params[4],
                subjectName: params[5] ? decodeURIComponent(params[5]) : "Subject",
            });
        }
        if (params && params[0] === "school" && params.length >= 5) {
            return this._renderClassNotes(container, params[1], decodeURIComponent(params[3]), decodeURIComponent(params[4]));
        }
        return this._renderPicker(container);
    },

    async _loadStarIds() {
        const data = await StarsApi.list();
        return {
            classes: new Set((data.classes || []).map(x => x.id)),
            subjects: new Set((data.subjects || []).map(x => x.id)),
            notes: new Set((data.notes || []).map(x => x.id)),
        };
    },

    // ---------------- NOTES TAB = YOUR STARRED ITEMS ----------------
    //
    // The Notes tab is a personal shortcut board, not a second copy of
    // the Schools tab. It lists exactly what the user has starred, in
    // three groups — Classes, Subjects, Notes — and nothing else.
    // Schools are browsed from the Schools tab; starring is what puts
    // something here, unstarring is what takes it away (it never
    // deletes the underlying class/subject/note, and never affects
    // anyone else).

    _starGroups(stars) {
        return [
            {
                kind: "class",
                label: "Classes",
                icon: "school",
                items: (stars?.classes || []).map(x => ({
                    ...x,
                    // /stars returns a class as {id, class_name, section}
                    // with no `name` field — build the display title here
                    // so every group renders through the same row code.
                    title: `${x.class_name}${x.section ? ` ${x.section}` : ""}`,
                    subtitle: x.school_name || "",
                    open: () => Router.go(`notes/school/${x.school_id}/class/${encodeURIComponent(x.class_name)}/${encodeURIComponent(x.section)}`),
                })),
            },
            {
                kind: "subject",
                label: "Subjects",
                icon: "auto_stories",
                items: (stars?.subjects || []).map(x => ({
                    ...x,
                    title: x.name,
                    subtitle: [x.school_name, `${x.class_name} ${x.section}`].filter(Boolean).join(" • "),
                    open: () => Router.go(`notes/subject/${x.school_id}/${encodeURIComponent(x.class_name)}/${encodeURIComponent(x.section)}/${x.id}/${encodeURIComponent(x.name)}`),
                })),
            },
            {
                kind: "note",
                label: "Notes",
                icon: "picture_as_pdf",
                items: (stars?.notes || []).map(x => ({
                    ...x,
                    title: x.name,
                    subtitle: [x.school_name, `${x.class_name} ${x.section}`].filter(Boolean).join(" • "),
                    open: () => this._openNote(x),
                })),
            },
        ];
    },

    async _renderPicker(container) {
        const header = h("div", { className: "app-header" }, [h("h1", {}, "Notes")]);
        mount(container, header, h("div", { className: "skeleton-row" }, [h("div", { className: "skeleton skeleton-line" })]));

        let stars = null;
        let loadError = null;
        try { stars = await StarsApi.list(); } catch (err) { loadError = err; }

        const reload = () => this._renderPicker(container);

        if (loadError) {
            mount(container, header, EmptyState({
                icon: "error",
                title: "Couldn't load your starred items",
                subtitle: loadError.message,
                actionLabel: "Try again",
                onAction: reload,
            }));
            return;
        }

        const groups = this._starGroups(stars).filter(g => g.items.length);

        if (!groups.length) {
            mount(container, header, EmptyState({
                icon: "star",
                title: "Nothing starred yet",
                subtitle: "Tap the star on a class, subject or note in the Schools tab and it'll show up here for quick access.",
                actionLabel: "Browse schools",
                onAction: () => Router.go("schools"),
            }));
            return;
        }

        const blocks = groups.map(group => h("div", { className: "star-group" }, [
            h("div", { className: "section-label" }, [
                group.label,
                h("span", { className: "section-label-count" }, String(group.items.length)),
            ]),
            h("div", { className: "star-group-list" }, group.items.map(item => {
                const row = h("div", {
                    className: "card-row starred-row",
                    onClick: () => item.open(),
                }, [
                    h("span", { className: "material-symbols-rounded starred-row-icon" }, group.icon),
                    h("div", { className: "card-row-text" }, [
                        h("div", { className: "card-row-title" }, item.title),
                        item.subtitle ? h("div", { className: "card-row-sub" }, item.subtitle) : null,
                    ]),
                    group.kind === "note" && item.status
                        ? h("span", { className: `badge ${item.status === "Finished" ? "badge-success" : "badge-warning"}` }, item.status === "Finished" ? "Completed" : "In progress")
                        : null,
                ]);
                // Unstar in place: the row disappears the instant you tap
                // the star (no waiting on the network). If the unstar
                // couldn't be confirmed, the row is already gone, so the
                // simplest correct fix is to reload this screen from the
                // server rather than try to splice it back in by hand.
                row.appendChild(this._starButton(group.kind, item.id, true, (starredNow, meta) => {
                    if (meta?.reverted) { reload(); return; }
                    if (!starredNow) row.remove();
                }));
                return row;
            })),
        ]));

        mount(container, header,
            h("p", { className: "crumb" }, "Your starred classes, subjects and notes"),
            ...blocks);
    },


    // ---------------- CHAPTER NOTES ----------------

    async _renderChapterNotes(container, ctx) {
        const header = h("div", { className: "app-header" }, [
            h("button", {
                className: "back-btn",
                onClick: () => Router.goBack(ctx.mode === "subject"
                    ? `schools/${ctx.schoolId}/class/${encodeURIComponent(ctx.className)}/${encodeURIComponent(ctx.section)}/subjects`
                    : `schools/${ctx.schoolId}/class/${encodeURIComponent(ctx.className)}/${encodeURIComponent(ctx.section)}/subject/${ctx.subjectId}/${encodeURIComponent(ctx.subjectName)}`),
            }, [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("h1", {}, ctx.mode === "subject" ? ctx.subjectName : ctx.chapterName),
        ]);
        mount(container, header, h("p", { className: "crumb" }, `${ctx.className} ${ctx.section} • ${ctx.subjectName}`), h("div", { className: "skeleton-row" }, [h("div", { className: "skeleton skeleton-line" })]));

        let notes = [];
        let loadError = null;

        // NO NOTES BEFORE JOINING. Membership is checked first and the note
        // list is never requested for a non-member (the backend enforces the
        // same rule on /notes/* and on the PDF bytes themselves).
        const myClass = await Membership.state(ctx.schoolId, ctx.className, ctx.section);
        if (!Membership.isMember(myClass)) {
            mount(container, header, Membership.lockedView(
                { schoolId: ctx.schoolId, className: ctx.className, section: ctx.section }, myClass,
                () => this._renderChapterNotes(container, ctx),
                { title: `Join ${ctx.className} ${ctx.section}` }));
            return;
        }
        ctx.role = myClass?.role || null;

        try { this._starIds = await this._loadStarIds(); } catch { /* stars are optional polish */ }
        try {
            notes = ctx.mode === "subject"
                ? await NotesApi.listForSubject(ctx.subjectId)
                : await NotesApi.listForChapter(ctx.chapterId);
        }
        catch (err) { loadError = err; }


        if (loadError) {
            mount(container, header, EmptyState({ icon: "menu_book", title: "Couldn't load notes", subtitle: loadError.message }));
            return;
        }

        this._paintChapter(container, header, ctx, notes);
    },

    // Same reasoning as _reloadClassNotesQuiet: repaint after a successful
    // upload/edit without wiping back to a loading skeleton first.
    async _reloadChapterNotesQuiet(container, ctx) {
        const header = qs(".app-header") || h("div", { className: "app-header" }, [h("h1", {}, ctx.mode === "subject" ? ctx.subjectName : ctx.chapterName)]);
        let notes = [];
        try {
            notes = ctx.mode === "subject"
                ? await NotesApi.listForSubject(ctx.subjectId)
                : await NotesApi.listForChapter(ctx.chapterId);
        } catch (err) { Toast.fromApiError(err); return; }
        this._paintChapter(container, header, ctx, notes);
    },

    _paintChapter(container, header, ctx, notes) {
        const crumb = h("p", { className: "crumb" }, `${ctx.className} ${ctx.section} • ${ctx.subjectName}`);
        const listWrap = h("div", { id: "notes-list" });
        const role = ctx.role || null;
        const canWrite = role === "Owner" || role === "Teacher" || role === "Helper";

        if (notes.length === 0) {
            mount(listWrap, EmptyState({
                icon: "menu_book",
                title: ctx.mode === "subject"
                    ? "No notes have been added to this subject yet"
                    : "No notes have been added to this chapter yet",
            }));
        } else {
            notes.forEach(note => {
                const onOpen = () => this._openNote(note);
                const onChanged = () => this._renderChapterNotes(container, ctx);
                listWrap.appendChild(this._noteCard(note, {
                    onOpen, onChanged,
                    starred: this._starIds ? this._starIds.notes.has(note.id) : undefined,
                    // The star button already paints itself instantly and
                    // rolls back on its own if the toggle fails — no need
                    // to re-fetch and repaint the whole chapter for it.
                    onStarChanged: null,
                    role, ctx,
                }));
            });
        }

        // Part 6 — the "+" is visible ONLY to Owner/Teacher/Helper.
        // Normal Members never see it at all.
        const fab = canWrite ? h("button", { className: "fab", onClick: () => this._openChapterUploadSheet(container, header, ctx) }, [
            h("span", { className: "material-symbols-rounded" }, "upload_file"),
        ]) : null;

        mount(container, header, crumb, listWrap, fab);
    },

    _openChapterUploadSheet(container, header, ctx) {
        const nameField = h("input", { placeholder: "e.g. Introduction" });
        const descField = h("textarea", { placeholder: "Short description (optional)" });
        const statusField = h("select", {}, [
            h("option", { value: "Under_progress" }, "In progress"),
            h("option", { value: "Finished" }, "Completed"),
        ]);
        const picker = this._buildImagePicker();
        const btn = h("button", { className: "btn btn-primary btn-block" }, "Continue");

        btn.addEventListener("click", () => {
            this._submitNoteUpload({
                nameField, descField, statusField, picker,
                uploadFn: (file, { name, description, status }) => NotesApi.upload(ctx.schoolId, ctx.className, ctx.section, {
                    name, description, status,
                    chapterId: ctx.chapterId,
                    subjectId: ctx.mode === "subject" ? ctx.subjectId : undefined,
                }, file),
                onReload: () => NotesPage._reloadChapterNotesQuiet(qs("#app-content"), ctx),
            });
        });

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:14px" }, `Upload to ${ctx.mode === "subject" ? ctx.subjectName : ctx.chapterName}`),
            h("div", { className: "field" }, [h("label", {}, "Name"), nameField]),
            h("div", { className: "field" }, [h("label", {}, "Description"), descField]),
            h("div", { className: "field" }, [h("label", {}, "Status"), statusField]),
            picker.element,
            btn,
        ]));
    },

    // ---------------- CLASS NOTES ----------------

    async _renderClassNotes(container, schoolId, className, section) {
        const header = h("div", { className: "app-header" }, [
            h("button", { className: "back-btn", onClick: () => Router.goBack("notes") }, [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("h1", {}, `${className} ${section}`),
        ]);
        mount(container, header, h("div", { className: "skeleton-row" }, [h("div", { className: "skeleton skeleton-line" })]));

        let notes = [];
        let role = null;
        let loadError = null;

        // Same rule as the chapter/subject list: no member-only notes before
        // the user has explicitly joined this section.
        const myClass = await Membership.state(schoolId, className, section);
        if (!Membership.isMember(myClass)) {
            mount(container, header, Membership.lockedView({ schoolId, className, section }, myClass,
                () => this._renderClassNotes(container, schoolId, className, section),
                { title: `Join ${className} ${section}` }));
            return;
        }
        role = myClass?.role || null;

        try {
            notes = await NotesApi.listForClass(schoolId, className, section);
        }
        catch (err) { loadError = err; }


        if (loadError) {
            mount(container, header, EmptyState({ icon: "menu_book", title: "Couldn't load notes", subtitle: loadError.message }));
            return;
        }

        this._paint(container, header, schoolId, className, section, notes, role);
    },

    // Used after a successful upload/edit/delete: re-fetches and repaints
    // the list in place, without wiping the screen back to a loading
    // skeleton first (that's what _renderClassNotes does, which is right
    // for a fresh navigation but jarring right after an optimistic action
    // that already showed its own progress state).
    async _reloadClassNotesQuiet(container, schoolId, className, section) {
        const header = qs(".app-header") || h("div", { className: "app-header" }, [
            h("button", { className: "back-btn", onClick: () => Router.goBack("notes") }, [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("h1", {}, `${className} ${section}`),
        ]);
        let notes = [];
        try { notes = await NotesApi.listForClass(schoolId, className, section); }
        catch (err) { Toast.fromApiError(err); return; }
        const myClass = await Membership.state(schoolId, className, section);
        this._paint(container, header, schoolId, className, section, notes, myClass?.role || null);
    },

    _paint(container, header, schoolId, className, section, notes, role) {
        const listWrap = h("div", { id: "notes-list" });
        const canWrite = role === "Owner" || role === "Teacher" || role === "Helper";

        if (notes.length === 0) {
            mount(listWrap, EmptyState({ icon: "menu_book", title: "No notes have been added to this class yet" }));
        } else {
            notes.forEach(note => {
                const onOpen = () => this._openNote(note);
                const onChanged = () => this._renderClassNotes(container, schoolId, className, section);
                listWrap.appendChild(this._noteCard(note, { onOpen, onChanged, role, ctx: { schoolId, className, section } }));
            });
        }

        // Part 6 — the "+" is visible ONLY to Owner/Teacher/Helper.
        const fab = canWrite ? h("button", { className: "fab", onClick: () => this._openUploadSheet(schoolId, className, section) }, [
            h("span", { className: "material-symbols-rounded" }, "upload_file"),
        ]) : null;

        mount(container, header, listWrap, fab);
    },

    // Opening a note opens its PDF inside the app: the file comes from
    // the backend with the user's token (notes are private — see
    // NotesApi.getFile), then renders full-screen via PdfViewer
    // (utils/pdf-viewer.js). NotesApi.getFile is backed by StorageService,
    // which persists the bytes on-device (IndexedDB) — the first open
    // downloads it, every open after that (even next app launch) comes
    // straight from disk, so this only shows "Opening…" while it's
    // actually fetching something over the network.
    async _openNote(note) {
        if (!note.storage_id) { Toast.fromApiError(new ApiError(400, "This note is missing its storage ID.")); return; }
        // Only flash a "loading" hint when this genuinely isn't sitting
        // in memory yet — a warm/disk-cached note should just open.
        if (!StorageService.has(note.storage_id)) Toast.show("Opening PDF…");
        let blob;
        try { blob = await StorageService.getBlob(note.storage_id); }
        catch (err) {
            // Only nag with a toast for the part that's actually slow —
            // a fresh download — not for the instant on-disk hit.
            Toast.fromApiError(err instanceof ApiError ? err : new ApiError(0, err?.message || "This PDF couldn't be opened."));
            return;
        }
        PdfViewer.open(blob, { name: note.name, storageId: note.storage_id });
    },

    _openUploadSheet(schoolId, className, section) {
        const nameField = h("input", { placeholder: "e.g. Chapter 1" });
        const descField = h("textarea", { placeholder: "Short description (optional)" });
        const statusField = h("select", {}, [
            h("option", { value: "Under_progress" }, "In progress"),
            h("option", { value: "Finished" }, "Completed"),
        ]);
        const picker = this._buildImagePicker();
        const btn = h("button", { className: "btn btn-primary btn-block" }, "Continue");

        btn.addEventListener("click", () => {
            this._submitNoteUpload({
                nameField, descField, statusField, picker,
                uploadFn: (file, { name, description, status }) => NotesApi.upload(schoolId, className, section, { name, description, status }, file),
                onReload: () => NotesPage._reloadClassNotesQuiet(qs("#app-content"), schoolId, className, section),
            });
        });

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:14px" }, "Upload a note"),
            h("div", { className: "field" }, [h("label", {}, "Name"), nameField]),
            h("div", { className: "field" }, [h("label", {}, "Description"), descField]),
            h("div", { className: "field" }, [h("label", {}, "Status"), statusField]),
            picker.element,
            btn,
        ]));
    },


};

window.NotesPage = NotesPage;