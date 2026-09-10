// ------------------------------------------------------------------
// api/schools.js — wraps Schools/create_school.py, join_school.py,
// role_handling.py
//
// Verified against the actual backend source for this pass: both
// /school/dashboard and /school/{id}/members correctly read
// school.name/description and user.name/bio, the profile-pic route
// decorator has its leading slash, and Schools/create_school.py
// creates Uploads/school_icons on import (os.makedirs(..., exist_ok=True)),
// so the icon upload doesn't 500 on a missing directory. See
// backend.md for the one real issue in this file (missing null-check
// on the uploaded file before reading its filename).
// ------------------------------------------------------------------

const SchoolsApi = {
    // POST /school/create {name, description, address, phone}
    // -> {message, school:{id, name, join_code, ...}} so the UI can show
    // the join code right after creation.
    create({ name, description, address, phone }) {
        return Api.post("/school/create", { name, description, address, phone });
    },

    // PUT /school/{id} — Owner only, partial update of school details.
    update(schoolId, fields) {
        return Api.put(`/school/${schoolId}`, fields);
    },

    // GET /school/{id}/info -> school information card.
    // Non-members get public fields only; join_code comes back for
    // Owner/Teacher and is null for everyone else.
    info(schoolId) {
        return Api.get(`/school/${schoolId}/info`);
    },

    // GET /school/dashboard -> [{id, name, description, role, profile_pic}]
    dashboard() {
        return Api.get("/school/dashboard");
    },

    // GET /school/explore?school_name=
    explore(query) {
        return Api.get(`/school/explore?school_name=${encodeURIComponent(query)}`);
    },

    // POST /school/join {join_code}
    join(joinCode) {
        return Api.post("/school/join", { join_code: joinCode });
    },

    // DELETE /school/{id}/member/leave
    leave(schoolId) {
        return Api.delete(`/school/${schoolId}/member/leave`);
    },

    // GET /school/{id}/members
    members(schoolId) {
        return Api.get(`/school/${schoolId}/members`);
    },

    // PUT /school/{id}/members/{userId}/role {role: Teacher|Helper|Member}
    changeRole(schoolId, userId, role) {
        return Api.put(`/school/${schoolId}/members/${userId}/role`, { role });
    },

    // DELETE /school/{id}/member/{userId}
    removeMember(schoolId, userId) {
        return Api.delete(`/school/${schoolId}/member/${userId}`);
    },

    // PUT school/{id}/profile-pic  (multipart)
    async uploadProfilePic(schoolId, file) {
        const form = new FormData();
        file = await FileCompression.compressImageForUpload(file, { maxDimension: 768, quality: 0.72, maxBytes: 220 * 1024 });
        form.append("file", file);
        return Api.uploadPut(`/school/${schoolId}/profile-pic`, form);
    },
};

window.SchoolsApi = SchoolsApi;
