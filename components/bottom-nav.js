// ------------------------------------------------------------------
// components/bottom-nav.js
// ------------------------------------------------------------------

const NAV_ITEMS = [
    { route: "home", icon: "home", label: "Home" },
    { route: "messages", icon: "chat_bubble", label: "Messages" },
    { route: "notes", icon: "menu_book", label: "Notes" },
    { route: "schools", icon: "school", label: "Schools" },
    { route: "profile", icon: "person", label: "Profile" },
];

function BottomNav(activeRoute) {
    const nav = h("nav", { className: "bottom-nav" }, [
        // Only visible in the desktop sidebar layout (styles/desktop.css)
        // — on mobile this collapses to nothing via the bottom-nav flex
        // row, so no separate mobile/desktop markup branch is needed.
        h("div", { className: "nav-brand" }, [
            h("img", { src: "assets/images/logo.png", alt: "" }),
            h("span", {}, "Notely"),
        ]),
        ...NAV_ITEMS.map(item => h("button", {
            className: `nav-item ${activeRoute === item.route ? "active" : ""}`,
            onClick: () => { if (activeRoute !== item.route) Router.go(item.route); },
        }, [
            h("span", { className: "material-symbols-rounded" }, item.icon),
            h("span", {}, item.label),
        ])),
    ]);
    return nav;
}

window.BottomNav = BottomNav;
