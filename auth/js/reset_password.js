// ----------------------------------
// Notely Reset Password — Step 1: Verify OTP
// ----------------------------------

const reset = Memory.get("reset");


if (!reset || !reset.email) {

    window.location.replace("password.html");

}

const EMAIL = reset.email;

document.getElementById("emailDisplay").textContent = EMAIL;

// ----------------------------------
// Elements
// ----------------------------------

const inputs = document.querySelectorAll(".otp");

const verifyBtn = document.getElementById("verifyBtn");

const otpError = document.getElementById("otpError");

const backBtn = document.getElementById("backBtn");


// ----------------------------------
// Back
// ----------------------------------

backBtn.addEventListener("click", () => {

    history.back();

});


// ----------------------------------
// OTP input handling
// ----------------------------------

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

function checkOTP() {

    const otp = [...inputs].map(i => i.value).join("");

    verifyBtn.disabled = otp.length !== 6;

    verifyBtn.classList.toggle("active", otp.length === 6);

}


// ----------------------------------
// Verify OTP -> receive one-time code
// ----------------------------------

let isVerifying = false;

verifyBtn.addEventListener("click", async () => {

    if (isVerifying) return;

    const otp = [...inputs].map(i => i.value).join("");

    if (otp.length !== 6) return;

    isVerifying = true;

    verifyBtn.disabled = true;

    verifyBtn.textContent = "Verifying...";

    otpError.textContent = "";

    let data;

    try {

        data = await AuthApi.verifyResetOtp(EMAIL, otp);

    } catch (err) {

        isVerifying = false;

        verifyBtn.disabled = false;

        verifyBtn.textContent = "Verify Code";

        if (err?.status === 429) {

            otpError.textContent =

                err?.detail || "Too many attempts. Please wait a moment and try again.";

        } else if (err?.status === 401) {

            otpError.textContent = err?.detail || "Incorrect code. Please try again.";

            inputs.forEach(i => (i.value = ""));

            inputs[0].focus();

        } else {

            otpError.textContent = err?.detail || "Verification failed. Please try again.";

        }

        checkOTP();

        return;

    }

    // Backend returns a one-time code to use in the password-change step.
    const code = data?.code;

    if (!code) {

        isVerifying = false;

        verifyBtn.disabled = false;

        verifyBtn.textContent = "Verify Code";

        otpError.textContent = "Verification succeeded but no code was returned.";

        return;

    }

    // Carry the email + one-time code to the new-password screen.
    Memory.set("reset", {

        email: EMAIL,

        code

    });

    isVerifying = false;

    verifyBtn.textContent = "Verified ✓";

    setTimeout(() => {

        window.location.href = "new_password.html";

    }, 600);

});

