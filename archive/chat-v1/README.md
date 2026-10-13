# Notely web — chat & notifications stack (removed in v1.2)

This folder is a **cold archive** of the full chat/messaging + notification
frontend that was removed when the backend dropped chat (Notely web 1.2.0).
It is kept as reference for a possible future re-introduction of chat.

Nothing in here is loaded by the app: it is not referenced from `app.html`,
not precached by `sw.js`, and `/archive/` is disallowed in `robots.txt`.
The files are exactly as they were in the pre-1.2 build (restored from git).

## Contents (original paths preserved)

| File | What it was |
|---|---|
| `api/messages.js` | `MessagesApi` — group messages, DMs, DM requests/privacy wall, deletions, reactions |
| `api/groups.js` | `GroupsApi` — chat groups dashboard, members, roles, invites, group avatar |
| `api/notifications.js` | `NotificationsApi` — push token registration (`/notifications/register-token`) |
| `services/websocket.js` | `WS` — the app's single `/ws/notifications` socket (chat + notification events, token-in-query auth) |
| `services/notifications.js` | `NotificationService` — in-app notification center fed by the socket (badges, toasts, vibration) |
| `pages/messages/messages.js` | Messages tab — group + DM inbox, unread badges, people search |
| `pages/messages/chat.js` | Chat thread view — composer, typing indicators, reactions, message history |
| `pages/messages/dm-search.js` | DM start-new-conversation search sheet |
| `pages/messages/messages.css` | Full chat UI styling (bubbles, composer, emoji dock) |

## Where chat was integrated (removed from these shared files in v1.2)

If chat ever comes back, these are the integration points that existed:

- `app.js` — `Router.register("messages", ...)`, `WS.connect()`,
  `NotificationService.init()`, chat paths in `CacheService.prefetch`
  (`/chats/groups`, `/chat/dms`, `/chat/invites`, `/chat/dm-requests`)
- `app.html` — script tags for every file above + `pages/messages/messages.css`
- `components/bottom-nav.js` — the "Messages" nav item
- `services/router.js` — `isChatThread` logic: `body.nav-hidden` +
  `#app-content.chat-page` (full-bleed thread surfaces)
- `pages/home/home.js` — dashboard sources `/chats/groups`, `/chat/invites`,
  `/chat/dm-requests`, `/chat/dms`; message-request/invite cards; "Recent
  messages" section; notification bell in the header
- `components/profile-preview.js` — "Message" button + "Add to group" picker
  (`GroupsApi.list` / `GroupsApi.addMember`)
- `pages/schools/schools.js` — member row passed `onMessage` (deep link to
  `messages/dm/{id}`) into the profile preview
- `services/cache.js` — cache policies for `/chat/*` + `/chats/groups`,
  `messageHistory` trimming, `appendMessage`/`removeMessage`, chat branches
  in `invalidateForMutation`
- `api/config.js` — `WS_HOST` (derived from API host) and `DM_MESSAGE_LIMIT`
- `services/session.js` — WS reconnect on token refresh; WS disconnect on logout
- `utils/format.js` — `timeAgo`, `messageTime`, `conversationTime`,
  `safeParseDate`
- `utils/entity-cache.js` — `rememberGroup`/`getGroup` + groups in the
  persisted entity cache
- `styles/app.css` — `.chat-header-text/.chat-header-sub`, `.composer`,
  `.chat-scroll`, `.nav-badge`, `body.nav-hidden` rules, the whole
  NOTIFICATIONS section (bell, badge, center, rows)
- `styles/global.css` — `.typing-dots`, `.dm-wall`, `.update-card*`
  (SW-update prompt card)
- `styles/variables.css` — `--bubble-mine` / `--bubble-theirs` tokens
- `styles/desktop.css` — `nav-hidden`/`chat-page` sidebar rules
- `sw.js` — the files above in `PRECACHE_URLS`

## Pre-1.2 versions of the shared files

The full pre-1.2 app (with chat wired in) is the git commit **before** the
v1.2 changes. For any shared file, the old version is available with:

```sh
git log --oneline          # find the commit before "remove chat (v1.2)"
git show <commit>:pages/home/home.js
```

> Note: the backend no longer has any `/chat/*`, `/chats/*`, `/ws/*` or
> `/notifications/*` endpoints, so this code cannot run against the current
> backend — restoring chat means restoring backend support first.
