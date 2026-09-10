// ------------------------------------------------------------------
// utils/pdf-viewer.js — full-screen in-app PDF viewer.
// ------------------------------------------------------------------
// Replaces the old black-card iframe viewer. Renders with PDF.js onto
// <canvas> pages inside a full-screen sheet (Sheet kind: "fullscreen").
//
// Why not <iframe>/<embed> with the raw blob URL (the old approach)?
// Inline PDF rendering in-browser is not reliable across all mobile
// browsers/WebViews — an <iframe src="blob:..."> can just show a
// blank/black frame. PDF.js draws pages to <canvas> itself, so it
// doesn't depend on any native/browser PDF support at all.
//
// This module never fetches a PDF itself and never receives a raw
// server URL — callers (see NotesPage._openNote) pass an already
// authorized Blob from NotesApi.getFile(), so the existing membership
// check on that endpoint is preserved and a PDF is never reachable
// from a bare URL.
// ------------------------------------------------------------------

const PdfViewer = {
    _PDFJS_VERSION: "3.11.174",
    _workerReady: false,

    _ensureWorker() {
        if (this._workerReady || !window.pdfjsLib) return;
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            `https://cdn.jsdelivr.net/npm/pdfjs-dist@${this._PDFJS_VERSION}/legacy/build/pdf.worker.min.js`;
        this._workerReady = true;
    },

    // blob: PDF Blob (already fetched + auth-checked by the caller).
    // meta: { name, storageId } — storageId is optional but lets us evict
    // a corrupted cached blob from StorageService on InvalidPDFException.
    async open(blob, meta = {}) {
        this._ensureWorker();
        const name = meta.name || "Document";

        const backBtn = h("button", { className: "pdfv-icon-btn", type: "button", title: "Back" },
            [h("span", { className: "material-symbols-rounded" }, "arrow_back")]);
        const titleEl = h("div", { className: "pdfv-title" }, name);
        const downloadBtn = h("button", { className: "pdfv-icon-btn", type: "button", title: "Download" },
            [h("span", { className: "material-symbols-rounded" }, "download")]);
        const header = h("div", { className: "pdfv-header" }, [backBtn, titleEl, downloadBtn]);

        const pagesWrap = h("div", { className: "pdfv-pages" });
        const bodyEl = h("div", { className: "pdfv-body" }, [pagesWrap]);
        const stateEl = h("div", { className: "pdfv-state" }, [
            h("div", { className: "spinner" }),
            h("p", {}, "Loading PDF…"),
        ]);

        const panel = h("div", { className: "pdfv-panel" }, [header, bodyEl, stateEl]);

        let closed = false;
        Sheet.open(panel, {
            kind: "fullscreen", dismissible: false,
            onClose: () => { closed = true; },
        });

        backBtn.addEventListener("click", () => Sheet.close());

        // Tapping the document (not a header button) toggles the header,
        // like any normal mobile document reader, so the page gets the
        // full screen back.
        bodyEl.addEventListener("click", (e) => {
            if (e.target.closest(".pdfv-icon-btn")) return;
            panel.classList.toggle("pdfv-header-hidden");
        });

        const safeName = `${name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "note"}.pdf`;
        downloadBtn.addEventListener("click", () => {
            // Reuses the same download flow as before: an object URL +
            // a temporary <a download>. The blob is already the private,
            // membership-checked file — nothing here makes it public.
            const url = URL.createObjectURL(blob);
            const a = h("a", { href: url, download: safeName, style: "display:none" });
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        });

        const showError = (message) => {
            clear(stateEl);
            mount(stateEl,
                h("span", { className: "material-symbols-rounded pdfv-state-icon" }, "error_outline"),
                h("p", {}, message));
        };

        if (!window.pdfjsLib) {
            showError("The PDF viewer couldn't load. Check your connection and try again.");
            return;
        }

        let doc;
        try {
            const buf = await blob.arrayBuffer();
            if (closed) return;
            doc = await pdfjsLib.getDocument({ data: buf }).promise;
        } catch (err) {
            // Log the real cause — the old code swallowed this entirely,
            // so every failure (bad worker load, corrupt bytes, password-
            // protected file, truncated download) looked identical from
            // the outside and was impossible to diagnose from a report.
            console.error("PdfViewer: getDocument failed", err);
            if (closed) return;
            switch (err?.name) {
                case "PasswordException":
                    showError("This PDF is password-protected and can't be opened here.");
                    break;
                case "InvalidPDFException":
                case "MissingPDFException":
                    // The bytes we have aren't a valid PDF — most likely a
                    // corrupted/incomplete download. Evict it from the local
                    // cache so the next open re-fetches from the server
                    // instead of retrying the same bad bytes forever.
                    StorageService?.clear?.(meta.storageId);
                    showError("This file is corrupted and couldn't be opened. Try reopening it.");
                    break;
                default:
                    showError("This PDF couldn't be opened. Check your connection and try again.");
            }
            return;
        }
        if (closed) return;
        stateEl.remove();

        // Placeholders are sized off the first page's aspect ratio so the
        // scroll area doesn't jump around as canvases fill in, and so
        // IntersectionObserver has real geometry to work with before any
        // page has actually rendered.
        let baseAspect = 1.414; // sensible fallback (A4-ish) if getPage(1) fails
        try {
            const first = await doc.getPage(1);
            const vp1 = first.getViewport({ scale: 1 });
            baseAspect = vp1.height / vp1.width;
        } catch (_) { /* fall back to the default aspect above */ }

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rendered = new Set();

        const renderPage = async (num, wrap) => {
            if (rendered.has(num) || closed) return;
            rendered.add(num);
            try {
                const page = await doc.getPage(num);
                if (closed) return;
                const width = wrap.clientWidth || pagesWrap.clientWidth || 360;
                const unscaled = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: (width / unscaled.width) * dpr });
                const canvas = document.createElement("canvas");
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                canvas.className = "pdfv-canvas";
                wrap.appendChild(canvas);
                await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
                wrap.classList.add("pdfv-page-ready");
            } catch (_) {
                rendered.delete(num);
            }
        };

        const pageEls = [];
        for (let i = 1; i <= doc.numPages; i++) {
            const wrap = h("div", { className: "pdfv-page", dataset: { page: String(i) } });
            wrap.style.aspectRatio = `1 / ${baseAspect}`;
            pagesWrap.appendChild(wrap);
            pageEls.push(wrap);
        }

        if ("IntersectionObserver" in window) {
            const io = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) renderPage(Number(entry.target.dataset.page), entry.target);
                });
            }, { root: bodyEl, rootMargin: "600px 0px" });
            pageEls.forEach(el => io.observe(el));
        } else {
            // No IntersectionObserver (very old WebView) — render
            // everything up front rather than showing nothing.
            pageEls.forEach(el => renderPage(Number(el.dataset.page), el));
        }

        // Basic pinch-to-zoom: two fingers scale the whole page stack via
        // a CSS transform; one finger keeps scrolling normally. Deliberately
        // simple — no rotation, no momentum, clamped 1x–3x.
        let pinch = null, scale = 1;
        bodyEl.addEventListener("touchstart", (e) => {
            if (e.touches.length === 2) {
                const [a, b] = e.touches;
                pinch = { startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), startScale: scale };
            }
        }, { passive: true });
        bodyEl.addEventListener("touchmove", (e) => {
            if (!pinch || e.touches.length !== 2) return;
            const [a, b] = e.touches;
            const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            scale = Math.min(3, Math.max(1, pinch.startScale * (dist / pinch.startDist)));
            pagesWrap.style.transform = `scale(${scale})`;
            pagesWrap.classList.toggle("pdfv-zoomed", scale > 1.02);
        }, { passive: true });
        const endPinch = (e) => { if (e.touches.length < 2) pinch = null; };
        bodyEl.addEventListener("touchend", endPinch);
        bodyEl.addEventListener("touchcancel", endPinch);
    },
};

window.PdfViewer = PdfViewer;
