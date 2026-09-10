// ------------------------------------------------
// Elements
// ------------------------------------------------

const role = Memory.get("role");

if (!role) {

    window.location.href = "role.html";

}

const teacherFields = document.getElementById("teacherFields");

const username = document.getElementById("username");
const fullName = document.getElementById("name");
const email = document.getElementById("email");
const password = document.getElementById("password");

const schoolName = document.getElementById("schoolName");
const subjects = document.getElementById("subjects");
const schoolPhone = document.getElementById("schoolPhone");
const coordinator = document.getElementById("coordinator");
const skipSchool = document.getElementById("skipSchool");

const usernameStatus = document.getElementById("usernameStatus");

const registerBtn = document.getElementById("registerBtn");

const form = document.getElementById("registerForm");

const togglePassword = document.getElementById("togglePassword");

const backBtn = document.getElementById("backBtn");

const emailError = document.getElementById("emailError");

// ------------------------------------------------
// Teacher Fields
// ------------------------------------------------

if (role === "teacher") {

    teacherFields.style.display = "block";

}

// ------------------------------------------------
// Skip School Information
// ------------------------------------------------

if (skipSchool) {

    skipSchool.addEventListener("change", () => {

        const skip = skipSchool.checked;

        [
            schoolName,
            subjects,
            schoolPhone,
            coordinator
        ].forEach(input => {

            input.disabled = skip;

            if (skip) {
                input.value = "";
            }

        });

        validateForm();

    });

}

// ------------------------------------------------
// Back Button
// ------------------------------------------------

backBtn.addEventListener("click", () => {

    history.back();

});

// ------------------------------------------------
// Password Toggle
// ------------------------------------------------

togglePassword.addEventListener("click", () => {

    if (password.type === "password") {

        password.type = "text";

        eyeIcon.textContent = "visibility_off";

    } else {

        password.type = "password";

        eyeIcon.textContent = "visibility";

    }

});


// ------------------------------------------------
// Password Rules
// ------------------------------------------------

const ruleLength = document.getElementById("ruleLength");
const ruleUpper = document.getElementById("ruleUpper");
const ruleNumber = document.getElementById("ruleNumber");

password.addEventListener("input", () => {

    const value = password.value;

    ruleLength.classList.toggle(
        "valid",
        value.length >= 8
    );

    ruleUpper.classList.toggle(
        "valid",
        /[A-Z]/.test(value)
    );

    ruleNumber.classList.toggle(
        "valid",
        /\d/.test(value)
    );

    validateForm();

});

// ------------------------------------------------
// Username Check
// ------------------------------------------------

let timer;

let usernameAvailable = false;

username.addEventListener("input", () => {

    clearTimeout(timer);

    usernameAvailable = false;

    validateForm();

    const value = username.value.trim();

    if (value.length < 3) {

        usernameStatus.textContent = "";

        return;

    }

    usernameStatus.className = "loading";

    usernameStatus.textContent = "Checking username...";

    timer = setTimeout(checkUsername, 500);

});

// ------------------------------------------------
// Replace with backend
// ------------------------------------------------

async function checkUsername() {

    const value = username.value.trim();

    try {
        const response = await fetch(`${CONFIG.API_HOST}/auth/check_username?username=${encodeURIComponent(value)}`,{

            method:"get"

        });

        const data = await response.json();

        if (data.available) {

            usernameAvailable = true;

            usernameStatus.className = "success";

            usernameStatus.textContent = "✓ Username available";

        } else {

            usernameAvailable = false;

            usernameStatus.className = "error";

            usernameStatus.textContent = "Username already taken";

        }

    }

    catch {


usernameAvailable = false;


usernameStatus.className = "error";


usernameStatus.textContent = "Unable to check username";


}


validateForm();


} 

// ------------------------------------------------
// Validation
// ------------------------------------------------

function validateForm() {

    let valid =

        usernameAvailable &&

        fullName.value.trim() !== "" &&

        email.value.trim() !== "" &&

        password.value.length >= 8 &&

        /[A-Z]/.test(password.value) &&

        /\d/.test(password.value);

    if (role === "teacher" && !skipSchool.checked) {

    valid =

        valid &&

        schoolName.value.trim() !== "" &&

        subjects.value.trim() !== "" &&

        schoolPhone.value.trim() !== "";

}

    registerBtn.disabled = !valid;

    registerBtn.classList.toggle(
        "active",
        valid
    );

}

[
fullName,
email,
schoolName,
subjects,
schoolPhone,
coordinator

].forEach(input=>{

    if(!input) return;

    input.addEventListener(
        "input",
        validateForm
    );

});

// ------------------------------------------------
// Register
// ------------------------------------------------

form.addEventListener("submit", async e => {

    e.preventDefault();

    if (registerBtn.disabled) return;

    registerBtn.disabled = true;

    registerBtn.textContent = "Creating...";

    const payload = {

        username: username.value.trim(),

        name: fullName.value.trim(),

        email: email.value.trim(),

        password: password.value,

        role: role

    };

    if (role === "teacher" && !skipSchool.checked) {

    payload.school_name = schoolName.value.trim();

    payload.subjects = subjects.value.trim();

    payload.contact_number = schoolPhone.value.trim();

    payload.incharge = coordinator.value.trim();

}

    // Clear previous email error
    email.classList.remove("error");
    emailError.textContent = "";

const registerError = document.getElementById("registerError");

// Send request
    let response;
    let data;

    try {

        response = await fetch(`${CONFIG.API_HOST}/auth/register`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(payload)

        });

        data = await response.json().catch(() => null);

    } catch {

        registerBtn.disabled = false;
        registerBtn.textContent = "Continue →";

        registerError.textContent = "Unable to connect. Please check your connection and try again.";

        return;
    }

if (!response.ok) {

    registerBtn.disabled = false;
    registerBtn.textContent = "Continue →";

    const detail = data?.detail;

    if (detail === "Email is already in use") {

        email.classList.add("error");
        emailError.textContent = "This email is already registered.";
        return;
    }

    if (detail === "Username already exists") {

        usernameStatus.className = "error";
        usernameStatus.textContent = "Username already taken";
        return;
    }

    if (response.status === 429) {

        registerError.textContent = "Too many attempts. Please wait a moment and try again.";
        return;
    }

    registerError.textContent = detail || "Something went wrong. Please try again.";
    return;
}

// Success — normalized state consumed by otp.js. "mode: register" tells
// the OTP screen this is a fresh account (not a login-time verification).
Memory.set("verification", {
    mode: "register",
    email: payload.email,
    username: payload.username,
    name: payload.name,
});

window.location.href = "otp.html";
});