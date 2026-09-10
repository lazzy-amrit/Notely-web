// ------------------------------------------------------------------
// utils/dom.js — tiny helpers so pages/components don't repeat
// document.createElement boilerplate everywhere.
// ------------------------------------------------------------------

// h("div", {className:"card", onclick:fn}, [child1, "text", child2])
function h(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
        if (value === undefined || value === null || value === false) continue;
        if (key === "className") el.className = value;
        else if (key.startsWith("on") && typeof value === "function") {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === "dataset") {
            Object.entries(value).forEach(([k, v]) => (el.dataset[k] = v));
        } else if (key === "html") {
            el.innerHTML = value;
        } else {
            el.setAttribute(key, value);
        }
    }
    // Children may be nodes, strings, numbers or nested arrays. Anything
    // that isn't a real Node (numbers were crashing appendChild with
    // "parameter 1 is not of type 'Node'") is coerced to a text node.
    const append = child => {
        if (child === undefined || child === null || child === false || child === true) return;
        if (Array.isArray(child)) { child.forEach(append); return; }
        if (child instanceof Node) { el.appendChild(child); return; }
        el.appendChild(document.createTextNode(String(child)));
    };
    (Array.isArray(children) ? children : [children]).forEach(append);
    return el;
}

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function mount(root, ...children) {
    clear(root);
    children.forEach(c => c && root.appendChild(c));
}

// Escapes text that's being inserted as HTML via template strings
// elsewhere (most of the app uses h() above, which is already safe).
function escapeHtml(str = "") {
    return str.replace(/[&<>"']/g, m => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[m]));
}

window.h = h;
window.qs = qs;
window.qsa = qsa;
window.clear = clear;
window.mount = mount;
window.escapeHtml = escapeHtml;
