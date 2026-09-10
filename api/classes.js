// ------------------------------------------------------------------
// api/classes.js — wraps Schools/class_generation.py, class_joining.py
//
// Per the spec: the frontend never needs a raw class_id for anything
// a user does — every endpoint here is addressed by school_id plus
// the human-readable class name + section.
// ------------------------------------------------------------------

const ClassesApi = {
    // POST /school/{schoolId}/classes {classes:[{name, sections:[...]}]}
    create(schoolId, classes) {
        return Api.post(`/school/${schoolId}/classes`, { classes });
    },

    // GET /school/{schoolId}/classes -> [{name, sections:[...]}]
    // Verified against the backend source: any school member can call
    // this (it only requires membership, not a specific role) — a
    // previous note here claiming it was Owner-only was incorrect.
    list(schoolId) {
        return Api.get(`/school/${schoolId}/classes`);
    },

    // PUT /school/{schoolId}/classes/rename {old_name, new_name}
    rename(schoolId, oldName, newName) {
        return Api.put(`/school/${schoolId}/classes/rename`, { old_name: oldName, new_name: newName });
    },

    // DELETE /school/{schoolId}/class/{className}/{section}
    deleteSection(schoolId, className, section) {
        return Api.delete(`/school/${schoolId}/class/${encodeURIComponent(className)}/${encodeURIComponent(section)}`);
    },

    // DELETE /school/{schoolId}/class/{className}
    deleteClass(schoolId, className) {
        return Api.delete(`/school/${schoolId}/class/${encodeURIComponent(className)}`);
    },

    // POST /classes/{schoolId}/classes/join {name, section}
    join(schoolId, name, section) {
        return Api.post(`/classes/${schoolId}/classes/join`, { name, section });
    },

    // DELETE /school/{schoolId}/classes/leave  — body: {name, section}
    // (unusual: a body on a DELETE request, but that's what the backend expects)
    leave(schoolId, name, section) {
        return Api.delete(`/school/${schoolId}/classes/leave`, { body: { name, section } });
    },

    // PUT /school/{schoolId}/classes/{userId}/role {name, section, role}
    changeMemberRole(schoolId, userId, name, section, role) {
        return Api.put(`/school/${schoolId}/classes/${userId}/role`, { name, section, role });
    },

    // GET /school/{schoolId}/class/{name}/{section}/members
    members(schoolId, name, section) {
        return Api.get(`/school/${schoolId}/class/${encodeURIComponent(name)}/${encodeURIComponent(section)}/members`);
    },

    // GET /school/{schoolId}/class/{name}/{section}/me
    // -> {class_id, is_member, role, school_role, member_count}
    // Read-only — never auto-enrolls. Used to decide whether to show a
    // Join button, and to role-gate the Subject/Note "+" and management
    // controls against the user's real CLASS role (Part 3).
    me(schoolId, name, section) {
        return Api.get(`/school/${schoolId}/class/${encodeURIComponent(name)}/${encodeURIComponent(section)}/me`);
    },
};

window.ClassesApi = ClassesApi;
