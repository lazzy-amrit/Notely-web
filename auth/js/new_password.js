// ----------------------------------
// Notely Reset Password — Step 2: Create New Password
// ----------------------------------

const reset = Memory.get("reset");


if (!reset || !reset.email || !reset.code) {

    window.location.replace("password.html");

}

const EMAIL = reset.email;

const CODE = reset.code;


// ----------------------------------
// Elements
// ----------------------------------

const newPassword = document.getElementById("newPassword");

const confirmPassword = document.getElementById("confirmPassword");

const createBtn = document.getElementById("createBtn");

const newPasswordError = document.getElementById("newPasswordError");

const form = document.getElementById("newPasswordForm");

const backBtn = document.getElementById("backBtn");


// ----------------------------------
// Back
// ----------------------------------

backBtn.addEventListener("click", () => {

    history.back();

});


// ----------------------------------
// Password Toggle
// ----------------------------------

const toggleNewPassword = document.getElementById("toggleNewPassword");

const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");

const newEyeIcon = document.getElementById("newEyeIcon");

const confirmEyeIcon = document.getElementById("confirmEyeIcon");

toggleNewPassword.addEventListener("click", () => {

    if (newPassword.type === "password") {

        newPassword.type = "text";

        newEyeIcon.textContent = "visibility_off";

    } else {

        newPassword.type = "password";

        newEyeIcon.textContent = "visibility";

    }

});

toggleConfirmPassword.addEventListener("click", () => {

    if (confirmPassword.type === "password") {

        confirmPassword.type = "text";

        confirmEyeIcon.textContent = "visibility_off";

    } else {

        confirmPassword.type = "password";

        confirmEyeIcon.textContent = "visibility";

    }

});


// ----------------------------------
// Enable Button
// ----------------------------------

function checkForm() {

    const valid =

        newPassword.value.length >= 6 &&

        confirmPassword.value.length >= 6 &&

        newPassword.value === confirmPassword.value;

    createBtn.disabled = !valid;

    createBtn.classList.toggle("active", valid);

}


[newPassword, confirmPassword].forEach(input => {

    input.addEventListener("input", () => {

        newPasswordError.textContent = "";

        checkForm();

    });

});


// ----------------------------------
// Create New Password (type = "change")
// ----------------------------------

form.addEventListener("submit", async e => {

    e.preventDefault();

    if (createBtn.disabled) return;

    createBtn.disabled = true;

    createBtn.textContent = "Creating...";

    newPasswordError.textContent = "";

    let data;

    try {

        data = await AuthApi.resetPassword(

            EMAIL,

            CODE,

            newPassword.value,

            confirmPassword.value

        );

    } catch (err) {

        createBtn.disabled = false;

        createBtn.textContent = "Create Password →";

        if (err?.status === 429) {

            newPasswordError.textContent =

                err?.detail || "Too many attempts. Please wait a moment and try again.";

        } else if (err?.status === 401) {

            newPasswordError.textContent =

                err?.detail || "Invalid code. Please verify your OTP again.";

        } else {

            newPasswordError.textContent = err?.detail || "Unable to reset password. Please try again.";

        }

        return;

    }

    createBtn.textContent = "Created ✓";

    Memory.remove("reset");

    setTimeout(() => {

        window.location.href = "login.html";

    }, 800);

});

