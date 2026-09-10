// ------------------------------------------------------------------
// services/toast.js — small dismissible snackbar, never blocks the UI
// ------------------------------------------------------------------

const Toast = {
    _container: null,

    _ensureContainer() {
        if (this._container) return this._container;
        const el = document.createElement("div");
        el.className = "toast-stack";
        document.body.appendChild(el);
        this._container = el;
        return el;
    },

    show(message, { type = "default", duration = 3200 } = {}) {
        const container = this._ensureContainer();
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add("toast-in"));

        const remove = () => {
            toast.classList.remove("toast-in");
            toast.addEventListener("transitionend", () => toast.remove(), { once: true });
        };

        const timer = setTimeout(remove, duration);
        toast.addEventListener("click", () => {
            clearTimeout(timer);
            remove();
        });
    },

    success(message) { this.show(message, { type: "success" }); },
    error(message) { this.show(message, { type: "error" }); },
    // Friendly rate-limit specific helper used across create/join/upload flows.
    fromApiError(err) {
        this.show(err?.message || "Something went wrong. Please try again.", { type: "error" });
    },
};

window.Toast = Toast;
