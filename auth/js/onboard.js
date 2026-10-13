// ----------------------------------
// First-time Google sign-up onboarding (google-onboard.html).
//
// Flow (replaces the cramped bottom sheet the login page used to show):
//   1. Welcome step — greets the user by their Google name/picture,
//      then reuses the role-card picker from the normal register flow.
//   2. Teachers get one more tiny step (school details — same fields as
//      register.html, skippable). Students go straight in.
//   3. POST /auth/google {credential, role} creates the account, then
//      teacher details are saved with PATCH /auth/profile.
//
// The pending Google credential arrives via Memory ("google_onboard"),
// set by auth/js/google.js right after the backend says needs_role.
// ----------------------------------

(() => {
  const ctx = Memory.get("google_onboard");

  // Deep-linked here without a pending Google credential — nothing to
  // onboard. Send them back to the normal entry point.
  if (!ctx?.credential) {
    window.location.replace("login.html");
    return;
  }

  // -----------------------------
  // Elements
  // -----------------------------

  const stepRole = document.getElementById("stepRole");
  const stepDetails = document.getElementById("stepDetails");

  const welcomeTitle = document.getElementById("welcomeTitle");
  const googlePic = document.getElementById("googlePic");

  const cards = document.querySelectorAll(".card");
  const continueBtn = document.getElementById("continueBtn");

  const backToLogin = document.getElementById("backToLogin");
  const backToRole = document.getElementById("backToRole");

  const skipSchool = document.getElementById("skipSchool");
  const schoolName = document.getElementById("schoolName");
  const subjects = document.getElementById("subjects");
  const schoolPhone = document.getElementById("schoolPhone");
  const coordinator = document.getElementById("coordinator");

  const detailsForm = document.getElementById("detailsForm");
  const finishBtn = document.getElementById("finishBtn");
  const onboardError = document.getElementById("onboardError");

  let selectedRole = null;
  let busy = false;

  // -----------------------------
  // Welcome copy
  // -----------------------------

  const firstName = (ctx.name || "").trim().split(/\s+/)[0];

  welcomeTitle.textContent = firstName ? `Hi, ${firstName} 👋` : "Welcome!";

  if (ctx.picture) {
    googlePic.src = ctx.picture;
    googlePic.addEventListener("load", () => googlePic.classList.remove("hidden"));
    // A failed load just leaves the avatar hidden — the logo above it
    // is enough of a welcome on its own.
  }

  // -----------------------------
  // Step switching
  // -----------------------------

  function showStep(step) {
    stepRole.classList.toggle("hidden", step === "details");
    stepDetails.classList.toggle("hidden", step !== "details");
    // Restart the entrance animation on every switch.
    step.classList.remove("enter");
    void step.offsetWidth;
    step.classList.add("enter");
    window.scrollTo({ top: 0 });
  }

  // -----------------------------
  // Role selection (step 1)
  // -----------------------------

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      cards.forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedRole = card.dataset.role;
      continueBtn.disabled = false;
      continueBtn.classList.add("active");
      if (navigator.vibrate) navigator.vibrate(12);
    });
  });

  continueBtn.addEventListener("click", () => {
    if (!selectedRole || busy) return;

    // Students need nothing else — straight to account creation.
    if (selectedRole === "student") {
      finish(selectedRole, null);
      return;
    }

    showStep(stepDetails);
    validateForm();
  });

  // -----------------------------
  // Teacher details (step 2)
  // -----------------------------

  backToRole.addEventListener("click", () => {
    if (!busy) showStep(stepRole);
  });

  backToLogin.addEventListener("click", () => {
    if (busy) return;
    Memory.remove("google_onboard");
    window.location.href = "login.html";
  });

  function skipped() {
    return skipSchool.checked;
  }

  function validateForm() {
    const detailsRequired =
      selectedRole === "teacher" && !skipped();

    const valid =
      !detailsRequired ||
      (schoolName.value.trim() !== "" &&
        subjects.value.trim() !== "" &&
        schoolPhone.value.trim() !== "");

    finishBtn.disabled = !valid;
    finishBtn.classList.toggle("active", valid);

    // Empty the fields when skipping so nothing stale is sent.
    if (skipped()) {
      [schoolName, subjects, schoolPhone, coordinator].forEach(
        (input) => (input.value = ""),
      );
    }
  }

  skipSchool.addEventListener("change", () => {
    [schoolName, subjects, schoolPhone, coordinator].forEach(
      (input) => (input.disabled = skipped()),
    );
    validateForm();
  });

  [schoolName, subjects, schoolPhone, coordinator].forEach((input) =>
    input.addEventListener("input", validateForm),
  );

  detailsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (finishBtn.disabled || busy) return;

    const details = skipped()
      ? null
      : {
          school_name: schoolName.value.trim(),
          subjects: subjects.value.trim(),
          contact_number: schoolPhone.value.trim(),
          incharge: coordinator.value.trim(),
        };

    finish(selectedRole, details);
  });

  // -----------------------------
  // Create the account
  // -----------------------------

  function setError(msg) {
    onboardError.textContent = msg || "";
  }

  async function finish(role, details) {
    if (busy) return;
    busy = true;
    setError("");

    continueBtn.disabled = true;
    finishBtn.disabled = true;
    finishBtn.textContent = "Setting up…";

    try {
      const response = await fetch(`${CONFIG.API_HOST}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: ctx.credential, role }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {}

      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "Too many attempts. Please wait a moment and try again."
            : (typeof data?.detail === "string" && data.detail) ||
                "We couldn't create your account. Please try again.",
        );
      }

      await Session.setTokens(data);

      // The backend creates an empty teacher profile on signup — fill
      // in whatever the user just told us. Non-fatal: anything that
      // fails here can be added later from Profile.
      if (role === "teacher" && details) {
        try {
          const token = await Session.getToken();
          await fetch(`${CONFIG.API_HOST}/auth/profile`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(details),
          });
        } catch {}
      }

      Memory.remove("google_onboard");
      window.location.href = "../app.html";
    } catch (err) {
      setError(err.message);
      finishBtn.disabled = false;
      finishBtn.classList.add("active");
      finishBtn.textContent = "Finish →";
      continueBtn.disabled = !selectedRole;
      busy = false;
    }
  }
})();
