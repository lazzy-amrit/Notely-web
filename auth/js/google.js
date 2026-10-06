// ----------------------------------
// Google One Tap + "Sign in with Google" button  ->  POST /auth/google
// ----------------------------------

(() => {
  const googleError = document.getElementById("googleError");
  const sheet = document.getElementById("googleRoleSheet");
  const sheetText = document.getElementById("googleRoleText");
  const roleButtons = sheet.querySelectorAll("[data-role]");
  const cancelBtn = document.getElementById("googleRoleCancel");

  let pendingCredential = null;
  let busy = false;

  function setError(msg) {
    googleError.textContent = msg || "";
  }

  function showSheet(name) {
    sheetText.textContent = name
      ? `Welcome, ${name}! Choose how you'll use Notely.`
      : "Choose how you'll use Notely.";
    sheet.classList.add("show");
    sheet.setAttribute("aria-hidden", "false");
  }

  function hideSheet() {
    sheet.classList.remove("show");
    sheet.setAttribute("aria-hidden", "true");
    roleButtons.forEach((b) => (b.disabled = false));
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

  async function handleCredential(credential, role) {
    if (busy) return;
    busy = true;
    setError("");

    try {
      const data = await sendToBackend(credential, role);

      // First-time Google user: ask for a role, then resend.
      if (data.needs_role) {
        pendingCredential = credential;
        showSheet((data.name || "").split(" ")[0]);
        return;
      }

      hideSheet();

      await Session.setTokens(data);
      window.location.href = "../app.html";
    } catch (err) {
      hideSheet();
      setError(err.message);
    } finally {
      busy = false;
    }
  }

  // Google calls this with { credential } after One Tap / button click
  function onGoogleResponse(res) {
    if (!res?.credential) return;
    handleCredential(res.credential, null);
  }

  roleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!pendingCredential) return;
      roleButtons.forEach((b) => (b.disabled = true));
      handleCredential(pendingCredential, btn.dataset.role);
    });
  });

  cancelBtn.addEventListener("click", () => {
    pendingCredential = null;
    hideSheet();
  });

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
