// ------------------------------------------------------------------
// api/subjects.js — wraps Subjects/subject_generation.py (SubjectsApi)
// and Subjects/chapter_generation.py (ChaptersApi).
//
// Addressed the same way ClassesApi is: by school_id + human-readable
// class name/section, never a raw class_id the frontend never sees.
// ------------------------------------------------------------------

const SubjectsApi = {
    // GET /school/{schoolId}/class/{className}/{section}/subjects
    // -> [{id, name, class_id, chapter_count}]
    list(schoolId, className, section) {
        return Api.get(`/school/${schoolId}/class/${encodeURIComponent(className)}/${encodeURIComponent(section)}/subjects`);
    },

    // POST /school/{schoolId}/class/{className}/{section}/subjects {names:[...]}
    // Frontend splits a comma-separated "Maths,English,Science" input into
    // this array; the backend stores each as its own row.
    // subjects: [{name, description}] — a subject is created with a name
    // and an optional description.
    create(schoolId, className, section, subjects) {
        return Api.post(`/school/${schoolId}/class/${encodeURIComponent(className)}/${encodeURIComponent(section)}/subjects`, { subjects });
    },

    // PUT /school/{schoolId}/subjects/{subjectId}/rename {name}
    rename(schoolId, subjectId, name, description) {
        return Api.put(`/school/${schoolId}/subjects/${subjectId}/rename`, { name, description });
    },

    // DELETE /school/{schoolId}/subjects/{subjectId}
    remove(schoolId, subjectId) {
        return Api.delete(`/school/${schoolId}/subjects/${subjectId}`);
    },
};

const ChaptersApi = {
    // GET /school/{schoolId}/subjects/{subjectId}/chapters
    // -> [{id, name, subject_id, status, note_count}]
    list(schoolId, subjectId) {
        return Api.get(`/school/${schoolId}/subjects/${subjectId}/chapters`);
    },

    // POST /school/{schoolId}/subjects/{subjectId}/chapters {names:[...]}
    create(schoolId, subjectId, names) {
        return Api.post(`/school/${schoolId}/subjects/${subjectId}/chapters`, { names });
    },

    // PUT /school/{schoolId}/chapters/{chapterId}/status {status: "Completed"|"Not_Completed"}
    setStatus(schoolId, chapterId, status) {
        return Api.put(`/school/${schoolId}/chapters/${chapterId}/status`, { status });
    },

    // PUT /school/{schoolId}/chapters/{chapterId}/rename {name}
    rename(schoolId, chapterId, name) {
        return Api.put(`/school/${schoolId}/chapters/${chapterId}/rename`, { name });
    },

    // DELETE /school/{schoolId}/chapters/{chapterId}
    remove(schoolId, chapterId) {
        return Api.delete(`/school/${schoolId}/chapters/${chapterId}`);
    },
};

window.SubjectsApi = SubjectsApi;
window.ChaptersApi = ChaptersApi;
