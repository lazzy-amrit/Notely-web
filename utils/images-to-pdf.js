// ------------------------------------------------------------------
// utils/images-to-pdf.js — convert one or more picked images into a
// single PDF, entirely client-side (no CDN dependency).
//
// The backend's note-upload endpoint only accepts application/pdf
// (Notes/uploading_notes.py rejects anything else), so the "Images"
// field on note creation (spec §30) has to produce a real PDF before
// it's sent — never an image payload pretending to be one.
//
// Approach: draw each image onto a canvas (this also normalizes any
// input format — HEIC-from-picker aside — to a JPEG we can embed
// directly via the PDF /DCTDecode filter, so we don't have to write
// a JPEG encoder ourselves), then hand-assemble a minimal but valid
// multi-page PDF with a real xref table.
// ------------------------------------------------------------------

async function imagesToPdfBlob(files, { jpegQuality = 0.72, maxDimension = 1600 } = {}) {
    if (!files || !files.length) throw new Error("No images provided");

    const pages = [];
    for (const file of files) {
        const bitmap = await loadImage(file);
        const jpeg = await canvasJpegBytes(bitmap, jpegQuality, maxDimension);
        pages.push({ width: jpeg.width, height: jpeg.height, jpegBytes: jpeg.bytes });
    }

    return buildPdf(pages);
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Couldn't read image: ${file.name}`)); };
        img.src = url;
    });
}

function canvasJpegBytes(img, quality, maxDimension) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement("canvas");
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
        canvas.width = Math.max(1, Math.round(srcW * scale));
        canvas.height = Math.max(1, Math.round(srcH * scale));
        const ctx = canvas.getContext("2d");
        // Flatten onto white first — JPEG has no alpha, and a picked PNG
        // with transparency would otherwise composite onto black.
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(blob => {
            if (!blob) { reject(new Error("Image conversion failed")); return; }
            blob.arrayBuffer().then(buf => resolve({ bytes: new Uint8Array(buf), width: canvas.width, height: canvas.height })).catch(reject);
        }, "image/jpeg", quality);
    });
}

// ---- minimal PDF assembly (one image XObject per page) ----

const enc = (str) => new TextEncoder().encode(str);

function buildPdf(pages) {
    // Points per page, scaled down from pixels (72dpi assumption is fine
    // here — this only affects on-screen page size, not image quality).
    const MAX_DIM = 792; // ~11in at 72dpi, keeps pages a normal printable size

    const chunks = [];
    const offsets = [0]; // object 0 is reserved by the PDF spec
    let byteLength = 0;

    const push = (bytes) => { chunks.push(bytes); byteLength += bytes.length; };
    const pushObj = (objNum, bodyBytesList) => {
        offsets[objNum] = byteLength;
        push(enc(`${objNum} 0 obj\n`));
        bodyBytesList.forEach(push);
        push(enc("\nendobj\n"));
    };

    // 1=catalog, 2=pages, then 3 objects per page (page, image, content).
    // This must equal the highest object number actually written below —
    // an extra phantom entry here corrupts the xref table's /Size vs. the
    // real object count, which some strict PDF readers reject outright.
    const objCount = 2 /* catalog + pages */ + pages.length * 3 /* page, image, content */;
    const pageObjNums = pages.map((_, i) => 3 + i * 3);
    const imageObjNums = pages.map((_, i) => 4 + i * 3);
    const contentObjNums = pages.map((_, i) => 5 + i * 3);

    push(enc("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));

    // obj 1: catalog
    pushObj(1, [enc(`<< /Type /Catalog /Pages 2 0 R >>`)]);

    // obj 2: pages
    const kids = pageObjNums.map(n => `${n} 0 R`).join(" ");
    pushObj(2, [enc(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)]);

    pages.forEach((page, i) => {
        const scale = Math.min(1, MAX_DIM / Math.max(page.width, page.height));
        const w = Math.round(page.width * scale);
        const h = Math.round(page.height * scale);
        const pageObj = pageObjNums[i];
        const imgObj = imageObjNums[i];
        const contentObj = contentObjNums[i];

        pushObj(pageObj, [enc(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
            `/Resources << /XObject << /Im0 ${imgObj} 0 R >> >> /Contents ${contentObj} 0 R >>`
        )]);

        pushObj(imgObj, [enc(
            `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\nstream\n`
        ), page.jpegBytes, enc("\nendstream")]);

        const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ`;
        pushObj(contentObj, [enc(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)]);
    });

    const xrefStart = byteLength;
    let xref = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objCount; i++) {
        xref += `${String(offsets[i] || 0).padStart(10, "0")} 00000 n \n`;
    }
    push(enc(xref));
    push(enc(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`));

    return new Blob(chunks, { type: "application/pdf" });
}

window.imagesToPdfBlob = imagesToPdfBlob;
