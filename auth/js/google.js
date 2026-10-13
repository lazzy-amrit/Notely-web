// ----------------------------------
// Google One Tap + "Sign in with Google" button  ->  POST /auth/google
//
// Existing Google users land straight in the app. First-time users get
// needs_role from the backend — the credential is handed to
// google-onboard.html (a proper welcome + role + teacher-details
// screen) instead of an inline sheet.
// ----------------------------------

(() => {
  const googleError = document.getElementById("googleError");

  let busy = false;

  function setError(msg) {
    googleError.textContent = msg || "";
  }

  async function sendToBackend(credential, role) {
    const response = await fetch(`${CONFIG.API_HOST}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential, role: role || null }),
    });

    let data = null;
    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(
          "Too many attempts. Please wait a moment and try again.",
        );
      }
      throw new Error(
        (typeof data?.detail === "string" && data.detail) ||
          "Google sign-in failed. Please try again.",
      );
    }

    return data;
  }

  async function handleCredential(credential) {
    if (busy) return;
    busy = true;
    setError("");

    try {
      const data = await sendToBackend(credential, null);

      // First-time Google user: hand off to the onboarding screen
      // (welcome -> role -> optional school details).
      if (data.needs_role) {
        Memory.set("google_onboard", {
          credential,
          name: data.name || "",
          picture: data.picture || "",
        });
        window.location.href = "google-onboard.html";
        return;
      }

      await Session.setTokens(data);
      window.location.href = "../app.html";
    } catch (err) {
      setError(err.message);
    } finally {
      busy = false;
    }
  }

  // Google calls this with { credential } after One Tap / button click
  function onGoogleResponse(res) {
    if (!res?.credential) return;
    handleCredential(res.credential);
  }

  function initGoogle() {
    if (!window.google?.accounts?.id) return false;

    google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: onGoogleResponse,
      auto_select: false,
      cancel_on_tap_outside: false,
      use_fedcm_for_prompt: true,
    });

    const holder = document.getElementById("googleBtn");

    google.accounts.id.renderButton(holder, {
      type: "standard",
      theme:
        document.documentElement.dataset.theme === "dark"
          ? "filled_black"
          : "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
      logo_alignment: "left",
      width: Math.min(holder.clientWidth || 320, 400),
    });

    // One Tap popup
    google.accounts.id.prompt();

    return true;
  }

  // The GIS script is loaded async — wait for it.
  let tries = 0;
  const timer = setInterval(() => {
    if (initGoogle() || ++tries > 50) {
      clearInterval(timer);
      if (tries > 50) setError("Google sign-in is unavailable right now.");
    }
  }, 100);
})();
