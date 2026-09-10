// ------------------------------------------------------------------
// components/empty-state.js
// ------------------------------------------------------------------

function EmptyState({ icon = "inbox", title, subtitle, actionLabel, onAction }) {
    const wrap = h("div", { className: "empty-state" }, [
        h("span", { className: "material-symbols-rounded empty-icon" }, icon),
        h("h3", {}, title),
        subtitle ? h("p", {}, subtitle) : null,
        actionLabel ? h("button", { className: "btn btn-primary btn-sm", onClick: onAction }, actionLabel) : null,
    ]);
    return wrap;
}

window.EmptyState = EmptyState;
