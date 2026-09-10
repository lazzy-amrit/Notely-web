// ------------------------------------------------------------------
// utils/optimistic.js — shared "instant UI, confirm in background"
// helper used by reactions, stars, and photo uploads.
//
// The pattern is always the same: paint the change on screen the
// moment the user taps, fire the real request in the background, and
// only undo the visual change if the request actually fails or gets
// stuck (a slow/dead connection) past a timeout. A normal ~500ms
// round trip never blocks anything — the UI already moved on.
// ------------------------------------------------------------------

const Optimistic = {
    // apply()      — paint the optimistic state. Called synchronously, now.
    // action()     — returns a Promise for the real request.
    // revert()     — undo apply(). Called on hard failure OR on timeout.
    // reconcile(result) — called on a real success, even if it arrives
    //                 late (after a timeout already reverted the UI) so
    //                 the screen can catch up to what actually happened.
    // onError(err) — called once when the change is rolled back, so the
    //                 caller can show a toast. Not called on a late
    //                 success that follows a timeout.
    // timeoutMs    — how long to wait before treating the request as
    //                 failed and rolling the UI back (default 20s).
    run({ apply, action, revert, reconcile, onError, timeoutMs = 20000 } = {}) {
        apply?.();

        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            revert?.();
            onError?.(new Error("timed_out"));
        }, timeoutMs);

        Promise.resolve()
            .then(action)
            .then(result => {
                clearTimeout(timer);
                // Success always gets to reconcile the real server state,
                // whether or not a timeout already rolled the UI back.
                reconcile?.(result);
            })
            .catch(err => {
                clearTimeout(timer);
                if (settled) return; // already rolled back by the timeout
                settled = true;
                revert?.();
                onError?.(err);
            });
    },
};

window.Optimistic = Optimistic;
