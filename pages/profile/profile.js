// ------------------------------------------------------------------
// pages/profile/profile.js — route: profile
// ------------------------------------------------------------------

const ProfilePage = {
    async render(container) {
        const header = h("div", { className: "app-header" }, [
            h("h1", {}, "Profile"),
            h("div", { style: "margin-left:auto;display:flex;gap:8px" }, [
                h("button", { className: "btn-icon", title: "Account", onClick: () => this._openAccountOverview(user) }, [h("span", { className: "material-symbols-rounded" }, "account_circle")]),
                h("button", { className: "btn-icon", title: "Settings", onClick: () => this._openSettings() }, [h("span", { className: "material-symbols-rounded" }, "settings")]),
            ]),
        ]);

        mount(container, header, h("div", { className: "skeleton-row" }, [h("div", { className: "skeleton skeleton-avatar" })]));

        let user = await Session.getUser();
        try { user = await AuthApi.me(); } catch { /* keep cached */ }

        const hero = h("div", { className: "card profile-hero-card" }, [
            this._avatarWithUpload(user),
            h("h2", { style: "margin-top:6px" }, user?.name || user?.username || "Notely user"),
            h("p", { className: "profile-username" }, `@${user?.username || ""}`),
            user?.role ? h("div", { className: "profile-role-line" }, [h("span", { className: "material-symbols-rounded" }, "verified_user"), h("span", { className: "badge badge-role" }, user.role)]) : null,
            user?.bio ? h("p", { className: "profile-meta profile-bio" }, user.bio) : null,
            h("button", { className: "btn btn-ghost btn-sm", style: "margin-top:16px", onClick: () => this._openEditProfile(user) }, "Edit profile"),
        ]);

        const accountCard = h("div", { className: "card profile-account-card" }, [
            h("div", { className: "profile-account-row" }, [h("span", { className: "material-symbols-rounded" }, "badge"), h("div", { className: "profile-account-copy" }, [h("strong", {}, "Role"), h("span", {}, user?.role || "—")])]),
            h("div", { className: "profile-account-row" }, [h("span", { className: "material-symbols-rounded" }, "alternate_email"), h("div", { className: "profile-account-copy" }, [h("strong", {}, "Username"), h("span", {}, `@${user?.username || "—"}`)])]),
            h("div", { className: "profile-account-row" }, [h("span", { className: "material-symbols-rounded" }, "mail"), h("div", { className: "profile-account-copy" }, [h("strong", {}, "Email"), h("span", {}, user?.email || "—")])]),
            h("div", { className: "profile-account-row" }, [h("span", { className: "material-symbols-rounded" }, "description"), h("div", { className: "profile-account-copy" }, [h("strong", {}, "Bio"), h("span", {}, user?.bio || "No bio yet")])]),
        ]);
        const teacherCard = user?.teacher_profile ? h("div", { className: "profile-teacher-card" }, [
            h("div", { className: "profile-teacher-title" }, [h("span", { className: "material-symbols-rounded" }, "school"), h("strong", {}, "Teacher profile")]),
            h("div", {}, [h("span", {}, "School"), h("strong", {}, user.teacher_profile.school || "—")]),
            h("div", {}, [h("span", {}, "Subjects"), h("strong", {}, user.teacher_profile.subjects || "—")]),
            h("div", {}, [h("span", {}, "Contact number"), h("strong", {}, user.teacher_profile.contact_number || "—")]),
            h("div", {}, [h("span", {}, "Incharge"), h("strong", {}, user.teacher_profile.incharge || "—")]),
        ]) : null;
        mount(container, header, hero, accountCard, teacherCard);
    },

    _avatarWithUpload(user) {
        const wrap = h("div", { style: "position:relative;width:92px;margin:0 auto" });
        const avatarEl = Avatar(user?.name || user?.username, user?.profile_pic, "xl");
        wrap.appendChild(avatarEl);
        const fileInput = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", className: "hidden" });
        const editBtn = h("button", {
            className: "btn-icon", style: "position:absolute;bottom:0;right:-4px;width:32px;height:32px",
            onClick: () => fileInput.click(),
        }, [h("span", { className: "material-symbols-rounded", style: "font-size:16px" }, "photo_camera")]);
        fileInput.addEventListener("change", () => {
            const file = fileInput.files[0];
            if (!file) return;
            fileInput.value = "";

            // Paint the picked photo instantly from the local file — no
            // waiting on compression or the upload round trip. The real
            // upload runs in the background; it can take a while on a
            // slow connection, so it gets a generous 40s before the photo
            // is rolled back to what it was.
            const localUrl = URL.createObjectURL(file);
            let img = qs("img", avatarEl);
            const previousSrc = img ? img.src : null;
            if (img) { img.src = localUrl; }
            else { clear(avatarEl); img = h("img", { src: localUrl, alt: user?.name || "avatar" }); avatarEl.appendChild(img); }

            Optimistic.run({
                timeoutMs: 40000,
                action: () => AuthApi.uploadProfilePicture(file),
                revert: () => {
                    URL.revokeObjectURL(localUrl);
                    if (previousSrc) { const el = qs("img", avatarEl); if (el) el.src = previousSrc; }
                    else ProfilePage.render(qs("#app-content"));
                },
                reconcile: () => Toast.success("Profile picture updated"),
                onError: () => Toast.error("Couldn't update your profile picture. Please try again."),
            });
        });
        wrap.appendChild(fileInput);
        wrap.appendChild(editBtn);
        return wrap;
    },

    _openAccountOverview(user) {
        const teacher = user?.teacher_profile;
        Sheet.open(h("div", { className: "account-overview-sheet" }, [
            h("div", { className: "sheet-handle" }),
            Avatar(user?.name || user?.username, user?.profile_pic, "xl"),
            h("h3", {}, user?.name || user?.username || "Account"),
            h("p", { className: "profile-username" }, `@${user?.username || ""}`),
            h("div", { className: "profile-account-card card" }, [
                h("div", { className: "profile-account-row" }, [h("span", { className: "material-symbols-rounded" }, "badge"), h("div", { className: "profile-account-copy" }, [h("strong", {}, "Role"), h("span", {}, user?.role || "—")])]),
                h("div", { className: "profile-account-row" }, [h("span", { className: "material-symbols-rounded" }, "description"), h("div", { className: "profile-account-copy" }, [h("strong", {}, "Bio"), h("span", {}, user?.bio || "No bio yet")])]),
            ]),
            teacher ? h("div", { className: "profile-teacher-card" }, [
                h("div", { className: "profile-teacher-title" }, [h("span", { className: "material-symbols-rounded" }, "school"), h("strong", {}, "Teacher profile")]),
                h("div", {}, [h("span", {}, "School"), h("strong", {}, teacher.school || "—")]),
                h("div", {}, [h("span", {}, "Subjects"), h("strong", {}, teacher.subjects || "—")]),
                h("div", {}, [h("span", {}, "Contact number"), h("strong", {}, teacher.contact_number || "—")]),
                h("div", {}, [h("span", {}, "Incharge"), h("strong", {}, teacher.incharge || "—")]),
            ]) : null,
        ]));
    },

    _openEditProfile(user) {
        const nameField = h("input", { value: user?.name || "" });
        const usernameField = h("input", { value: user?.username || "" });
        const emailField = h("input", { type: "email", value: user?.email || "", placeholder: "you@example.com" });
        const bioField = h("textarea", { placeholder: "A short bio" }, );
        bioField.value = user?.bio || "";

        const teacher = user?.teacher_profile;
        const schoolField = teacher ? h("input", { value: teacher.school || "" }) : null;
        const subjectsField = teacher ? h("input", { value: teacher.subjects || "" }) : null;
        const contactField = teacher ? h("input", { value: teacher.contact_number || "" }) : null;
        const inchargeField = teacher ? h("input", { value: teacher.incharge || "" }) : null;

        const btn = h("button", { className: "btn btn-primary btn-block" }, "Save changes");

        btn.addEventListener("click", async () => {
            btn.disabled = true; btn.textContent = "Saving...";
            try {
                await AuthApi.updateProfile({
                    name: nameField.value.trim() || undefined,
                    username: usernameField.value.trim() || undefined,
                    email: emailField.value.trim() || undefined,
                    bio: bioField.value,
                    ...(teacher ? {
                        school_name: schoolField.value.trim() || undefined,
                        subjects: subjectsField.value.trim() || undefined,
                        contact_number: contactField.value.trim() || undefined,
                        incharge: inchargeField.value.trim() || undefined,
                    } : {}),
                });
                Toast.success("Profile updated");
                Sheet.close();
                ProfilePage.render(qs("#app-content"));
            } catch (err) { Toast.fromApiError(err); btn.disabled = false; btn.textContent = "Save changes"; }
        });

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:14px" }, "Edit profile"),
            h("div", { className: "field" }, [h("label", {}, "Name"), nameField]),
            h("div", { className: "field" }, [h("label", {}, "Username"), usernameField]),
            h("div", { className: "field" }, [h("label", {}, "Email"), emailField]),
            h("div", { className: "field" }, [h("label", {}, "Bio"), bioField]),
            teacher ? h("div", { className: "field" }, [h("label", {}, "School"), schoolField]) : null,
            teacher ? h("div", { className: "field" }, [h("label", {}, "Subjects"), subjectsField]) : null,
            teacher ? h("div", { className: "field" }, [h("label", {}, "Contact number"), contactField]) : null,
            teacher ? h("div", { className: "field" }, [h("label", {}, "Incharge"), inchargeField]) : null,
            btn,
        ]));
    },

    // ---------------- SETTINGS ----------------

    _openSettings() {
        const row = (icon, label, onClick, danger = false) => h("div", { className: "card-row", onClick }, [
            h("span", { className: "material-symbols-rounded", style: `color:${danger ? "var(--danger)" : "var(--primary)"}` }, icon),
            h("div", { className: "card-row-text" }, [h("div", { className: "card-row-title", style: danger ? "color:var(--danger)" : "" }, label)]),
            h("span", { className: "material-symbols-rounded" }, "chevron_right"),
        ]);

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:10px" }, "Settings"),
            this._themeCard(),
            h("div", { className: "card", style: "margin-bottom:14px" }, [
                row("lock", "Change password", () => this._openChangePassword()),
                row("privacy_tip", "Privacy", () => { Sheet.close(); Router.go("policies/privacy"); }),
                row("notifications", "Notification preferences", () => this._openNotificationSettings()),
                row("description", "Terms & Conditions", () => { Sheet.close(); Router.go("policies/terms"); }),
                row("support_agent", "Customer Support", () => { Sheet.close(); Router.go("policies/support"); }),
                row("info", "About Notely", () => { Sheet.close(); Router.go("policies/about"); }),
            ]),
            h("div", { className: "card" }, [
                row("logout", "Log out", () => this._confirmLogout()),
                row("delete_forever", "Delete account", () => this._startDeleteAccount(), true),
            ]),
        ]));
    },

    // Two separate controls because they're two separate things:
    // - the in-app buzz for messages/invites that arrive while Notely is
    //   open (services/notifications.js, fully in our control)
    // - the tray notification you get when the app is backgrounded/closed,
    //   whose sound+vibration is an Android notification-channel setting
    //   that only the OS-level screen below can actually change once the
    //   channel exists (see NotelyApplication.java).
    _openNotificationSettings() {
        const buildToggleRow = (label, hint, getValue, setValue) => {
            const pill = h("button", {
                type: "button",
                className: `member-role-btn ${getValue() ? "" : "muted"}`,
            }, getValue() ? "On" : "Off");
            pill.addEventListener("click", () => {
                const next = !getValue();
                setValue(next);
                pill.textContent = next ? "On" : "Off";
                pill.classList.toggle("muted", !next);
            });
            return h("div", { className: "card-row" }, [
                h("div", { className: "card-row-text" }, [
                    h("div", { className: "card-row-title" }, label),
                    hint ? h("div", { className: "card-row-sub", style: "color:var(--muted);font-size:.78rem;margin-top:2px" }, hint) : null,
                ]),
                pill,
            ]);
        };

        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:10px" }, "Notification preferences"),
            h("div", { className: "card" }, [
                buildToggleRow(
                    "Vibrate while using Notely",
                    "New messages, invites and requests that arrive with the app open.",
                    () => NotificationService.vibrateEnabled(),
                    (val) => NotificationService.setVibrateEnabled(val),
                ),
            ]),
        ]));
    },

    // Appearance control. Three states so "System" stays available —
    // on Android that's what makes the app follow the OS-level dark
    // mode toggle instead of fighting it. The choice is persisted by
    // services/theme.js and applies instantly, with no reload.
    _themeCard() {
        const options = [
            { value: "light", label: "Light", icon: "light_mode" },
            { value: "dark", label: "Dark", icon: "dark_mode" },
            { value: "system", label: "System", icon: "contrast" },
        ];
        const current = Theme.get();

        const buttons = options.map(o => h("button", {
            type: "button",
            className: `theme-option ${o.value === current ? "selected" : ""}`,
            "aria-pressed": String(o.value === current),
            onClick: () => {
                Theme.set(o.value);
                buttons.forEach((b, i) => {
                    const on = options[i].value === o.value;
                    b.classList.toggle("selected", on);
                    b.setAttribute("aria-pressed", String(on));
                });
            },
        }, [
            h("span", { className: "material-symbols-rounded" }, o.icon),
            h("span", {}, o.label),
        ]));

        return h("div", { className: "card theme-card", style: "margin-bottom:14px" }, [
            h("div", { className: "theme-card-head" }, [
                h("span", { className: "material-symbols-rounded", style: "color:var(--primary)" }, "palette"),
                h("div", { className: "card-row-text" }, [
                    h("div", { className: "card-row-title" }, "Appearance"),
                    h("div", { className: "card-row-sub" }, "Choose how Notely looks on this device"),
                ]),
            ]),
            h("div", { className: "theme-options", role: "radiogroup", "aria-label": "Theme" }, buttons),
        ]);
    },


    _openChangePassword() {
        const oldField = h("input", { type: "password", placeholder: "Current password" });
        const newField = h("input", { type: "password", placeholder: "New password" });
        const btn = h("button", { className: "btn btn-primary btn-block" }, "Update password");
        btn.addEventListener("click", async () => {
            btn.disabled = true; btn.textContent = "Updating...";
            try {
                await AuthApi.changePassword(oldField.value, newField.value);
                Toast.success("Password updated");
                Sheet.close();
            } catch (err) { Toast.fromApiError(err); btn.disabled = false; btn.textContent = "Update password"; }
        });
        Sheet.open(h("div", {}, [
            h("div", { className: "sheet-handle" }),
            h("h3", { style: "margin-bottom:14px" }, "Change password"),
            h("div", { className: "field" }, [h("label", {}, "Current password"), oldField]),
            h("div", { className: "field" }, [h("label", {}, "New password"), newField]),
            btn,
        ]));
    },

    _confirmLogout() {
        confirmAction({
            title: "Log out?",
            message: "You'll need to sign in again to use Notely.",
            confirmLabel: "Log out",
            danger: false,
            onConfirm: async () => { AuthApi.logout(); },
        });
    },

    // Multi-step destructive flow per spec §12:
    // Settings -> Delete Account -> Warning modal -> consequences ->
    // explicit confirmation -> delete. Never a single tap.
    _startDeleteAccount() {
        const step1 = h("div", { className: "confirm-dialog" }, [
            h("span", { className: "material-symbols-rounded", style: "font-size:40px;color:var(--danger)" }, "warning"),
            h("h3", { style: "margin-top:12px" }, "Delete your account?"),
            h("p", {}, "This permanently removes your profile, messages, and school memberships. This cannot be undone."),
            h("div", { className: "confirm-actions" }, [
                h("button", { className: "btn btn-ghost", onClick: () => Sheet.close() }, "Cancel"),
                h("button", { className: "btn btn-danger", onClick: () => this._deleteAccountStep2() }, "Continue"),
            ]),
        ]);
        Sheet.open(step1, { kind: "modal" });
    },

    _deleteAccountStep2() {
        const passwordField = h("input", { type: "password", placeholder: "Enter your password" });
        const confirmBtn = h("button", { className: "btn btn-danger btn-block", disabled: "true" }, "Permanently delete my account");
        passwordField.addEventListener("input", () => { confirmBtn.disabled = passwordField.value.length === 0; });

        confirmBtn.addEventListener("click", async () => {
            confirmBtn.disabled = true; confirmBtn.textContent = "Deleting...";
            try {
                await AuthApi.deleteAccount(passwordField.value);
                Toast.show("Account deleted");
                await Session.clear();
                location.href = "auth/login.html";
            } catch (err) {
                Toast.fromApiError(err);
                confirmBtn.disabled = false;
                confirmBtn.textContent = "Permanently delete my account";
            }
        });

        Sheet.open(h("div", { className: "confirm-dialog" }, [
            h("h3", {}, "Confirm with your password"),
            h("p", {}, "For your security, enter your password to permanently delete your account."),
            h("div", { className: "field" }, [passwordField]),
            confirmBtn,
        ]), { kind: "modal" });
    },
};

window.ProfilePage = ProfilePage;
