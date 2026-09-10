// ------------------------------------------------------------------
// pages/policies/policies.js — route: policies/:which
//   policies/privacy  policies/terms  policies/rules  policies/about
// ------------------------------------------------------------------
// Production legal/community text for Notely. Written to describe what
// the app actually does (accounts, class membership, note PDFs stored
// on Notely's server, group messaging) — it deliberately makes no
// technical guarantee the app doesn't provide (no promise of
// encryption at rest, no backup/recovery guarantee, no uptime SLA).
//
// Rendered as structured sections rather than one blob so long policies
// stay readable and scrollable on a phone.
// ------------------------------------------------------------------

const POLICY_UPDATED = "Last updated: 10 August 2026";

const POLICY_CONTENT = {
    terms: {
        title: "Terms & Conditions",
        intro: "These terms apply to everyone who uses Notely. By creating an account or using the app, you agree to them. If you don't agree, please stop using Notely.",
        sections: [
            {
                heading: "1. Who can use Notely",
                body: "Notely is made for schools, classes and study groups. You must give accurate account details, keep your password private, and you are responsible for everything done from your account. Tell us immediately if you think someone else has access to it.",
            },
            {
                heading: "2. Your account and your school",
                body: "Access to a school is granted with a join code. Access to a class section requires you to join that section explicitly. Opening or viewing something does not make you a member of it. School Owners and Teachers manage schools, classes, sections, roles and members, and may remove members or content from the spaces they manage.",
            },
            {
                heading: "3. Prohibited content and behaviour",
                body: "You must not upload, send, store, share or link to:",
                bullets: [
                    "pornography, sexual or 18+ content, or sexually explicit material of any kind",
                    "any sexual content involving minors, or any content that sexualises a minor — this is reported and permanently banned",
                    "sexual exploitation, abuse, or non-consensual intimate content",
                    "threats, violence, intimidation, stalking, doxxing or harassment of any person",
                    "hateful, abusive, discriminatory or demeaning content targeting people or groups",
                    "illegal content, or content that promotes or facilitates illegal activity",
                    "fraud, scams, phishing, or attempts to obtain money, accounts or personal data by deception",
                    "spam, bulk unsolicited messaging, or repetitive disruptive posting",
                    "impersonation of another student, teacher, school or of Notely itself",
                    "malware, viruses, exploit code, or files designed to damage devices or data",
                    "files that are deliberately harmful, misleading, corrupted or disguised as something else",
                    "content that infringes someone else's copyright, trademark or other rights, including paid material shared without permission",
                    "any other unlawful, abusive or seriously harmful content",
                ],
                after: "You also must not attempt to bypass access controls, read content of classes you are not a member of, automate abuse of the app, or interfere with Notely's operation or security.",
            },
            {
                heading: "4. What Notely storage is for",
                body: "Notely is an educational tool for class and study material. It is NOT a general-purpose cloud drive, backup service, media host, or file-sharing service for unrelated content.",
                bullets: [
                    "Acceptable: notes, worksheets, question papers, revision material, assignment briefs, class handouts and similar study material for a class you belong to.",
                    "Not acceptable: personal photo or video libraries, music, movies, games, software installers, archives of unrelated files, or using a class as private storage space.",
                ],
                after: "You are responsible for every file you upload: for having the right to share it, and for its content. Uploads may be limited in size, number and file type, and unrelated or prohibited files may be removed without notice.",
            },
            {
                heading: "5. Enforcement",
                body: "If you break these terms, we or the Owners/Teachers of your school may take action proportionate to what happened, including:",
                bullets: [
                    "removing or hiding the content",
                    "restricting your access to a class, section, group or school",
                    "restricting or removing your role and its permissions",
                    "temporarily suspending your account",
                    "permanently terminating your account in serious or repeated cases",
                ],
                after: "Serious cases — especially anything involving minors, credible threats, or criminal activity — may be reported to the relevant school authority or law enforcement.",
            },
            {
                heading: "6. Availability and data",
                body: "Notely is provided as it is. We work to keep it running and to keep your content available, but we cannot promise uninterrupted service or that content will never be lost, and we don't provide a guaranteed backup or recovery service. Keep your own copy of anything important to you.",
            },
            {
                heading: "7. Changes and ending use",
                body: "These terms may be updated as Notely changes; continued use after an update means you accept the new version. You can stop using Notely at any time and delete your account from Profile > Account.",
            },
        ],
    },

    privacy: {
        title: "Privacy Policy",
        intro: "This explains what Notely stores, why, and what control you have. It describes the app's real behaviour — nothing more.",
        sections: [
            {
                heading: "What we store",
                body: "",
                bullets: [
                    "Account details you provide: name, username, email, password (stored hashed, never in plain text), and optional profile picture and bio.",
                    "School and class data: the schools you belong to, your role, and the class sections you have explicitly joined.",
                    "Content you create: notes and their PDF files, subjects and chapters you manage, and messages you send in groups or direct chats.",
                    "Basic technical data needed to operate the app, such as your app version for updates and errors reported by the app.",
                ],
            },
            {
                heading: "Why we store it",
                body: "Only to run the app: to sign you in, show your schools and classes, deliver your notes and messages to the right people, apply roles and permissions, and provide app updates.",
            },
            {
                heading: "Who can see your content",
                body: "",
                bullets: [
                    "Note PDFs are private. They are served only to members of the class section the note belongs to, and every request is permission-checked on the server.",
                    "Messages are visible to the people in that chat or group.",
                    "Your name, username and profile picture are visible to people in your schools and groups.",
                    "School and group pictures are visible to members of that school or group.",
                    "School Owners and Teachers can see the members of the schools and classes they manage, and can manage roles and content there.",
                ],
            },
            {
                heading: "Sharing with others",
                body: "We do not sell your data and we do not use it for advertising. We only share it where necessary to run the app, or where we are legally required to, or to act on a serious safety issue such as content involving a minor or a credible threat.",
            },
            {
                heading: "Your account data on this device",
                body: "Your login session and profile are kept on your device (in encrypted native storage on Android) so you stay signed in between launches and app updates. It is removed when you log out or delete the app's data.",
            },
            {
                heading: "Your choices",
                body: "You can edit your profile at any time, leave a school, class section or group, delete notes you're allowed to delete, and delete your account from Profile > Account. Deleting your account removes your profile and login. Content shared into a class or group may remain visible to that class or group where removing it would break other people's records; ask an Owner or Teacher to remove specific content.",
            },
            {
                heading: "Retention and limits",
                body: "We keep content while your account and its schools/classes exist, and while needed to operate the app or meet a legal obligation. No online service is completely secure and we cannot guarantee against loss — please keep your own copy of anything you can't afford to lose.",
            },
            {
                heading: "Children and school use",
                body: "Notely is used in school settings. Where a school provides Notely to students, that school is responsible for the appropriateness of its use and for its own consent requirements. Content that sexualises or exploits a minor is banned outright and is acted on immediately.",
            },
            {
                heading: "Contact",
                body: "For a privacy question, a data request, or to report content, contact your school's Notely Owner or Teacher, who can escalate it to us.",
            },
        ],
    },

    rules: {
        title: "Community Rules",
        intro: "The short version of the Terms — what's expected of everyone using Notely.",
        sections: [
            {
                heading: "Do",
                body: "",
                bullets: [
                    "Share notes and study material that belong to your class.",
                    "Use your real identity within your school.",
                    "Be respectful in groups and direct messages.",
                    "Only upload files you have the right to share.",
                    "Report anything harmful to an Owner or Teacher.",
                ],
            },
            {
                heading: "Don't",
                body: "",
                bullets: [
                    "No pornography, sexual or 18+ content. Absolutely nothing sexual involving minors.",
                    "No threats, harassment, bullying, hate or abuse.",
                    "No illegal content, fraud, scams or spam.",
                    "No impersonation of students, teachers or schools.",
                    "No malware or deliberately harmful files.",
                    "No pirated or copyright-infringing material.",
                    "No using Notely as personal cloud storage for unrelated files.",
                ],
            },
            {
                heading: "What happens if rules are broken",
                body: "Content can be removed, access to a class or school can be restricted, roles can be removed, and accounts can be suspended or terminated. Serious cases can be escalated to the school or to law enforcement.",
            },
        ],
    },

    support: {
        title: "Customer Support",
        intro: "Running into a problem, or have a question about your account or a school? We're happy to help.",
        sections: [
            {
                heading: "What we can help with",
                body: "Reach out for anything about using Notely, including:",
                bullets: [
                    "app problems or bugs",
                    "account issues, such as trouble logging in or updating your profile",
                    "questions about a school, class, section or role",
                    "anything else that doesn't seem right",
                ],
            },
            {
                heading: "Response time",
                body: "We aim to get back to you within about 24 hours. For account or school setup requests, your email and application ID may take up to approximately 24 hours to be processed — we can't promise an exact time, but that's our target.",
            },
        ],
    },

    about: {
        title: "About Notely",
        intro: "Notely helps schools, teachers and students keep classes, notes and communication in one place.",
        sections: [
            {
                heading: "How it's organised",
                body: "School -> Classes -> Sections -> Subjects -> Notes. You join a school with a join code, and join the specific class section you belong to. Joining a section is always an explicit action.",
            },
            {
                heading: "Version",
                body: "Notely 1.0.0",
            },
            {
                heading: "Policies",
                body: "Terms & Conditions, Privacy Policy and Community Rules are available from Profile > About & legal.",
            },
        ],
    },
};

