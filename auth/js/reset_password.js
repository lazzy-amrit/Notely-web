// ----------------------------------
// Notely Reset Password
// ----------------------------------

const reset = Memory.get("reset");


if (!reset) {

    window.location.href = "password.html";

}


// ----------------------------------
// Elements
// ----------------------------------

const otp = document.getElementById("otp");

const newPassword = document.getElementById("newPassword");

const confirmPassword = document.getElementById("confirmPassword");

const resetBtn = document.getElementById("resetBtn");

const resetError = document.getElementById("resetError");


// Password eyes

const toggleNewPassword = document.getElementById("toggleNewPassword");

const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");

const newEyeIcon = document.getElementById("newEyeIcon");

const confirmEyeIcon = document.getElementById("confirmEyeIcon");


// ----------------------------------
// Password Toggle
// ----------------------------------

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
        otp.value.trim().length === 6 &&
        newPassword.value.length >= 6 &&
        confirmPassword.value.length >= 6;


    resetBtn.disabled = !valid;


    resetBtn.classList.toggle(
        "active",
        valid
    );

}


[
    otp,
    newPassword,
    confirmPassword

].forEach(input => {

    input.addEventListener(
        "input",
        () => {

            resetError.textContent = "";

            checkForm();

        }
    );

});


// ----------------------------------
// Reset Password
// ----------------------------------

document
.getElementById("resetForm")
.addEventListener("submit", async e => {


e.preventDefault();


if (resetBtn.disabled) return;



resetBtn.disabled = true;

resetBtn.textContent = "Updating...";


resetError.textContent = "";

const response = await fetch(

    `${CONFIG.API_HOST}/account/verify_otp`,

    {

        method:"POST",

        headers:{

            "Content-Type":"application/json"

        },

        body:JSON.stringify({

            email: reset.email,

            otp: otp.value.trim(),

            new_password: newPassword.value,

            confirm_password: confirmPassword.value

        })

    }

).catch(() => null);

if (!response) {

    resetBtn.disabled = false;

    resetBtn.textContent = "Reset Password →";

    resetError.textContent = "Unable to connect. Check your connection and try again.";

    return;

}

const data = await response.json().catch(() => null);


if (!response.ok) {


    resetBtn.disabled = false;

    resetBtn.textContent = "Reset Password →";


    resetError.textContent =
        (response.status === 429
            ? "Too many attempts. Please wait a moment and try again."
            : data && data.detail) || "Unable to reset password";


    return;


}




resetBtn.textContent = "Updated ✓";



Memory.remove("reset");



setTimeout(() => {


    window.location.href = "login.html";


},1500);



});