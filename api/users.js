const UsersApi = {
    search(query) { return Api.get(`/users/search?username=${encodeURIComponent(query)}`); },
    get(userId) { return Api.get(`/users/${userId}`); },
};
window.UsersApi = UsersApi;
