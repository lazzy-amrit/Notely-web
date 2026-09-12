// ----------------------------------
// Already logged in? Skip straight to the app.
// ----------------------------------

(async () => {
    if (typeof Session !== "undefined" && await Session.isLoggedIn()) {
        window.location.href = "../app.html";
    }
})();

// ----------------------------------
// Elements
// ----------------------------------

const username = document.getElementById("username");
const password = document.getElementById("password");

const loginBtn = document.getElementById("loginBtn");

const loginForm = document.getElementById("loginForm");

const loginError = document.getElementById("loginError");

const togglePassword = document.getElementById("togglePassword");
const eyeIcon = document.getElementById("eyeIcon");

const createAccountBtn = document.getElementById("createAccountBtn");
const quickRegisterBtn = document.getElementById("quickRegisterBtn");

const forgotBtn = document.getElementById("forgotBtn");

const registerSuggestion =
    document.getElementById("registerSuggestion");

const authNotice = document.getElementById("authNotice");

// ----------------------------------
// Password Toggle
// ----------------------------------

togglePassword.addEventListener("click", () => {

    if (password.type === "password") {

        password.type = "text";

        eyeIcon.textContent = "visibility_off";

    } else {

        password.type = "password";

        eyeIcon.textContent = "visibility";

    }

});

// ----------------------------------
// Validation
// ----------------------------------

function validateForm() {

    const valid =

        username.value.trim() !== "" &&
        password.value.trim() !== "";

    loginBtn.disabled = !valid;

    loginBtn.classList.toggle(
        "active",
        valid
    );

}

username.addEventListener("input", validateForm);
password.addEventListener("input", validateForm);

// ----------------------------------
// Register
// ----------------------------------

createAccountBtn.addEventListener("click", () => {

    window.location.href = "role.html";

});

if (quickRegisterBtn) {

    quickRegisterBtn.addEventListener("click", () => {

        window.location.href = "role.html";

    });

}

// ----------------------------------
// Forgot Password
// ----------------------------------

forgotBtn.addEventListener("click", () => {

    window.location.href = "password.html";

});

// ----------------------------------
// Login
// ----------------------------------

loginForm.addEventListener("submit", async e => {

    e.preventDefault();

    if (loginBtn.disabled) return;

    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in...";

    loginError.textContent = "";

    registerSuggestion.style.display = "none";

    const body = new URLSearchParams();

    body.append(
        "username",
        username.value.trim()
    );

    body.append(
        "password",
        password.value
    );

    try {

        const response = await fetch(
            `${CONFIG.API_HOST}/auth/login`,
            {

                method: "POST",

                headers: {

                    "Content-Type":
                        "application/x-www-form-urlencoded"

                },

                body

            }
        );

        const data = await response.json();

        // -------------------------
        // Login Failed
        // -------------------------

        if (!response.ok) {

            // Email not verified — keep this branch separate: it's not a
            // "try again" state, we're transitioning away, so the button
            // stays disabled and we show a brief, tasteful notice instead
            // of jumping straight to the OTP screen.

           if (
    (response.status === 401 || response.status === 403) &&
    data.detail?.message === "Email not verified"
) {

    const email = data.detail.email;

    loginError.textContent = "";
    registerSuggestion.style.display = "none";

    Memory.set("verification", {
        mode: "login",
        email: email,
    });

    authNotice.classList.add("show");

    // Kick off a resend in the background so a code is already on its
    // way by the time the OTP screen appears. Its result doesn't gate
    // the transition — the OTP screen has its own resend button and
    // clear failure states if this one silently fails.
    fetch(
        `${CONFIG.API_HOST}/auth/resend?email=${encodeURIComponent(email)}`,
        { method: "POST" }
    ).catch(() => {});

    setTimeout(() => {
        window.location.href = "otp.html";
    }, 1400);

    return;
}

            loginBtn.disabled = false;
            loginBtn.textContent = "Continue →";

            // Invalid credentials

            if (

                data.detail ===
                "Invalid username or password"

            ) {

                loginError.textContent =
                    "Invalid username or password.";

                registerSuggestion.style.display =
                    "flex";

                return;

            }

            loginError.textContent =
                data.detail || "Unable to login.";

            return;

        }

        // -------------------------
        // Success
        // -------------------------

        await Session.setTokens(data);

        window.location.href =
            "../app.html";

    }

    catch {

        loginBtn.disabled = false;

        loginBtn.textContent =
            "Continue →";

        loginError.textContent =
            "Unable to connect. Please try again.";

    }

});