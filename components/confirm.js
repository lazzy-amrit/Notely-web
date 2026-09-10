// ------------------------------------------------------------------
// components/confirm.js — the ONE confirmation dialog used for every
// destructive action (leave, delete, remove member, etc). Delete
// Account uses its own richer multi-step flow (see pages/profile) but
// reuses this same visual language.
// ------------------------------------------------------------------

function confirmAction({
    title,
    message,
    confirmLabel = "Confirm",
    danger = true,
    onConfirm,
}) {
    const body = h("div", { className: "confirm-dialog" }, [
        h("h3", {}, title),
        h("p", {}, message),
        h("div", { className: "confirm-actions" }, [
            h("button", {
                className: "btn btn-ghost",
                onClick: () => Sheet.close(),
            }, "Cancel"),
            h("button", {
                className: danger ? "btn btn-danger" : "btn btn-primary",
                onClick: async (e) => {
                    e.target.disabled = true;
                    e.target.textContent = "Please wait...";
                    try {
                        await onConfirm();
                        Sheet.close();
                    } catch (err) {
                        Toast.fromApiError(err);
                        e.target.disabled = false;
                        e.target.textContent = confirmLabel;
                    }
                },
            }, confirmLabel),
        ]),
    ]);

    Sheet.open(body, { kind: "modal" });
}

window.confirmAction = confirmAction;
