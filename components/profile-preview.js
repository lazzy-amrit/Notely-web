// Tap-a-member profile preview used from the school/class member lists.
// The backend is authoritative: when an id is available we fetch the complete
// public profile so role, bio, avatar and teacher details survive restarts.

async function openProfilePreview(user) {
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

    Sheet.open(h("div", { className: "profile-preview" }, [
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
    ]));
}

window.openProfilePreview = openProfilePreview;
