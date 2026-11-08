// ------------------------------------------------------------------
// api/spaces.js — client for Student Space backend endpoints
// wraps StudentSpace/create_space.py, folders.py, files.py
// ------------------------------------------------------------------

const SpacesApi = {
    async _withRetry(request) {
        try { return await request(); }
        catch (err) {
            if (err?.status && err.status !== 0 && err.status < 500) throw err;
            await new Promise(resolve => setTimeout(resolve, 350));
            return request();
        }
    },

    // GET /student/space/me -> list of spaces the user is member of
    async list() {
        return this._withRetry(() => Api.get("/student/space/me"));
    },

    // POST /student/space/create { name } -> { message, space }
    create(name) {
        return Api.post("/student/space/create", { name });
    },

    // POST /student/space/join { inviteCode } -> { message, space }
    join(inviteCode) {
        return Api.post("/student/space/join", { inviteCode });
    },

    // GET /student/space/{spaceId} -> { success, space, contents: { folders, files } }
    get(spaceId) {
        return this._withRetry(() => Api.get(`/student/space/${encodeURIComponent(spaceId)}`));
    },

    members(spaceId) {
        return Api.get(`/student/space/${encodeURIComponent(spaceId)}/members`);
    },

    // PATCH /student/space/{spaceId}/rename { name }
    rename(spaceId, name) {
        return Api.patch(`/student/space/${encodeURIComponent(spaceId)}/rename`, { name });
    },

    // DELETE /student/space/{spaceId}
    delete(spaceId) {
        return Api.delete(`/student/space/${encodeURIComponent(spaceId)}`);
    },

    // POST /student/space/{spaceId}/leave
    leave(spaceId) {
        return Api.post(`/student/space/${encodeURIComponent(spaceId)}/leave`);
    },

    // POST /student/space/{spaceId}/folder/create { name, parentFolderId }
    createFolder(spaceId, name, parentFolderId = null) {
        return Api.post(`/student/space/${encodeURIComponent(spaceId)}/folder/create`, {
            name,
            parentFolderId: parentFolderId || null,
        });
    },

    // PATCH /student/space/{spaceId}/folder/{folderId}/rename { name }
    renameFolder(spaceId, folderId, name) {
        return Api.patch(`/student/space/${encodeURIComponent(spaceId)}/folder/${encodeURIComponent(folderId)}/rename`, {
            name,
        });
    },

    // DELETE /student/space/{spaceId}/folder/{folderId}
    deleteFolder(spaceId, folderId) {
        return Api.delete(`/student/space/${encodeURIComponent(spaceId)}/folder/${encodeURIComponent(folderId)}`);
    },

    // GET /student/space/{spaceId}/folder/{folderId} -> { success, folder, contents: { folders, files } }
    getFolder(spaceId, folderId) {
        return this._withRetry(() => Api.get(`/student/space/${encodeURIComponent(spaceId)}/folder/${encodeURIComponent(folderId)}`));
    },

    // POST /student/space/{spaceId}/file/upload (multipart: file, folder_id?, name?)
    // Images are normalized to a PDF in the UI before this method is called.
    async uploadFile(spaceId, file, folderId = null, displayName = null) {
        if (!file) throw new Error("Please select a file to upload.");
        const isPdf = file.type === "application/pdf" || (file.name && file.name.toLowerCase().endsWith(".pdf"));
        if (!isPdf) {
            throw new Error("Images must be converted to a PDF before upload.");
        }

        const form = new FormData();
        form.append("file", file);
        if (folderId !== null && folderId !== undefined) {
            form.append("folder_id", String(folderId));
        }
        if (displayName && displayName.trim()) {
            form.append("name", displayName.trim());
        }

        return Api.upload(`/student/space/${encodeURIComponent(spaceId)}/file/upload`, form);
    },

    // GET /student/space/{spaceId}/file/{fileId} -> file details (including url, storage_id, download_url)
    getFile(spaceId, fileId) {
        return Api.get(`/student/space/${encodeURIComponent(spaceId)}/file/${encodeURIComponent(fileId)}`);
    },

    // PATCH /student/space/{spaceId}/file/{fileId}/rename { name }
    renameFile(spaceId, fileId, name) {
        return Api.patch(`/student/space/${encodeURIComponent(spaceId)}/file/${encodeURIComponent(fileId)}/rename`, {
            name,
        });
    },

    // PATCH /student/space/{spaceId}/file/{fileId}/move { folderId }
    moveFile(spaceId, fileId, folderId = null) {
        return Api.patch(`/student/space/${encodeURIComponent(spaceId)}/file/${encodeURIComponent(fileId)}/move`, {
            folderId: folderId || null,
        });
    },

    // DELETE /student/space/{spaceId}/file/{fileId}
    deleteFile(spaceId, fileId) {
        return Api.delete(`/student/space/${encodeURIComponent(spaceId)}/file/${encodeURIComponent(fileId)}`);
    },
};

window.SpacesApi = SpacesApi;
