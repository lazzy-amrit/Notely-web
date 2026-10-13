// Groups API — dashboard, details, members, roles and group avatar.
const GroupsApi = {
    list() { return Api.get("/chats/groups"); },
    detail(groupId) { return Api.get(`/chat/group/${groupId}`); },
    create({ name, description, typeo, schoolId }) {
        return Api.post("/chat/groups", { name, description, typeo, school_id: schoolId ?? null });
    },
    remove(groupId) { return Api.delete(`/chat/group/${groupId}/delete`); },
    leave(groupId) { return Api.delete(`/chat/group/${groupId}/leave`); },
    addMember(groupId, userId, schoolId) { return Api.post(`/chat/group/${groupId}/members`, { user_id: userId, school_id: schoolId }); },
    removeMember(groupId, userId) { return Api.delete(`/chat/group/${groupId}/members/${userId}`); },
    addByRole(groupId, role) { return Api.post(`/chat/group/${groupId}/role`, { role }); },
    inviteByUsername(groupId, username) { return Api.post(`/chat/group/${groupId}/invite`, { username }); },
    invites() { return Api.get("/chat/invites"); },
    respondToInvite(inviteId, action) { return Api.post(`/chat/invites/${inviteId}`, { action }); },
    async uploadProfilePic(groupId, file) {
        const form = new FormData();
        file = await FileCompression.compressImageForUpload(file, { maxDimension: 768, quality: 0.72, maxBytes: 220 * 1024 });
        form.append("file", file);
        return Api.upload(`/chat/groups/${groupId}/profile-pic`, form);
    },
    changeMemberRole(groupId, userId, role) {
        return Api.post(`/chat/${groupId}/role`, { role, user_id: userId });
    },
};
window.GroupsApi = GroupsApi;
