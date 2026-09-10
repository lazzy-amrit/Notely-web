// ------------------------------------------------------------------
// api/notes.js — wraps Notes/get_notes.py, uploading_notes.py, merging.py
//
// Notes PDFs are PRIVATE. There is no public /Uploads/notes/ path —
// every read of a note file goes through getFile() below, which
// carries the user's auth token so the backend can check class
// membership before returning bytes.
//
// List calls are cache-first (see services/cache.js _policy, which
// already covers /notes/school|chapter|subject/ paths with a 10-minute
// maxAge) — cached notes render instantly on repeat visits while a
// background refresh keeps them current. Every mutation below calls
// CacheService.invalidateForMutation() so a fresh upload/edit/delete
// clears the stale cached list *before* the caller's next list fetch,
// instead of silently showing old data right after a change.
// ------------------------------------------------------------------

const NotesApi = {
    // GET /notes/school/{schoolId}/class/{className}/{section}
    // Still returns every note in the class regardless of chapter —
    // kept as-is for anything that wants the whole-class view.
    listForClass(schoolId, className, section) {
        const path = `/notes/school/${schoolId}/class/${encodeURIComponent(className)}/${encodeURIComponent(section)}`;
        return CacheService.getOrFetch(path, () => Api.get(path));
    },

    // GET /notes/chapter/{chapterId} — notes scoped to one chapter,
    // which is what the Subject -> Chapter -> Notes drill-down uses.
    listForChapter(chapterId) {
        const path = `/notes/chapter/${chapterId}`;
        return CacheService.getOrFetch(path, () => Api.get(path));
    },

    // GET /notes/subject/{subjectId} — a subject opens straight onto its
    // notes, so this is the main list the Notes screen uses.
    listForSubject(subjectId) {
        const path = `/notes/subject/${subjectId}`;
        return CacheService.getOrFetch(path, () => Api.get(path));
    },

    // The backend now exposes all protected files through one streaming
    // endpoint. Notes carry storage_id; use that directly.
    //
    // Routed through StorageService (not a bare Api.getStorageBlob) so a
    // note's PDF is persisted to on-device storage (IndexedDB) the same
    // way avatars already are — storage ids never change for a given
    // file (see services/storage.js), so once it's been opened once it
    // opens instantly from disk on every later tap, even after the app
    // has been fully closed and reopened, with zero network wait.
    getFile(storageId) {
        return StorageService.getBlob(storageId);
    },

    // POST /notes/school/{schoolId}/class/{className}/{section}  (multipart: file + description/name/status/chapter_id fields)
    // chapterId is optional — omitting it behaves exactly like before
    // (note lands in the class but isn't attached to a chapter).
    async upload(schoolId, className, section, { name, description, status, chapterId, subjectId }, file) {
        file = await FileCompression.preparePdfForUpload(file);
        const form = new FormData();
        form.append("file", file);
        // Verified against Notes/uploading_notes.py: name, description,
        // status, chapter_id and subject_id are all declared as
        // Form(...) parameters (alongside File(...)), not a JSON body —
        // so sending them as form fields here is correct.
        form.append("name", name);
        form.append("description", description ?? "");
        form.append("status", status);
        if (chapterId !== undefined && chapterId !== null) form.append("chapter_id", chapterId);
        if (subjectId !== undefined && subjectId !== null) form.append("subject_id", subjectId);
        const result = await Api.upload(`/notes/school/${schoolId}/class/${encodeURIComponent(className)}/${encodeURIComponent(section)}`, form);
        CacheService?.invalidateForMutation?.("/notes/");
        return result;
    },

    // PATCH /notes/{noteId}  (JSON: name?, description?, status?)
    async update(noteId, fields) {
        const result = await Api.patch(`/notes/${noteId}`, fields);
        CacheService?.invalidateForMutation?.("/notes/");
        return result;
    },

    // DELETE /notes/{noteId}
    async remove(noteId) {
        const result = await Api.delete(`/notes/${noteId}`);
        CacheService?.invalidateForMutation?.("/notes/");
        return result;
    },

    // POST /notes/merge {note_ids, name, description?, status}
    async merge({ noteIds, name, description, status }) {
        const result = await Api.post("/notes/merge", { note_ids: noteIds, name, description, status });
        CacheService?.invalidateForMutation?.("/notes/");
        return result;
    },
};

window.NotesApi = NotesApi;