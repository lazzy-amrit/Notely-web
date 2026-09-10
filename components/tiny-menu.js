// ------------------------------------------------------------------
// components/tiny-menu.js — the small "hold an item" card.
//
// Holding a subject (or any row that opts in) shows a tiny two-option
// card right next to the row — Edit / Delete — instead of a full bottom
// sheet. It closes on any outside tap, on scroll, or on Escape.
//
// TinyMenu.open(anchorEl, event, [{ icon, label, danger, onSelect }])
// ------------------------------------------------------------------

const TinyMenu = {
    _menu: null,
    _backdrop: null,

    close() {
        this._menu?.remove();
        this._backdrop?.remove();
        this._menu = null;
        this._backdrop = null;
        window.removeEventListener("scroll", TinyMenu._onScroll, true);
        document.removeEventListener("keydown", TinyMenu._onKey, true);
    },

    _onScroll() { TinyMenu.close(); },
    _onKey(e) { if (e.key === "Escape") TinyMenu.close(); },

    open(anchor, event, items = []) {
        this.close();

        const backdrop = h("div", { className: "tiny-menu-backdrop" });
        backdrop.addEventListener("pointerdown", (e) => { e.preventDefault(); TinyMenu.close(); });

        const menu = h("div", { className: "tiny-menu", role: "menu" }, items.map(item => h("button", {
            className: `tiny-menu-item${item.danger ? " danger" : ""}`, type: "button", role: "menuitem",
            onClick: () => { TinyMenu.close(); item.onSelect?.(); },
        }, [
            item.icon ? h("span", { className: "material-symbols-rounded" }, item.icon) : null,
            h("span", {}, item.label),
        ].filter(Boolean))));

        document.body.appendChild(backdrop);
        document.body.appendChild(menu);

        // Position next to the pointer when we have one, otherwise next to
        // the row itself — then clamp so it never leaves the screen.
        const rect = anchor?.getBoundingClientRect?.() || { left: 16, top: 80, width: 200, height: 40, bottom: 120 };
        const box = menu.getBoundingClientRect();
        const pad = 10;
        let x = (event && Number.isFinite(event.clientX) && event.clientX > 0) ? event.clientX : rect.left + 24;
        let y = (event && Number.isFinite(event.clientY) && event.clientY > 0) ? event.clientY : rect.bottom;
        x = Math.min(Math.max(pad, x), window.innerWidth - box.width - pad);
        y = Math.min(Math.max(pad, y), window.innerHeight - box.height - pad);
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        window.addEventListener("scroll", TinyMenu._onScroll, true);
        document.addEventListener("keydown", TinyMenu._onKey, true);
        return menu;
    },
};

window.TinyMenu = TinyMenu;
