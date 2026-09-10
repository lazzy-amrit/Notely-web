// Client-side upload compression. Keep files small enough for the app's actual
// display needs instead of uploading full camera originals.

function _compressionExtension(name, fallback = "jpg") {
    const m = String(name || "").match(/\.([a-z0-9]+)$/i);
    return (m && m[1].toLowerCase()) || fallback;
}

function _loadImageForCompression(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Couldn't read image: ${file.name || "image"}`)); };
        img.src = url;
    });
}

function _canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image compression failed")), type, quality);
    });
}

/**
 * Compress an image for upload. The output is JPEG because all current
 * backend image upload endpoints accept jpeg/png/webp and JPEG is much
 * smaller for camera/profile photographs. Transparent images are flattened
 * onto white intentionally; these are profile/school/group photos, not UI
 * assets where alpha is meaningful.
 */
async function compressImageForUpload(file, {
    maxDimension = 1280,
    quality = 0.72,
    maxBytes = 300 * 1024,
} = {}) {
    if (!file || !String(file.type || "").startsWith("image/")) return file;

    const img = await _loadImageForCompression(file);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // Start with a quality that is already small, then lower it only when
    // necessary. We never upscale a small source image.
    let q = quality;
    let blob = await _canvasBlob(canvas, "image/jpeg", q);
    for (let i = 0; i < 5 && blob.size > maxBytes && q > 0.48; i++) {
        q -= 0.06;
        blob = await _canvasBlob(canvas, "image/jpeg", q);
    }

    // Compression must never make an already-small image larger.
    if (blob.size >= file.size && file.size <= maxBytes) return file;

    const base = String(file.name || "photo").replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

// The note pipeline already converts picked images into a compact image-only
// PDF. For an existing PDF we deliberately leave it untouched: re-rendering
// arbitrary PDFs in the browser would rasterize vector text and can make it
// blurry. This function is the single gate used by upload code so a future
// lossless PDF optimizer can be added without changing API callers.
async function preparePdfForUpload(file) {
    if (!file || file.type !== "application/pdf") return file;
    return file;
}

window.FileCompression = {
    compressImageForUpload,
    preparePdfForUpload,
};
