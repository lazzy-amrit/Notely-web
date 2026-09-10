// -----------------------------
// Elements
// -----------------------------

const cards = document.querySelectorAll(".card");
const continueBtn = document.getElementById("continueBtn");

let selectedRole = Memory.get("role");

// -----------------------------
// Restore Previous Selection
// -----------------------------

if (selectedRole) {

    cards.forEach(card => {

        if (card.dataset.role === selectedRole) {

            card.classList.add("selected");

        }

    });

    continueBtn.disabled = false;
    continueBtn.classList.add("active");

}

// -----------------------------
// Card Selection
// -----------------------------

cards.forEach(card => {

    card.addEventListener("click", () => {

        // Remove previous selection
        cards.forEach(c => c.classList.remove("selected"));

        // Select current
        card.classList.add("selected");

        // Save
        selectedRole = card.dataset.role;

        Memory.set("role", selectedRole);

        // Enable button
        continueBtn.disabled = false;
        continueBtn.classList.add("active");

        // Small vibration (Android & supported devices)
        if (navigator.vibrate) {

            navigator.vibrate(12);

        }

    });

});

// -----------------------------
// Continue
// -----------------------------

continueBtn.addEventListener("click", () => {

    if (!selectedRole) return;

    continueBtn.disabled = true;

    continueBtn.innerHTML = "Loading...";

    // Tiny delay for better UX
    setTimeout(() => {

        window.location.href = "register.html";

    }, 200);

});