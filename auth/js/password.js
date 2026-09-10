// ----------------------------------
// Elements
// ----------------------------------

const identifier = document.getElementById("username");

const continueBtn = document.getElementById("continueBtn");

const usernameError = document.getElementById("usernameError");

const form = document.getElementById("passwordForm");

const backBtn = document.getElementById("backBtn");

// ----------------------------------
// Back
// ----------------------------------

backBtn.addEventListener("click", () => {

    history.back();

});

// ----------------------------------
// Validation
// ----------------------------------

identifier.addEventListener("input", () => {

    usernameError.textContent = "";

    identifier.classList.remove("error");

    const valid = identifier.value.trim() !== "";

    continueBtn.disabled = !valid;

    continueBtn.classList.toggle("active", valid);

});

// ----------------------------------
// Continue
// ----------------------------------

form.addEventListener("submit", async e => {

    e.preventDefault();

    if (continueBtn.disabled) return;

    continueBtn.disabled = true;

    continueBtn.textContent = "Sending...";

    usernameError.textContent = "";

    identifier.classList.remove("error");

    let response;
    let data;

    try {

        response = await fetch(

            `${CONFIG.API_HOST}/account/forgot_pass?email=${encodeURIComponent(identifier.value.trim())}`,

            {

                method: "PATCH"

            }

        );

        data = await response.json().catch(() => null);

    } catch {

        continueBtn.disabled = false;
        continueBtn.textContent = "Continue →";

        usernameError.textContent = "Unable to connect. Check your connection and try again.";

        return;
    }

    if (!response.ok) {

        continueBtn.disabled = false;
        continueBtn.textContent = "Continue →";

        if (response.status === 429) {
            usernameError.textContent = "Too many attempts. Please wait a moment and try again.";
        } else if (response.status === 404) {
            identifier.classList.add("error");
            usernameError.textContent = "We couldn't find an account with that username or email.";
        } else {
            usernameError.textContent = data?.detail || "Something went wrong. Please try again.";
        }

        return;
    }


Memory.set("reset", {

    email: data.email || identifier.value.trim()

});


window.location.href = "reset_password.html";
})