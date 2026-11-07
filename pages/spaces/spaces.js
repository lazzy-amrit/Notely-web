// ------------------------------------------------------------------
// pages/spaces/spaces.js — Student Space feature
// Normal Notely UI (entity-list / entity-row / sheets)
// ------------------------------------------------------------------

const SpacesPage = {
    async render(container, params = []) {
        const user = await Session.getUser();
        const role = (user?.role || "").toLowerCase();

        // Backend restricts student spaces to students
        if (role && role !== "student") {
            const header = h("div", { className: "app-header" }, [
                h("button", { className: "back-btn", type: "button", onClick: () => Router.go("home") },
                    [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
                h("h1", {}, "Student Spaces"),
            ]);
            const card = h("div", { className: "card", style: "padding:20px;text-align:center;margin-top:16px;" }, [
                h("span", { className: "material-symbols-rounded", style: "font-size:44px;color:var(--primary);margin-bottom:8px;" }, "folder_shared"),
                h("h3", { style: "margin-bottom:6px;" }, "Students Only"),
                h("p", { className: "profile-meta", style: "margin-bottom:16px;" },
                    "Student Spaces are collaborative folders for students to share PDFs together. You are currently logged in with a Teacher account."),
                h("button", { className: "btn btn-primary", onClick: () => Router.go("home") }, "Back to Home"),
            ]);
            mount(container, header, card);
            return;
        }

        if (!params || params.length === 0) {
            return this._renderList(container);
        }

        const spaceId = parseInt(params[0], 10);
        if (params[1] === "folder" && params[2]) {
            const folderId = parseInt(params[2], 10);
            return this._renderFolder(container, spaceId, folderId);
        }

        return this._renderSpace(container, spaceId);
    },

    _skeleton() {
        return h("div", { className: "skeleton-row" }, [
            h("div", { className: "skeleton skeleton-avatar" }),
            h("div", { className: "skeleton skeleton-line" }),
        ]);
    },

    _formatBytes(bytes) {
        if (!bytes || bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    },

    // ---------------- LIST OF SPACES ----------------
    async _renderList(container) {
        const header = h("div", { className: "app-header" }, [
            h("h1", {}, "Student Spaces"),
            h("div", { className: "spaces-header-actions" }, [
                h("button", {
                    className: "header-action",
                    type: "button",
                    title: "Join with code",
                    onClick: () => this._openJoinSpaceSheet(),
                }, [h("span", { className: "material-symbols-rounded" }, "login")]),
                h("button", {
                    className: "header-action",
                    type: "button",
                    title: "Create space",
                    onClick: () => this._openCreateSpaceSheet(),
                }, [h("span", { className: "material-symbols-rounded" }, "add")]),
            ]),
        ]);

        mount(container, header, this._skeleton());

        let spaces = [];
        try {
            spaces = await SpacesApi.list();
        } catch (err) {
            mount(container, header, EmptyState({
                icon: "folder_shared",
                title: "Couldn't load spaces",
                subtitle: err.message || "Please check your network connection.",
                actionLabel: "Try Again",
                onAction: () => this.render(container),
            }));
            return;
        }

        const banner = h("div", { className: "spaces-info-banner" }, [
            h("p", {}, "Shared study folders for classmates and peer groups. Upload and read PDFs together."),
        ]);

        const actionRow = h("div", { className: "spaces-action-row" }, [
            h("button", {
                className: "btn btn-primary btn-sm",
                type: "button",
                onClick: () => this._openCreateSpaceSheet(),
            }, [h("span", { className: "material-symbols-rounded" }, "add"), " New Space"]),
            h("button", {
                className: "btn btn-ghost btn-sm",
                type: "button",
                onClick: () => this._openJoinSpaceSheet(),
            }, [h("span", { className: "material-symbols-rounded" }, "key"), " Join with Code"]),
        ]);

        if (!spaces.length) {
            mount(container, header, banner, actionRow, EmptyState({
                icon: "folder_shared",
                title: "No student spaces yet",
                subtitle: "Create a shared folder or join an existing space with an invite code.",
                actionLabel: "Create Space",
                onAction: () => this._openCreateSpaceSheet(),
            }));
            return;
        }

        const list = h("div", { className: "entity-list" }, spaces.map(sp => {
            const row = h("div", {
                className: "entity-row",
                role: "button",
                tabindex: "0",
                onClick: () => Router.go(`spaces/${sp.id}`),
            }, [
                h("div", { className: "entity-badge" }, [
                    h("span", { className: "material-symbols-rounded" }, "folder_shared"),
                ]),
                h("div", { className: "entity-copy" }, [
                    h("strong", {}, sp.name),
                    h("span", {}, `${sp.memberCount || 1} ${sp.memberCount === 1 ? "member" : "members"}${sp.is_owner ? " · Owner" : ""}${sp.join_code ? ` · Code: ${sp.join_code}` : ""}`),
                ]),
                h("button", {
                    className: "entity-row-action",
                    type: "button",
                    title: "Options",
                    onClick: (e) => {
                        e.stopPropagation();
                        this._openSpaceMenu(sp);
                    },
                }, [h("span", { className: "material-symbols-rounded" }, "more_vert")]),
            ]);
            return row;
        }));

        mount(container, header, banner, actionRow, list);
    },

    // ---------------- SPACE CONTENTS VIEW ----------------
    async _renderSpace(container, spaceId) {
        const header = h("div", { className: "app-header" }, [
            h("button", { className: "back-btn", type: "button", onClick: () => Router.go("spaces") },
                [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("h1", {}, "Space"),
            h("button", {
                className: "header-action",
                type: "button",
                title: "Space Options",
                onClick: () => this._openSpaceOptions(spaceId),
            }, [h("span", { className: "material-symbols-rounded" }, "more_vert")]),
        ]);

        mount(container, header, this._skeleton());

        let data = null;
        try {
            data = await SpacesApi.get(spaceId);
        } catch (err) {
            mount(container, header, EmptyState({
                icon: "folder_shared",
                title: "Couldn't load space",
                subtitle: err.message || "This space might have been deleted.",
                actionLabel: "Back to Spaces",
                onAction: () => Router.go("spaces"),
            }));
            return;
        }

        const space = data.space;
        const folders = data.contents?.folders || [];
        const files = data.contents?.files || [];

        this._cachedCurrentSpace = space;

        // Space info bar
        const summaryCard = h("div", { className: "space-summary-card" }, [
            h("div", { className: "space-summary-text" }, [
                h("strong", {}, space.name),
                h("span", {}, `${space.memberCount || 1} members · ${folders.length} folders · ${files.length} PDFs`),
            ]),
            space.join_code ? h("button", {
                className: "space-invite-chip",
                type: "button",
                title: "Tap to copy invite code",
                onClick: async () => {
                    if (await copyToClipboard(space.join_code)) {
                        Toast.success("Invite code copied: " + space.join_code);
                    }
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "key"),
                space.join_code,
            ]) : null,
        ]);

        const actionRow = h("div", { className: "spaces-action-row" }, [
            h("button", {
                className: "btn btn-primary btn-sm",
                type: "button",
                onClick: () => this._startUploadPdf(spaceId, null),
            }, [h("span", { className: "material-symbols-rounded" }, "upload_file"), " Upload PDF"]),
            h("button", {
                className: "btn btn-ghost btn-sm",
                type: "button",
                onClick: () => this._openCreateFolderSheet(spaceId, null),
            }, [h("span", { className: "material-symbols-rounded" }, "create_new_folder"), " New Folder"]),
        ]);

        const body = h("div", { className: "space-body" });
        this._renderContentsList(body, spaceId, null, folders, files);

        mount(container, header, summaryCard, actionRow, body);
    },

    // ---------------- SUBFOLDER VIEW ----------------
    async _renderFolder(container, spaceId, folderId) {
        const header = h("div", { className: "app-header" }, [
            h("button", {
                className: "back-btn",
                type: "button",
                onClick: () => {
                    if (this._currentParentFolderId) {
                        Router.go(`spaces/${spaceId}/folder/${this._currentParentFolderId}`);
                    } else {
                        Router.go(`spaces/${spaceId}`);
                    }
                },
            }, [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("h1", {}, "Folder"),
            h("button", {
                className: "header-action",
                type: "button",
                title: "Folder Options",
                onClick: () => this._openFolderOptions(spaceId, folderId),
            }, [h("span", { className: "material-symbols-rounded" }, "more_vert")]),
        ]);

        mount(container, header, this._skeleton());

        let data = null;
        try {
            data = await SpacesApi.getFolder(spaceId, folderId);
        } catch (err) {
            mount(container, header, EmptyState({
                icon: "folder",
                title: "Couldn't load folder",
                subtitle: err.message || "This folder may have been removed.",
                actionLabel: "Back to Space",
                onAction: () => Router.go(`spaces/${spaceId}`),
            }));
            return;
        }

        const folder = data.folder;
        const folders = data.contents?.folders || [];
        const files = data.contents?.files || [];

        this._currentParentFolderId = folder.parentFolderId || null;
        this._cachedCurrentFolder = folder;

        // Breadcrumb
        const crumb = h("div", { className: "crumb" }, [
            h("span", { className: "material-symbols-rounded" }, "home"),
            h("span", {
                style: "cursor:pointer;",
                onClick: () => Router.go(`spaces/${spaceId}`),
            }, "Root"),
            h("span", {}, ">"),
            h("strong", {}, folder.name),
        ]);

        const actionRow = h("div", { className: "spaces-action-row" }, [
            h("button", {
                className: "btn btn-primary btn-sm",
                type: "button",
                onClick: () => this._startUploadPdf(spaceId, folderId),
            }, [h("span", { className: "material-symbols-rounded" }, "upload_file"), " Upload PDF"]),
            h("button", {
                className: "btn btn-ghost btn-sm",
                type: "button",
                onClick: () => this._openCreateFolderSheet(spaceId, folderId),
            }, [h("span", { className: "material-symbols-rounded" }, "create_new_folder"), " New Subfolder"]),
        ]);

        const body = h("div", { className: "space-body" });
        this._renderContentsList(body, spaceId, folderId, folders, files);

        mount(container, header, crumb, actionRow, body);
    },

    _renderContentsList(container, spaceId, folderId, folders, files) {
        if (!folders.length && !files.length) {
            mount(container, EmptyState({
                icon: "folder_open",
                title: "This folder is empty",
                subtitle: "Upload a PDF or add a subfolder to get started.",
                actionLabel: "Upload PDF",
                onAction: () => this._startUploadPdf(spaceId, folderId),
            }));
            return;
        }

        const sections = [];

        // Folders Section
        if (folders.length) {
            sections.push(h("div", { className: "section-label" }, [
                h("span", {}, "Folders"),
                h("span", { className: "section-label-count" }, String(folders.length)),
            ]));

            const folderList = h("div", { className: "entity-list" }, folders.map(f => {
                return h("div", {
                    className: "entity-row",
                    role: "button",
                    tabindex: "0",
                    onClick: () => Router.go(`spaces/${spaceId}/folder/${f.id}`),
                }, [
                    h("div", { className: "entity-badge badge-folder" }, [
                        h("span", { className: "material-symbols-rounded" }, "folder"),
                    ]),
                    h("div", { className: "entity-copy" }, [
                        h("strong", {}, f.name),
                        h("span", {}, "Folder"),
                    ]),
                    h("button", {
                        className: "entity-row-action",
                        type: "button",
                        title: "Folder options",
                        onClick: (e) => {
                            e.stopPropagation();
                            this._openFolderItemMenu(spaceId, f);
                        },
                    }, [h("span", { className: "material-symbols-rounded" }, "more_vert")]),
                ]);
            }));
            sections.push(folderList);
        }

        // Files Section (PDFs only)
        if (files.length) {
            sections.push(h("div", { className: "section-label" }, [
                h("span", {}, "PDF Documents"),
                h("span", { className: "section-label-count" }, String(files.length)),
            ]));

            const fileList = h("div", { className: "entity-list" }, files.map(file => {
                return h("div", {
                    className: "entity-row",
                    role: "button",
                    tabindex: "0",
                    onClick: () => this._openPdfFile(spaceId, file),
                }, [
                    h("div", { className: "entity-badge badge-pdf" }, [
                        h("span", { className: "material-symbols-rounded" }, "picture_as_pdf"),
                    ]),
                    h("div", { className: "entity-copy" }, [
                        h("strong", {}, file.name || file.original_name || "Document.pdf"),
                        h("span", {}, this._formatBytes(file.size || 0)),
                    ]),
                    h("button", {
                        className: "entity-row-action",
                        type: "button",
                        title: "File options",
                        onClick: (e) => {
                            e.stopPropagation();
                            this._openFileMenu(spaceId, file);
                        },
                    }, [h("span", { className: "material-symbols-rounded" }, "more_vert")]),
                ]);
            }));
            sections.push(fileList);
        }

        mount(container, ...sections);
    },

    // ---------------- PDF VIEWING & ACTIONS ----------------
    async _openPdfFile(spaceId, file) {
        Toast.show("Opening PDF…");
        try {
            let blob = null;
            if (file.storage_id) {
                try {
                    blob = await StorageService.getBlob(file.storage_id);
                } catch {
                    blob = null;
                }
            }
            if (!blob) {
                const details = await SpacesApi.getFile(spaceId, file.id);
                if (details.storage_id) {
                    blob = await StorageService.getBlob(details.storage_id);
                } else if (details.download_url) {
                    blob = await Api.getBlob(details.download_url);
                } else if (details.url) {
                    const resp = await fetch(details.url);
                    blob = await resp.blob();
                }
            }

            if (!blob) {
                throw new Error("Could not retrieve document bytes.");
            }

            await PdfViewer.open(blob, {
                name: file.name || file.original_name || "Document",
                storageId: file.storage_id,
            });
        } catch (err) {
            Toast.error("Failed to open PDF: " + (err.message || "Unknown error"));
        }
    },

    // ---------------- UPLOAD PDF (PDF ONLY) ----------------
    _startUploadPdf(spaceId, folderId = null) {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "application/pdf,.pdf";
        fileInput.style.display = "none";
        document.body.appendChild(fileInput);

        fileInput.addEventListener("change", async () => {
            const file = fileInput.files?.[0];
            document.body.removeChild(fileInput);
            if (!file) return;

            const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
            if (!isPdf) {
                Toast.error("Only PDF files are supported in Student Space.");
                return;
            }

            const defaultName = file.name.replace(/\.pdf$/i, "");
            const nameInput = h("input", {
                value: defaultName,
                placeholder: "Document Title",
            });
            const uploadBtn = h("button", {
                className: "btn btn-primary btn-block",
                type: "button",
            }, "Upload PDF");

            uploadBtn.addEventListener("click", async () => {
                uploadBtn.disabled = true;
                uploadBtn.textContent = "Uploading PDF…";
                try {
                    const finalName = (nameInput.value || "").trim() || defaultName;
                    await SpacesApi.uploadFile(spaceId, file, folderId, finalName);
                    Toast.success("PDF uploaded successfully!");
                    Sheet.close();
                    if (folderId) {
                        this._renderFolder(qs("#app-content"), spaceId, folderId);
                    } else {
                        this._renderSpace(qs("#app-content"), spaceId);
                    }
                } catch (err) {
                    Toast.fromApiError(err);
                    uploadBtn.disabled = false;
                    uploadBtn.textContent = "Upload PDF";
                }
            });

            Sheet.open(h("div", {}, [
                h("div", { className: "sheet-handle" }),
                h("h3", { style: "margin-bottom:6px;" }, "Upload PDF"),
                h("p", { className: "profile-meta", style: "margin-bottom:14px;" },
                    `${file.name} (${this._formatBytes(file.size)})`),
                h("div", { className: "field", style: "margin-bottom:16px;" }, [
                    h("label", {}, "Display Name"),
                    nameInput,
                ]),
                uploadBtn,
            ]));
        });

        fileInput.click();
    },

    // ---------------- CREATE FOLDER ----------------
    _openCreateFolderSheet(spaceId, parentFolderId = null) {
        const input = h("input", {
            placeholder: "e.g. Exam Prep, Biology Notes",
            autofocus: true,
        });
        const btn = h("button", {
            className: "btn btn-primary btn-block",
            type: "button",
        }, "Create Folder");

        btn.addEventListener("click", async () => {
            const val = input.value.trim();
            if (!val) {
                Toast.error("Please enter a folder name.");
                return;
            }
            btn.disabled = true;
            btn.textContent = "Creating…";
            try {
                await SpacesApi.createFolder(spaceId, val, parentFolderId);
                Toast.success("Folder created!");
                Sheet.close();
                if (parentFolderId) {
                    this._renderFolder(qs("#app-content"), spaceId, parentFolderId);
                } else {
                    this._renderSpace(qs("#app-content"), spaceId);
                }
            } catch (err) {
                Toast.fromApiError(err);
                btn.disabled = false;
                btn.textContent = "Create Folder";
            }
        });

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:12px;" }, parentFolderId ? "Create Subfolder" : "Create Folder"),
            h("div", { className: "field", style: "margin-bottom:16px;" }, [
                h("label", {}, "Folder Name"),
                input,
            ]),
            btn,
        ]));
        setTimeout(() => input.focus(), 250);
    },

    // ---------------- CREATE SPACE ----------------
    _openCreateSpaceSheet() {
        const input = h("input", {
            placeholder: "e.g. Study Group, Math Club",
            autofocus: true,
        });
        const btn = h("button", {
            className: "btn btn-primary btn-block",
            type: "button",
        }, "Create Space");

        btn.addEventListener("click", async () => {
            const val = input.value.trim();
            if (!val) {
                Toast.error("Please enter a space name.");
                return;
            }
            btn.disabled = true;
            btn.textContent = "Creating…";
            try {
                const res = await SpacesApi.create(val);
                Toast.success("Space created!");
                Sheet.close();
                if (res?.space?.id) {
                    Router.go(`spaces/${res.space.id}`);
                } else {
                    Router.go("spaces");
                }
            } catch (err) {
                Toast.fromApiError(err);
                btn.disabled = false;
                btn.textContent = "Create Space";
            }
        });

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:6px;" }, "Create Space"),
            h("p", { className: "profile-meta", style: "margin-bottom:14px;" },
                "A shared workspace for you and your peers with a unique invite code."),
            h("div", { className: "field", style: "margin-bottom:16px;" }, [
                h("label", {}, "Space Name"),
                input,
            ]),
            btn,
        ]));
        setTimeout(() => input.focus(), 250);
    },

    // ---------------- JOIN SPACE ----------------
    _openJoinSpaceSheet() {
        const input = h("input", {
            placeholder: "Enter invite code",
            autofocus: true,
            style: "text-transform:uppercase;letter-spacing:2px;font-weight:700;",
        });
        const btn = h("button", {
            className: "btn btn-primary btn-block",
            type: "button",
        }, "Join Space");

        btn.addEventListener("click", async () => {
            const code = input.value.trim().toUpperCase();
            if (!code) {
                Toast.error("Please enter an invite code.");
                return;
            }
            btn.disabled = true;
            btn.textContent = "Joining…";
            try {
                const res = await SpacesApi.join(code);
                Toast.success("Joined space successfully!");
                Sheet.close();
                if (res?.space?.id) {
                    Router.go(`spaces/${res.space.id}`);
                } else {
                    Router.go("spaces");
                }
            } catch (err) {
                Toast.fromApiError(err);
                btn.disabled = false;
                btn.textContent = "Join Space";
            }
        });

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:6px;" }, "Join a Space"),
            h("p", { className: "profile-meta", style: "margin-bottom:14px;" },
                "Enter the invite code shared by your peer or study group."),
            h("div", { className: "field", style: "margin-bottom:16px;" }, [
                h("label", {}, "Invite Code"),
                input,
            ]),
            btn,
        ]));
        setTimeout(() => input.focus(), 250);
    },

    // ---------------- SPACE OPTIONS MENU ----------------
    _openSpaceMenu(sp) {
        const isOwner = sp.is_owner;
        const options = [
            h("button", {
                className: "action-tile",
                type: "button",
                onClick: async () => {
                    Sheet.close();
                    if (await copyToClipboard(sp.join_code)) {
                        Toast.success("Invite code copied: " + sp.join_code);
                    }
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "content_copy"),
                h("div", {}, [h("strong", {}, "Copy Invite Code"), h("span", {}, sp.join_code)]),
            ]),
        ];

        if (isOwner) {
            options.push(h("button", {
                className: "action-tile",
                type: "button",
                onClick: () => {
                    Sheet.close();
                    this._openRenameSpaceSheet(sp.id, sp.name);
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "edit"),
                h("div", {}, [h("strong", {}, "Rename Space")]),
            ]));

            options.push(h("button", {
                className: "action-tile is-danger",
                type: "button",
                onClick: () => {
                    Sheet.close();
                    confirmAction({
                        title: "Delete Space?",
                        message: `Permanently delete "${sp.name}" and all contents? This cannot be undone.`,
                        confirmLabel: "Delete",
                        danger: true,
                        onConfirm: async () => {
                            try {
                                await SpacesApi.delete(sp.id);
                                Toast.success("Space deleted.");
                                Router.go("spaces");
                            } catch (err) { Toast.fromApiError(err); }
                        },
                    });
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "delete"),
                h("div", {}, [h("strong", {}, "Delete Space")]),
            ]));
        } else {
            options.push(h("button", {
                className: "action-tile is-danger",
                type: "button",
                onClick: () => {
                    Sheet.close();
                    confirmAction({
                        title: "Leave Space?",
                        message: `Leave "${sp.name}"? You will need an invite code to rejoin.`,
                        confirmLabel: "Leave",
                        danger: true,
                        onConfirm: async () => {
                            try {
                                await SpacesApi.leave(sp.id);
                                Toast.success("Left the space.");
                                Router.go("spaces");
                            } catch (err) { Toast.fromApiError(err); }
                        },
                    });
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "logout"),
                h("div", {}, [h("strong", {}, "Leave Space")]),
            ]));
        }

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:12px;" }, sp.name),
            ...options,
        ]));
    },

    _openSpaceOptions(spaceId) {
        const sp = this._cachedCurrentSpace || { id: spaceId, name: "Space" };
        this._openSpaceMenu(sp);
    },

    _openRenameSpaceSheet(spaceId, currentName) {
        const input = h("input", {
            value: currentName,
            autofocus: true,
        });
        const btn = h("button", {
            className: "btn btn-primary btn-block",
            type: "button",
        }, "Save Name");

        btn.addEventListener("click", async () => {
            const val = input.value.trim();
            if (!val) {
                Toast.error("Name cannot be empty.");
                return;
            }
            btn.disabled = true;
            btn.textContent = "Saving…";
            try {
                await SpacesApi.rename(spaceId, val);
                Toast.success("Space renamed.");
                Sheet.close();
                this._renderSpace(qs("#app-content"), spaceId);
            } catch (err) {
                Toast.fromApiError(err);
                btn.disabled = false;
                btn.textContent = "Save Name";
            }
        });

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:12px;" }, "Rename Space"),
            h("div", { className: "field", style: "margin-bottom:16px;" }, [
                h("label", {}, "Space Name"),
                input,
            ]),
            btn,
        ]));
        setTimeout(() => input.focus(), 250);
    },

    // ---------------- FOLDER ITEM MENU ----------------
    _openFolderItemMenu(spaceId, folder) {
        const options = [
            h("button", {
                className: "action-tile",
                type: "button",
                onClick: () => {
                    Sheet.close();
                    this._openRenameFolderSheet(spaceId, folder.id, folder.name);
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "edit"),
                h("div", {}, [h("strong", {}, "Rename Folder")]),
            ]),
            h("button", {
                className: "action-tile is-danger",
                type: "button",
                onClick: () => {
                    Sheet.close();
                    confirmAction({
                        title: "Delete Folder?",
                        message: `Delete folder "${folder.name}" and all subfolders and files inside it?`,
                        confirmLabel: "Delete",
                        danger: true,
                        onConfirm: async () => {
                            try {
                                await SpacesApi.deleteFolder(spaceId, folder.id);
                                Toast.success("Folder deleted.");
                                if (folder.parentFolderId) {
                                    this._renderFolder(qs("#app-content"), spaceId, folder.parentFolderId);
                                } else {
                                    this._renderSpace(qs("#app-content"), spaceId);
                                }
                            } catch (err) { Toast.fromApiError(err); }
                        },
                    });
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "delete"),
                h("div", {}, [h("strong", {}, "Delete Folder")]),
            ]),
        ];

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:12px;" }, folder.name),
            ...options,
        ]));
    },

    _openFolderOptions(spaceId, folderId) {
        const folder = this._cachedCurrentFolder || { id: folderId, name: "Folder" };
        this._openFolderItemMenu(spaceId, folder);
    },

    _openRenameFolderSheet(spaceId, folderId, currentName) {
        const input = h("input", {
            value: currentName,
            autofocus: true,
        });
        const btn = h("button", {
            className: "btn btn-primary btn-block",
            type: "button",
        }, "Save Name");

        btn.addEventListener("click", async () => {
            const val = input.value.trim();
            if (!val) {
                Toast.error("Folder name cannot be empty.");
                return;
            }
            btn.disabled = true;
            btn.textContent = "Saving…";
            try {
                await SpacesApi.renameFolder(spaceId, folderId, val);
                Toast.success("Folder renamed.");
                Sheet.close();
                this._renderFolder(qs("#app-content"), spaceId, folderId);
            } catch (err) {
                Toast.fromApiError(err);
                btn.disabled = false;
                btn.textContent = "Save Name";
            }
        });

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:12px;" }, "Rename Folder"),
            h("div", { className: "field", style: "margin-bottom:16px;" }, [
                h("label", {}, "Folder Name"),
                input,
            ]),
            btn,
        ]));
        setTimeout(() => input.focus(), 250);
    },

    // ---------------- FILE MENU ----------------
    _openFileMenu(spaceId, file) {
        const options = [
            h("button", {
                className: "action-tile",
                type: "button",
                onClick: () => {
                    Sheet.close();
                    this._openPdfFile(spaceId, file);
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "visibility"),
                h("div", {}, [h("strong", {}, "Open PDF")]),
            ]),
            h("button", {
                className: "action-tile",
                type: "button",
                onClick: () => {
                    Sheet.close();
                    this._openMoveFileSheet(spaceId, file);
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "drive_file_move"),
                h("div", {}, [h("strong", {}, "Move to Folder")]),
            ]),
            h("button", {
                className: "action-tile",
                type: "button",
                onClick: () => {
                    Sheet.close();
                    this._openRenameFileSheet(spaceId, file);
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "edit"),
                h("div", {}, [h("strong", {}, "Rename")]),
            ]),
            h("button", {
                className: "action-tile is-danger",
                type: "button",
                onClick: () => {
                    Sheet.close();
                    confirmAction({
                        title: "Delete File?",
                        message: `Permanently delete "${file.name}"?`,
                        confirmLabel: "Delete",
                        danger: true,
                        onConfirm: async () => {
                            try {
                                await SpacesApi.deleteFile(spaceId, file.id);
                                Toast.success("File deleted.");
                                if (file.folder_id) {
                                    this._renderFolder(qs("#app-content"), spaceId, file.folder_id);
                                } else {
                                    this._renderSpace(qs("#app-content"), spaceId);
                                }
                            } catch (err) { Toast.fromApiError(err); }
                        },
                    });
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "delete"),
                h("div", {}, [h("strong", {}, "Delete File")]),
            ]),
        ];

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:12px;" }, file.name || file.original_name),
            ...options,
        ]));
    },

    _openRenameFileSheet(spaceId, file) {
        const input = h("input", {
            value: file.name || file.original_name || "",
            autofocus: true,
        });
        const btn = h("button", {
            className: "btn btn-primary btn-block",
            type: "button",
        }, "Save Name");

        btn.addEventListener("click", async () => {
            const val = input.value.trim();
            if (!val) {
                Toast.error("Name cannot be empty.");
                return;
            }
            btn.disabled = true;
            btn.textContent = "Saving…";
            try {
                await SpacesApi.renameFile(spaceId, file.id, val);
                Toast.success("File renamed.");
                Sheet.close();
                if (file.folder_id) {
                    this._renderFolder(qs("#app-content"), spaceId, file.folder_id);
                } else {
                    this._renderSpace(qs("#app-content"), spaceId);
                }
            } catch (err) {
                Toast.fromApiError(err);
                btn.disabled = false;
                btn.textContent = "Save Name";
            }
        });

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:12px;" }, "Rename File"),
            h("div", { className: "field", style: "margin-bottom:16px;" }, [
                h("label", {}, "File Name"),
                input,
            ]),
            btn,
        ]));
        setTimeout(() => input.focus(), 250);
    },

    async _openMoveFileSheet(spaceId, file) {
        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:6px;" }, "Move File"),
            h("p", { className: "profile-meta", style: "margin-bottom:12px;" }, "Select destination folder:"),
            h("div", { className: "skeleton-row" }, [h("div", { className: "skeleton skeleton-line" })]),
        ]));

        let data = null;
        try {
            data = await SpacesApi.get(spaceId);
        } catch {
            Toast.error("Couldn't load folders.");
            Sheet.close();
            return;
        }

        const folders = data.contents?.folders || [];
        const options = [
            h("button", {
                className: `action-tile ${file.folder_id === null ? "selected" : ""}`,
                type: "button",
                onClick: async () => {
                    try {
                        await SpacesApi.moveFile(spaceId, file.id, null);
                        Toast.success("Moved to Space Root.");
                        Sheet.close();
                        Router.go(`spaces/${spaceId}`);
                    } catch (err) { Toast.fromApiError(err); }
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "home"),
                h("div", {}, [h("strong", {}, "Space Root")]),
            ]),
            ...folders.map(f => h("button", {
                className: `action-tile ${file.folder_id === f.id ? "selected" : ""}`,
                type: "button",
                onClick: async () => {
                    try {
                        await SpacesApi.moveFile(spaceId, file.id, f.id);
                        Toast.success(`Moved to ${f.name}.`);
                        Sheet.close();
                        Router.go(`spaces/${spaceId}/folder/${f.id}`);
                    } catch (err) { Toast.fromApiError(err); }
                },
            }, [
                h("span", { className: "material-symbols-rounded" }, "folder"),
                h("div", {}, [h("strong", {}, f.name)]),
            ])),
        ];

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:6px;" }, "Move File"),
            h("p", { className: "profile-meta", style: "margin-bottom:12px;" },
                `Moving "${file.name || file.original_name}"`),
            ...options,
        ]));
    },
};

window.SpacesPage = SpacesPage;
