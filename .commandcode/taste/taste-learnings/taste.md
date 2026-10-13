# Taste learnings
- Backend lives at `~/notely-current-backend` (FastAPI) and is the API source of truth — read it to align frontend work, but NEVER modify anything in it. Confidence: 0.95
- Frontend (`~/Notely-web`) is a vanilla-JS SPA: no framework, no build step, global-script architecture (`window.X = X`), plain `<script>` tags in app.html. Keep changes in that style; `services/theme.js` must stay synchronous before paint (dark-mode flash). Confidence: 0.85
- Deployed to Cloudflare Pages (`notely-edu.pages.dev`) as a PWA. A version bump must propagate everywhere user/tool-visible: About page text, sw.js `CACHE_VERSION`, data-cache version key, JSON-LD `softwareVersion`. Confidence: 0.7
- When the backend removes a feature, fully remove it from the frontend too — delete dead files/code outright rather than keeping dormant code "for later" (chose "Remove entirely" over keeping notification code dormant). Confidence: 0.8
- UI quality bar: must feel smooth and proper on BOTH mobile and PC — cares about touch responsiveness (no double-tap delay, no sticky hover), reduced-motion support, and GPU-friendly animations. Confidence: 0.8
- Cares about SEO: complete meta/OG/Twitter/canonical, sitemap freshness, manifest quality, no crawlable junk files in the web root. Confidence: 0.7
- Prefers polishing the existing design language over visual redesigns (chose "Polish only" for the landing page over a restyle). Confidence: 0.7
- Gives broad, informal directives and delegates judgment on details ("and alot of other things you see") — proactively find and fix related issues beyond the literal ask, and report them. Confidence: 0.7
- Responsive to multiple-choice clarification questions with a recommended option for ambiguous decisions (scope, versioning, removal strategy). Confidence: 0.6
