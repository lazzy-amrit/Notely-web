// ------------------------------------------------------------------
// services/theme.js — Light / Dark / System theme control
// ------------------------------------------------------------------
// Deliberately self-contained and dependency-free: the auth pages load
// it before anything else (they don't have CONFIG/Session/toast at that
// point), and the app shell loads the exact same file. There is only
// ONE storage key and ONE place that decides what "system" resolves to.
//
//   Theme.get()          -> "light" | "dark" | "system"  (the preference)
//   Theme.resolved()     -> "light" | "dark"             (what's painted)
//   Theme.set(pref)      -> persists + applies immediately
//   Theme.onChange(fn)   -> notified whenever the painted theme changes
//
// Applied by setting data-theme="light|dark" on <html>, which every
// stylesheet keys its dark overrides off. `color-scheme` is set too so
// native widgets (scrollbars, date pickers, the on-screen keyboard on
// Android) follow along instead of staying stark white.
// ------------------------------------------------------------------

(function () {
    var STORAGE_KEY = "notely_theme";
    var VALID = ["light", "dark", "system"];

    var listeners = [];
    var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    function readPref() {
        try {
            var stored = localStorage.getItem(STORAGE_KEY);
            return VALID.indexOf(stored) !== -1 ? stored : "system";
        } catch (e) {
            return "system"; // storage blocked — behave like a fresh install
        }
    }

    function resolve(pref) {
        if (pref === "light" || pref === "dark") return pref;
        return media && media.matches ? "dark" : "light";
    }

    function apply(pref) {
        var mode = resolve(pref);
        var root = document.documentElement;
        root.setAttribute("data-theme", mode);
        root.style.colorScheme = mode;
        return mode;
    }

    var Theme = {
        STORAGE_KEY: STORAGE_KEY,

        get: readPref,

        resolved: function () {
            return resolve(readPref());
        },

        set: function (pref) {
            if (VALID.indexOf(pref) === -1) return;
            try { localStorage.setItem(STORAGE_KEY, pref); } catch (e) { /* still applies for this session */ }
            var mode = apply(pref);
            listeners.forEach(function (fn) { try { fn(mode, pref); } catch (e) {} });
        },

        onChange: function (fn) {
            if (typeof fn === "function") listeners.push(fn);
        },

        // Called once, as early as possible, to avoid a light flash on a
        // dark-theme launch.
        init: function () {
            apply(readPref());
            if (media) {
                var onSystemChange = function () {
                    if (readPref() !== "system") return;
                    var mode = apply("system");
                    listeners.forEach(function (fn) { try { fn(mode, "system"); } catch (e) {} });
                };
                if (media.addEventListener) media.addEventListener("change", onSystemChange);
                else if (media.addListener) media.addListener(onSystemChange);
            }
        },
    };

    window.Theme = Theme;
    Theme.init();
})();