const PoliciesPage = {
    async render(container, params) {
        const which = (params && params[0]) || "privacy";
        const content = POLICY_CONTENT[which] || POLICY_CONTENT.privacy;

        const header = h("div", { className: "app-header" }, [
            h("button", {
                className: "back-btn", type: "button", title: "Back",
                // Reachable both from the logged-in Profile screen and
                // pre-login from the sign-up screen (see app.js) — plain
                // history.back() works for both instead of assuming
                // "profile" is a registered route.
                onClick: () => (window.history.length > 1 ? history.back() : Router.go("profile")),
            }, [h("span", { className: "material-symbols-rounded" }, "arrow_back")]),
            h("h1", {}, content.title),
        ]);

        const blocks = [];
        if (which === "support") {
            // Contact card up top, ahead of the "last updated" stamp that
            // makes sense for a legal doc but not here.
            blocks.push(h("a", {
                className: "card card-row policy-contact-card", href: "mailto:notely.team@gmail.com",
                style: "margin-bottom:14px; text-decoration:none; color:inherit;",
            }, [
                h("span", { className: "material-symbols-rounded", style: "color:var(--primary)" }, "mail"),
                h("div", { className: "card-row-text" }, [
                    h("div", { className: "card-row-title" }, "notely.team@gmail.com"),
                    h("div", { className: "card-row-sub" }, "Tap to open your email app"),
                ]),
                h("span", { className: "material-symbols-rounded" }, "chevron_right"),
            ]));
        } else {
            blocks.push(h("p", { className: "policy-updated" }, POLICY_UPDATED));
        }
        if (content.intro) blocks.push(h("p", { className: "policy-intro" }, content.intro));

        (content.sections || []).forEach(sec => {
            const parts = [h("h3", {}, sec.heading)];
            if (sec.body) parts.push(h("p", {}, sec.body));
            if (sec.bullets?.length) {
                parts.push(h("ul", {}, sec.bullets.map(b => h("li", {}, b))));
            }
            if (sec.after) parts.push(h("p", {}, sec.after));
            blocks.push(h("section", { className: "policy-section" }, parts));
        });

        // Cross-links so every policy is reachable from every other one.
        const linkRow = h("div", { className: "policy-links" },
            [
                ["terms", "Terms"],
                ["privacy", "Privacy"],
                ["rules", "Community Rules"],
                ["about", "About"],
                ["support", "Support"],
            ]
                .filter(([key]) => key !== which)
                .map(([key, label]) => h("button", {
                    className: "btn btn-ghost btn-sm", type: "button",
                    onClick: () => Router.go(`policies/${key}`),
                }, label)));

        mount(container, header, h("div", { className: "policy-doc" }, blocks), linkRow);

        // Long documents should always start at the top, even when the user
        // arrives from another policy page mid-scroll.
        window.scrollTo({ top: 0 });
    },
};

window.POLICY_CONTENT = POLICY_CONTENT;
window.PoliciesPage = PoliciesPage;
