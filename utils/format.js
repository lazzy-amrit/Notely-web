// ------------------------------------------------------------------
// utils/format.js
// ------------------------------------------------------------------

// Public static assets (profile/school pics) live behind authenticated
// download endpoints on the backend. Note PDFs are NEVER resolved this
// way - they always go through NotesApi.getFile() (see api/notes.js).
function publicAssetUrl(path) {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    const clean = path.startsWith("/") ? path : `/${path}`;
    return `${CONFIG.API_HOST}${clean}`;
}

function initials(name = "") {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Copies text to the clipboard and resolves true/false instead of
// throwing. navigator.clipboard.writeText is unreliable on some
// mobile browsers — it can reject (missing/denied clipboard
// permission, or the API being unavailable outside a strictly-
// synchronous secure context) even though the user genuinely tapped
// a button. The execCommand fallback
// below works everywhere the modern API doesn't, so callers get a
// real copy instead of a caught error and a "couldn't copy" toast.
async function copyToClipboard(text) {
    if (text === null || text === undefined) return false;
    const str = String(text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(str);
            return true;
        } catch (_) { /* fall through to legacy path */ }
    }
    try {
        const ta = document.createElement("textarea");
        ta.value = str;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, str.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch (_) {
        return false;
    }
}

window.publicAssetUrl = publicAssetUrl;
window.initials = initials;
window.copyToClipboard = copyToClipboard;
