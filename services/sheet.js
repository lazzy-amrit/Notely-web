// ------------------------------------------------------------------
// services/sheet.js — bottom sheet + centered modal primitive
// ------------------------------------------------------------------
// Almost every "creation flow" and "quick action" in the spec (profile
// preview, delete confirmation, accept/decline, member actions, small
// forms) is one of these two shapes. Everything else builds on top of
// this rather than inventing its own overlay.
// ------------------------------------------------------------------

const Sheet = {
    // Stack of { overlay, onClose } entries, most-recently-opened last.
    // Sheet used to be a singleton (open() force-closed whatever was
    // already open), which silently destroyed the note-creation card
    // whenever a nested sheet — e.g. the full-screen PDF viewer, or the
    // tap-a-thumbnail photo preview — opened on top of it. Every other
    // call site in the app already does an explicit `Sheet.close()`
    // right before opening its replacement when it *wants* a replace,
    // so switching close() to only pop the top entry doesn't change
    // behavior anywhere except the nested-without-close cases, which
    // is exactly the bug this fixes.
    _stack: [],
    get _overlay() { return this._stack.length ? this._stack[this._stack.length - 1].overlay : null; },

    // contentEl: an already-built DOM node.
    // opts.kind: "sheet" (slides from bottom, default), "modal" (centered
    // card), or "fullscreen" (edge-to-edge — used by the in-app PDF
    // viewer, which needs the whole viewport rather than a card).
    open(contentEl, { kind = "sheet", dismissible = true, onClose } = {}) {
        // Hide (don't destroy) whatever sheet is already open, so it can
        // be restored when this new one closes.
        const top = this._stack[this._stack.length - 1];
        if (top) top.overlay.style.display = "none";

        const overlay = document.createElement("div");
        overlay.className = kind === "fullscreen" ? "overlay overlay-fullscreen" : "overlay";

        const panel = document.createElement("div");
        panel.className = kind === "modal" ? "modal-panel" : kind === "fullscreen" ? "fullscreen-panel" : "sheet-panel";
        panel.appendChild(contentEl);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        document.body.classList.add("no-scroll");

        requestAnimationFrame(() => overlay.classList.add("overlay-in"));

        if (dismissible) {
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) this.close();
            });
        }

        this._stack.push({ overlay, onClose });
        return overlay;
    },

    // Closes only the topmost sheet. If another sheet was open beneath
    // it, that one reappears instead of being lost.
    close() {
        const entry = this._stack.pop();
        if (!entry) return;
        const { overlay, onClose } = entry;
        overlay.classList.remove("overlay-in");
        overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
        setTimeout(() => overlay.remove(), 300); // fallback if transitionend doesn't fire

        const top = this._stack[this._stack.length - 1];
        if (top) {
            top.overlay.style.display = "";
        } else {
            document.body.classList.remove("no-scroll");
        }
        if (onClose) onClose();
    },
};

window.Sheet = Sheet;