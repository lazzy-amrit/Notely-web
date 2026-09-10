const AVATAR_COLORS = ["#7B61FF", "#3EA6FF", "#34C759", "#FF9F0A", "#FF6482", "#5AC8FA"];
function colorFor(name = "") { let sum = 0; for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i); return AVATAR_COLORS[sum % AVATAR_COLORS.length]; }

function avatarStorageId(pic) {
    if (pic == null) return null;
    if (typeof pic === "object") return pic.storage_id ?? pic.storageId ?? pic.profile_storage_id ?? null;
    const n = Number(pic);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function Avatar(name, picUrl, size = "md", extraClass = "") {
    const wrap = h("div", { className: `avatar avatar-${size} ${extraClass}`.trim() });
    const storageId = avatarStorageId(picUrl);

    if (storageId && window.StorageService) {
        // Keep Avatar synchronous so existing callers/UI remain unchanged;
        // hydrate the protected image asynchronously from the unified stream.
        const img = h("img", { alt: name || "avatar", loading: "lazy" });
        wrap.appendChild(img);
        StorageService.getObjectUrl(storageId, "profile-pic").then(src => {
            if (!src || !img.isConnected) return;
            img.src = src;
        }).catch(() => {
            img.remove(); wrap.style.background = colorFor(name); wrap.appendChild(h("span", {}, initials(name)));
        });
        return wrap;
    }

    if (picUrl) {
        const asset = publicAssetUrl(picUrl);
        const cacheKey = encodeURIComponent(String(picUrl));
        const src = `${asset}${asset.includes("?") ? "&" : "?"}v=${Date.now()}-${cacheKey}`;
        const img = h("img", { src, alt: name || "avatar", loading: "lazy" });
        img.addEventListener("error", () => { img.remove(); wrap.style.background = colorFor(name); wrap.appendChild(h("span", {}, initials(name))); });
        wrap.appendChild(img);
    } else { wrap.style.background = colorFor(name); wrap.appendChild(h("span", {}, initials(name))); }
    return wrap;
}
window.Avatar = Avatar;
