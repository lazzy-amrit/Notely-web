// Discord/Instagram-style profile preview used from messages, groups and search.
// The backend is authoritative: when an id is available we fetch the complete
// public profile so role, bio, avatar and teacher details survive restarts.

async function openProfilePreview(user, { onMessage } = {}) {
    let profile = user || {};
    if (profile?.id && window.UsersApi) {
        try {
            profile = await UsersApi.get(profile.id);
            EntityCache.rememberUser(profile);
        } catch {
            // Keep the context row as a graceful fallback.
        }
    }

    const displayName = profile.name || profile.username || "Notely user";
    const teacher = profile.teacher_profile;
    const currentUser = await Session.getUser();

    const openAddToGroup = async () => {
        let groups = [];
        try { groups = await GroupsApi.list(); } catch (err) { Toast.fromApiError(err); return; }
        if (!groups.length) { Toast.show("You aren't in any groups yet"); return; }

        const list = h("div", { className: "profile-group-picker" });
        groups.forEach(group => {
            const row = h("button", { className: "action-tile" }, [
                Avatar(group.name, group.profile_pic, "sm"),
                h("div", {}, [
                    h("strong", {}, group.name),
                    h("span", {}, `${group.member_count || 0} members · ${group.my_role || "Member"}`),
                ]),
                h("span", { className: "material-symbols-rounded action-arrow" }, "person_add"),
            ]);
            // Instant "added" feedback and sheet close — no waiting on the
            // network to see it happen. The add itself confirms in the
            // background (20s); a failure reopens this picker so the tap
            // isn't silently lost.
            row.addEventListener("click", () => {
                Optimistic.run({
                    timeoutMs: 20000,
                    apply: () => { Toast.success(`${displayName} added to ${group.name}`); Sheet.close(); },
                    action: () => GroupsApi.addMember(group.id, profile.id, group.school_id || null),
                    revert: () => { Toast.error(`Couldn't add ${displayName} to ${group.name}. Try again.`); openAddToGroup(); },
                    onError: () => {},
                });
            });
            list.appendChild(row);
        });

        Sheet.open(h("div", { className: "profile-group-sheet" }, [
            h("div", { className: "sheet-handle" }),
            h("div", { className: "sheet-kicker" }, "ADD TO GROUP"),
            h("h3", {}, `Add ${displayName}`),
            h("p", { className: "sheet-copy" }, "Choose one of your groups. School groups still enforce the school's membership rules."),
            list,
        ]));
    };

    const body = h("div", { className: "profile-preview" }, [
        h("div", { className: "sheet-handle" }),
        Avatar(displayName, profile.profile_pic, "xl"),
        h("h2", {}, displayName),
        h("p", { className: "profile-username" }, `@${profile.username || "user"}`),
        profile.role ? h("span", { className: "badge badge-role" }, profile.role) : null,
        profile.bio ? h("p", { className: "profile-meta profile-bio" }, profile.bio) : null,
        teacher ? h("div", { className: "profile-teacher-card" }, [
            h("div", { className: "profile-teacher-title" }, [
                h("span", { className: "material-symbols-rounded" }, "school"),
                h("strong", {}, "Teacher profile"),
            ]),
            h("div", {}, [h("span", {}, "School"), h("strong", {}, teacher.school || "—")]),
            h("div", {}, [h("span", {}, "Subjects"), h("strong", {}, teacher.subjects || "—")]),
        ]) : null,
        h("div", { className: "profile-preview-actions" }, [
            onMessage ? h("button", {
                className: "btn btn-primary",
                onClick: () => { Sheet.close(); onMessage(profile); },
            }, [h("span", { className: "material-symbols-rounded" }, "chat"), " Message"]) : null,
            profile.id && String(profile.id) !== String(currentUser?.id) ? h("button", {
                className: "btn btn-ghost",
                onClick: openAddToGroup,
            }, [h("span", { className: "material-symbols-rounded" }, "group_add"), " Add to group"]) : null,
        ]),
    ]);

    Sheet.open(body);
}

window.openProfilePreview = openProfilePreview;
