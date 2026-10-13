// ------------------------------------------------------------------
// pages/messages/dm-search.js — route: messages/new-dm
// ------------------------------------------------------------------
// GET /users/search?username= is implemented on the backend
// (Account/user_search.py, registered in main.py) and returns exactly
// the shape this page expects: [{id, username, name, profile_pic}].
// Verified directly against the backend source for this pass — an
// earlier note here assumed it was missing; it isn't.
// ------------------------------------------------------------------

const DmSearchPage = {
    async render(container) {
        const header = h("div", { className: "app-header" }, [
            h("button", { className: "back-btn", onClick: () => Router.goBack("messages") }, [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("h1", {}, "New message"),
        ]);

        const input = h("input", { placeholder: "Search by username", autofocus: "true" });
        const searchBar = h("div", { className: "search-bar" }, [
            h("span", { className: "material-symbols-rounded" }, "search"),
            input,
        ]);

        const resultsWrap = h("div", { id: "dm-search-results" });

        mount(container, header, searchBar, resultsWrap);
        input.focus();

        let debounce;
        input.addEventListener("input", () => {
            clearTimeout(debounce);
            const value = input.value.trim();
            if (value.length < 2) {
                mount(resultsWrap);
                return;
            }
            mount(resultsWrap, h("div", { className: "spinner", style: "margin:24px auto" }));
            debounce = setTimeout(() => this._search(value, resultsWrap), 400);
        });
    },

    async _search(query, resultsWrap) {
        try {
            const results = await Api.get(`/users/search?username=${encodeURIComponent(query)}`);
            if (!results || results.length === 0) {
                mount(resultsWrap, EmptyState({ icon: "person_search", title: "No users found" }));
                return;
            }
            results.forEach(u => EntityCache.rememberUser(u));
            mount(resultsWrap, h("div", { className: "card" }, results.map(u => h("div", {
                className: "card-row", onClick: () => { EntityCache.rememberUser(u); Router.go(`messages/dm/${u.id}`); },
            }, [
                Avatar(u.name || u.username, u.profile_pic, "sm"),
                h("div", { className: "card-row-text" }, [
                    h("div", { className: "card-row-title" }, u.name || u.username),
                    h("div", { className: "card-row-sub" }, `@${u.username}`),
                ]),
            ]))));
        } catch (err) {
            if (err.status === 429) { Toast.fromApiError(err); return; }
            mount(resultsWrap, EmptyState({
                icon: "error_outline",
                title: "Couldn't search right now",
                subtitle: "Please try again in a moment.",
            }));
        }
    },
};

window.DmSearchPage = DmSearchPage;
