// ------------------------------------------------------------------
// utils/format.js
// ------------------------------------------------------------------

// Safely turns whatever the backend sent (ISO string with/without a
// trailing "Z", a bare "YYYY-MM-DD HH:MM:SS" string, a unix timestamp
// number, a Date instance, null/undefined/"") into a valid Date or
// null. NEVER throws, NEVER returns an Invalid Date - every caller in
// this file checks for null instead of relying on isNaN downstream.
function safeParseDate(input) {
    if (input === null || input === undefined || input === "") return null;

    let date;
    if (input instanceof Date) {
        date = input;
    } else if (typeof input === "number") {
        // Backends sometimes send unix seconds instead of ms.
        date = new Date(input < 1e12 ? input * 1000 : input);
    } else if (typeof input === "string") {
        const str = input.trim();
        if (!str) return null;
        // Bare "YYYY-MM-DD HH:MM:SS" (no timezone, no "T") is treated as
        // UTC, matching what the backend actually stores; a string that
        // already carries a timezone (Z, +HH:MM) is left alone.
        const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(str);
        const normalized = str.includes("T") ? str : str.replace(" ", "T");
        date = new Date(hasZone ? normalized : `${normalized}Z`);
    } else {
        return null;
    }

    return isNaN(date.getTime()) ? null : date;
}

function timeAgo(dateStr) {
    const date = safeParseDate(dateStr);
    if (!date) return "";
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function messageTime(dateStr) {
    const date = safeParseDate(dateStr);
    if (!date) return "";
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

// Chat-list / conversation-row style timestamp: "Just now", "2m",
// a time for today, "Yesterday", a weekday name, or a compact date for
// anything older than a week - never "Invalid Date". Used by the DM
// inbox row (pages/messages/messages.js) against last_message_at from
// GET /chat/dms - kept here as the ONE place any list timestamp
// should call into, per the "one centralized formatter" requirement.
function conversationTime(dateStr) {
    const date = safeParseDate(dateStr);
    if (!date) return "";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m`;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayDiff = Math.round((startOfToday - startOfDate) / 86400000);
    if (dayDiff === 0) return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    if (dayDiff === 1) return "Yesterday";
    if (dayDiff > 1 && dayDiff < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Public static assets (profile/school/group pics) live under /Uploads
// on the backend. Note PDFs are NEVER resolved this way - they always
// go through NotesApi.getFile() (see api/notes.js).
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

window.copyToClipboard = copyToClipboard;
window.safeParseDate = safeParseDate;
window.timeAgo = timeAgo;
window.messageTime = messageTime;
window.conversationTime = conversationTime;
window.publicAssetUrl = publicAssetUrl;
window.initials = initials;
