// ----------------------------------
// Notely OTP Screen
// ----------------------------------
// Shared by registration and unverified-login verification.
// Successful verification returns a JWT and goes directly to dashboard.

const verification = Memory.get("verification");

if (!verification || !verification.email) {
    window.location.replace("login.html");
    throw new Error("Missing verification state");
}

const MODE = verification.mode === "login" ? "login" : "register";
const EMAIL = verification.email;
const USERNAME = verification.username || null;

const usernameDisplay = document.getElementById("usernameDisplay");
usernameDisplay.textContent = USERNAME ? `@${USERNAME}` : EMAIL;

const inputs = document.querySelectorAll(".otp");
const verifyBtn = document.getElementById("verifyBtn");
const otpError = document.getElementById("otpError");
const timer = document.getElementById("timer");
const resendBtn = document.getElementById("resendBtn");
const otpCard = document.querySelector(".otp-card");
const successCard = document.getElementById("successCard");

inputs.forEach((input, index) => {
    input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(0, 1);

        if (input.value && index < inputs.length - 1) {
            inputs[index + 1].focus();
        }

        otpError.textContent = "";
        checkOTP();
    });

    input.addEventListener("keydown", e => {
        if (e.key === "Backspace" && input.value === "" && index > 0) {
            inputs[index - 1].focus();
        }
    });
});

document.addEventListener("paste", e => {
    const pasted = (e.clipboardData?.getData("text") || "").trim();
    if (!/^\d{6}$/.test(pasted)) return;

    e.preventDefault();
    pasted.split("").forEach((digit, i) => {
        inputs[i].value = digit;
    });

    inputs[inputs.length - 1].focus();
    otpError.textContent = "";
    checkOTP();
});

let isVerifying = false;

function checkOTP() {
    const otp = [...inputs].map(i => i.value).join("");
    verifyBtn.disabled = otp.length !== 6 || isVerifying;
    verifyBtn.classList.toggle("active", otp.length === 6);
}

let countdown = null;

function startResendTimer(seconds = 60) {
    clearInterval(countdown);

    if (seconds <= 0) {
        timer.style.display = "none";
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend Code";
        return;
    }

    resendBtn.disabled = true;
    timer.style.display = "";

    let remaining = seconds;

    const render = () => {
        const m = String(Math.floor(remaining / 60)).padStart(2, "0");
        const s = String(remaining % 60).padStart(2, "0");
        timer.textContent = `Resend in ${m}:${s}`;
    };

    render();

    countdown = setInterval(() => {
        remaining--;

        if (remaining <= 0) {
            clearInterval(countdown);
            timer.style.display = "none";
            resendBtn.disabled = false;
            resendBtn.textContent = "Resend Code";
            return;
        }

        render();
    }, 1000);
}

startResendTimer(verification.emailSent === false ? 0 : 60);

let isResending = false;

resendBtn.addEventListener("click", async () => {
    if (isResending) return;

    isResending = true;
    resendBtn.disabled = true;
    resendBtn.textContent = "Sending...";
    otpError.textContent = "";

    let response;
    let data;

    try {
        response = await fetch(
            `${CONFIG.API_HOST}/auth/resend?email=${encodeURIComponent(EMAIL)}`,
            { method: "POST", headers: { Accept: "application/json" } }
        );
        data = await response.json().catch(() => null);
    } catch {
        isResending = false;
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend Code";
        otpError.textContent =
            "Unable to connect. Check your connection and try again.";
        return;
    }

    isResending = false;

    if (!response.ok) {
        // Backend returns a token if this account became verified elsewhere.
        if (data?.already_verified && data?.access_token) {
            await Session.setTokens(data);
            showSuccess({
                title: "Email Already Verified",
                body: "Your account is already ready to use.",
                small: "Redirecting to dashboard...",
            });

            setTimeout(goToDashboard, 900);
            return;
        }

        resendBtn.disabled = false;
        resendBtn.textContent = "Resend Code";

        if (response.status === 429) {
            otpError.textContent =
                data?.detail || "Please wait before requesting another code.";
        } else if (response.status === 404) {
            otpError.textContent =
                "We couldn't find that account. Please register again.";
        } else if (response.status === 503) {
            otpError.textContent =
                data?.detail || "Email delivery failed. Please try again.";
        } else {
            otpError.textContent =
                data?.detail || "Unable to resend the code. Please try again.";
        }

        return;
    }

    resendBtn.textContent = "Resent ✓";
    startResendTimer(60);
});

function showSuccess({ title, body, small }) {
    otpCard.style.display = "none";
    successCard.classList.add("show");

    successCard.querySelector("h2").textContent = title;
    successCard.querySelector("p").textContent = body;
    successCard.querySelector("small").textContent = small;
}

function goToDashboard() {
    Memory.remove("verification");
    Memory.remove("role");
    window.location.replace("../index.html");
}

verifyBtn.addEventListener("click", async () => {
    if (isVerifying) return;

    const otp = [...inputs].map(i => i.value).join("");
    if (otp.length !== 6) return;

    isVerifying = true;
    verifyBtn.disabled = true;
    verifyBtn.textContent = "Verifying...";
    otpError.textContent = "";

    let response;
    let data;

    try {
        response = await fetch(`${CONFIG.API_HOST}/auth/verify_otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: EMAIL, otp }),
        });

        data = await response.json().catch(() => null);
    } catch {
        isVerifying = false;
        verifyBtn.disabled = false;
        verifyBtn.textContent = "Verify";
        otpError.textContent =
            "Unable to connect. Check your connection and try again.";
        return;
    }

    if (!response.ok) {
        isVerifying = false;
        verifyBtn.disabled = false;
        verifyBtn.textContent = "Verify";

        if (response.status === 429) {
            otpError.textContent =
                "Too many attempts. Please wait a moment and try again.";
        } else {
            otpError.textContent =
                data?.detail || "Incorrect code. Please try again.";
        }

        inputs.forEach(i => (i.value = ""));
        inputs[0].focus();
        checkOTP();
        return;
    }

    // This is the important transition: verification itself logs the user
    // in. There is no second login step.
    if (!data?.access_token) {
        isVerifying = false;
        verifyBtn.disabled = false;
        verifyBtn.textContent = "Verify";
        otpError.textContent =
            "Verification succeeded but no login token was returned.";
        return;
    }

    await Session.setTokens(data);

    showSuccess({
        title: data?.already_verified
            ? "Email Already Verified"
            : "Email Verified",
        body: MODE === "register"
            ? "Your account has been created successfully."
            : "Your account is ready to use.",
        small: "Redirecting to dashboard...",
    });

    setTimeout(goToDashboard, 900);
});
