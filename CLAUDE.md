# website_projects

## friendo/ — friends tracker + journal

A static site (no build step), published with GitHub Pages from this repo's default
branch at https://laiwong22.github.io/website_projects/friendo/ (the root `index.html`
redirects there). Open `friendo/index.html` directly to run it locally.

All data lives in plain JS files that Claude edits when the user asks:

| File | What it holds |
| --- | --- |
| `friendo/data/friends.js` | One object per friend, **in the order they were added** (append new friends at the end) |
| `friendo/data/moments.js` | Every invite, gift and kind act, in both directions |
| `friendo/data/journal.js` | Journal entries (Markdown); private-to-the-user reflections |
| `friendo/data/priorities.js` | AI priorities, rewritten every week by the weekly routine (see below) |
| `friendo/photos/` | Friend photos (square JPEGs, ~360px), referenced as `photos/<file>.jpg` |

The sample people (Maya, Jordan, Priya), their moments, the sample journal entry and the
sample priorities are placeholders. When the user adds their first real friends, ask whether
to delete the samples (and clear their ids out of `priorities.js`).

The user can also edit on the site itself. With a GitHub token connected (⚙ on the site),
the site commits `friendo/data/*.js` and `friendo/photos/*` straight to the default branch
with messages starting `Friendo:`. **Always pull before editing data files** so you don't
overwrite their changes.

### friends.js

```js
{
  "id": "maya",                 // unique, lowercase slug; referenced everywhere else
  "name": "Maya Chen",          // required
  "nickname": "Maya",           // optional, used in suggestions ("Your turn to invite Maya")
  "closeness": "close",         // "acquaintance" | "friend" | "close"
  "photo": "photos/maya.jpg",   // optional
  "birthday": "03-14",          // optional, MM-DD (drives birthday suggestions)
  "met": "College roommate, 2018",
  "likes": ["spicy ramen", "pottery"],     // short phrases; they feed the Ideas tab
  "dislikes": ["cilantro", "loud bars"],
  "details": [                  // everything worth remembering, in the order it was added
    { "id": "d-maya-1", "date": "2026-05-10", "text": "Training for a half marathon. Race is Nov 15." }
  ]
}
```

- Detail ids must be unique; use `d-<friendId>-<n>` with the next free number.
- Never reorder `details`. Importance order lives in `priorities.js`.
- Put new facts about a friend in `details` (one fact per entry, dated today), and new
  likes or dislikes in `likes` / `dislikes`.

### moments.js

```js
{
  "id": "2026-09-27-maya-pottery",   // unique; convention: date-friend-keyword
  "date": "2026-09-27",              // YYYY-MM-DD
  "type": "invite",                  // "invite" | "gift" | "kindness" (help, a favor, a check-in…)
  "from": "them",                    // "them" = they did it for me, "me" = I did it for them
  "friends": ["maya"],               // one or more friend ids
  "title": "Pottery studio open night",
  "size": "medium",                  // "small" (coffee, a text) | "medium" (dinner) | "big" (trip, party, big favor)
  "outcome": "yes",                  // invites only: "yes" | "no" | "pending"
  "notes": "optional detail"
}
```

`outcome` is the answer to the invite: for `from: "them"` it's whether the user said yes or
turned it down; for `from: "me"` it's whether the friend said yes. Future invites are `"pending"`
until answered.

Examples of how to translate what the user says:
- "Maya invited me to her birthday dinner Saturday and I said yes" → `invite`, `from: "them"`, `outcome: "yes"`, `size: "medium"`.
- "I had to bail on Jordan's game night" → `invite`, `from: "them"`, `outcome: "no"`.
- "Pri got me a cactus" → `gift`, `from: "them"`, `size: "small"`.
- "Jordan helped me move" → `kindness`, `from: "them"`, `size: "big"`.
- "I invited Pri to brunch, waiting to hear back" → `invite`, `from: "me"`, `outcome: "pending"`.
- If a friend isn't in `friends.js` yet, add them (ask for anything important you can't infer).
- If the size isn't obvious, pick the closest one and mention it in your reply.

### journal.js

```js
{
  "id": "2026-09-27-mugs-and-mess",   // unique; convention: date-slug-of-title
  "date": "2026-09-27",
  "title": "Mugs, mess, and Maya",
  "tags": ["friendship", "gratitude"],
  "friends": ["maya"],                // friend ids mentioned (links the post to their History page)
  "body": `Markdown here…`
}
```

- `body` is a JS template literal. Inside it, escape backticks as `` \` `` and `${` as `\${`.
- Supported Markdown: paragraphs, `##`/`###` headings, `**bold**`, `*italic*`, `` `code` ``,
  `-` / `1.` lists, `>` quotes, `---` rules, `[links](https://…)`. No images.
- **Voice:** casual, funny and reflective, written in the user's first person. Keep it
  short (a few short paragraphs) unless the user gave a lot of important detail. Keep
  their words and details and never invent events. Tag friends who appear. Show a draft
  before committing unless the user said to go ahead.
- When a post describes an invite, gift or kind act, also log it in `moments.js`, and add
  any new facts about a friend to their `details`.

### priorities.js (written by the weekly routine)

```js
window.FC_DATA.priorities = {
  "updated": "2026-10-11",                       // date of the run
  "summary": "One or two sentences: what to focus on this week.",
  "friends": [                                   // EVERY friend, most important first
    { "id": "jordan", "reason": "One specific sentence on why, citing real data." }
  ],
  "details": {                                   // per friend: ALL their detail ids, most important first
    "jordan": ["d-jordan-3", "d-jordan-2", "d-jordan-1"]
  }
};
```

How to rank friends: weigh recent kindness or gifts you haven't returned, invites the user
turned down or owes back (invites in vs out over the last year), time since they last
did something together (over ~30 days matters), upcoming birthdays (next 30 days),
time-sensitive details (an upcoming race, a move, a hard time), and closeness (close
friends first when other signals tie). Rank details by how useful they are this week:
time-sensitive or emotionally important facts first, stable trivia last.

### Weekly routine (Sunday ~6pm US Eastern)

A scheduled Claude routine runs every week. Each run:

1. Pulls the default branch, reads this file and every `friendo/data/*.js`.
2. Rewrites `friendo/data/priorities.js` (format above), runs `node --check friendo/data/*.js`,
   commits `Friendo: weekly priorities YYYY-MM-DD` and pushes to the default branch
   (pull and rebase first if the push is rejected).
3. Emails laiwong22@gmail.com a short summary (see the routine's prompt for the content).

### Conventions

- Keep arrays newest-first in `moments.js` and `journal.js` (the app sorts anyway); keep
  `friends.js` in the order friends were added.
- Keep the files valid JS: run `node --check friendo/data/*.js` after editing.
- If the user pastes exported file contents from the site, replace the matching data file.

## kaboom/ — live multiplayer quiz game

A static site (no build step) at https://laiwong22.github.io/website_projects/kaboom/. The big
screen runs `host.html`, phones run `index.html` and tap 1–4, and `edit.html` builds quizzes. The user
guide is `kaboom/README.md`.

**How it connects:** there is no backend. The host browser tab is the game server. It registers on the
public PeerJS relay as `kaboom-lw22-<6-digit PIN>`, and phones open WebRTC data channels to it
(`serialization: "json"`). All state (players, answers, scores) lives in `host.js`, and closing the host
tab ends the game. `?peer=host:port` on any page points it at a self-hosted PeerServer (for testing).

**Messages** (all JSON objects with a `t` field):
- phone → host: `join {pid, name, avatar}` (also used to reconnect with the same `pid`), `answer {q, choice}`, `pong`
- host → phone: `view {view}` (the phone renders `view.screen`: `lobby`, `intro`, `question`, `answered`,
  `wait`, `result`, `standing`, `end`), `reject {reason, msg}`, `kicked`, `closed`, `replaced` (another tab
  took over this player; the phone stops and offers "Play here instead"), `ping` (every 4s)
- The host builds each phone's view in `viewFor()` and re-sends it on every phase change. The phone keeps no
  game state of its own, so a reconnect just gets the current view.

**Leaving and coming back** (phones switching apps, locking, reopening the link):
- The phone saves `{pin, pid, name, avatar}` under `kaboom.player` in sessionStorage *and* localStorage
  (4-hour expiry), so a reload, a new tab, a rescanned QR code or retyping the PIN all rejoin as the same player.
- Every rejoin creates a fresh PeerJS peer (a socket that slept in the background can look open but be dead),
  with an 8s timeout; it reconnects at once on `visibilitychange`, `online` and `pageshow`.
- Host `handleJoin`: a known `pid` reattaches (`attach()`, which sends `replaced` to any older connection).
  An unknown `pid` with an existing nickname takes that player over (`rekey()`, keeping the score) if the old
  connection is gone or doesn't answer a ping within 2.5s; otherwise it's refused as "already playing".
  Taking over is allowed even when the game is locked.

**Quizzes** live only in the browser's `localStorage["kaboom.quizzes"]` (seeded with the sample
"Kaboom warm-up"), so there are no quiz files in the repo. Format (see `KB.normalizeQuestion` in `js/shared.js`):
`{id, title, updated, questions: [{id, type: "quiz"|"tf", text, image, answers: [4 strings], correct: [indexes]}]}`.
Export/import uses `{kaboom: 1, quizzes: [...]}` JSON files; `kaboom/quiz-template.json` is the hand-editing
template (keep it valid and in sync with the format, and see "Quiz files" in `kaboom/README.md`). Import also
accepts a bare quiz or a list of quizzes, retries after fixing curly quotes and trailing commas, gives every
imported question a fresh id, and accepts `correct` as a single number. Blank answers are dropped at play time,
so the options are always numbered 1..n. **Quiz links** (`KB.importFromLink` in `js/shared.js`): `host.html#quiz=z.<data>` or
`edit.html#quiz=z.<data>`, where `<data>` is base64url (no padding) of the raw-deflate-compressed quiz file JSON (`j.` + plain
base64url also works); give the quiz a stable `id` so reopening the link updates it instead of duplicating it. Use this to
hand the user a ready-to-play quiz without putting its answers in the public repo.

**Scoring** (`scoreQuestion` in `host.js`): a right answer earns `round(1000 * (1 - t/T/2))`, plus a streak
bonus of `min((streak-1)*100, 500)`. On a multi-answer question any right option counts.

**Look and feel:** a cartoon style (thick `--outline` borders, hard drop shadows, spinning sunburst background).
The host character is **Granny Boom**, an original cartoon grandma with a bazooka, drawn as inline SVG in
`js/fx.js` (`KBFx.granny({mood: "happy"|"shout"|"shock", say, flip, cls})`, plus `KBFx.say`, `KBFx.fire` and
`KBFx.muzzle`). `KBFx.rocket(from, to)` flies a rocket along an arc and resolves on impact; `KBFx.explode(at, {size, word})`
draws a comic explosion; `KBFx.wreck(el, seed)` leaves wreckage on a blown-up answer (hole, cracks, scorch, flames,
smoke, rubble; the same seed draws the same wreck, which is how the host's reveal screen redraws identical damage).
On phones, tapping an answer keeps it (`.chosen`) and fires rockets at every other option (`fireAt` in `play.js`; incoming
views wait in `P.pendingView` until it finishes). On the host, `blastWrong()` fires at each wrong tile when time's up.
Her lines live in `LINES` in `host.js` and `play.js`.

**Game modes** (`js/modes.js`): a mode is `{id, name, icon, tagline, create(H)}`. On Open lobby / Play again
the host calls `create(H)` with its helpers (`H` at the bottom of `host.js`) and gets optional hooks, listed
at the top of `modes.js`: `isContestant`, lobby `chipActions`/`onChipAction`/`lobbyNote`, `canStart`, `onStart`,
`beginQuestion` (take over before answering, then call `H.startAnswering(true)`), `adjustPoints`, `afterScore`,
`afterReveal`, `sideExtras`, `boardExtras`, `podiumActions`, `onPrimary`, `onAct`, `onMessage`, `onRoster`, `render(phase)`
and `view(p, v)`. Phone screens for a mode register in `KB.phoneScreens[name] = (view, kit) => …`.
**Classic has no hooks**, so the host runs its original code; keep it that way (the user falls back on it).

**Grandma's Favorite** (`js/modes/`): `favorite-rules.js` holds the pure rules and the `CONFIG` (works in the browser as
`KBFavRules` and in Node for tests); `favorite.js` is the host side; `favorite-phone.js` the phone screens. The Grandma is
the player with `p.role === 'grandma'` (set from the lobby menu); she isn't a contestant. Players get a public `tag`
(pickers use it; the `pid` stays private). Extra phases: `pick` → `pickwait` → `crown` → Classic `question`/`reveal`
(+ the spotlight overlay) → `board`; after `podium`: `verdict` → `recap`. The Favorite Spotlight runs `SPOTLIGHT_BUILDUP_MS`
of drumroll, then cheer (`S.cheer`) or shame (`S.boo`) until `SPOTLIGHT_MS`; those crowd sounds return a stop function
that Skip calls. Grandma's phone sends `fav-pick {tag}` and
`fav-lock {tag}`; phone screens are `fav-pickme`, `fav-crowned`, `fav-picked`, `gm-lobby`, `gm-pick`, `gm-wait`,
`gm-result`, `gm-end`.

**Tests:** `node --test kaboom/tests/*.test.js` (rules, no setup). End-to-end Playwright games live in
`kaboom/tests/e2e/*.e2e.js` (Classic, reconnect, Grandma's Favorite); `kaboom/tests/README.md` explains how to run them and
has the manual checklist. Rerun `classic.e2e.js` after any host change to make sure Classic still plays the same.

**Conventions**
- Keep it dependency-free apart from `kaboom/vendor/` (PeerJS 1.5.5 and qrcode-generator 1.4.4, MIT).
  Don't switch to CDN copies.
- Music and SFX are synthesized in `js/sound.js`; keep them original.
- Run `node --check kaboom/js/*.js` after editing. For an end-to-end test, run a local PeerServer
  (`npx -p peer peerjs --port 9000 --host 127.0.0.1`), serve the repo root, and drive `host.html?peer=127.0.0.1:9000`
  plus a few phone-sized Playwright contexts. Chromium needs `--disable-features=WebRtcHideLocalIpsWithMdns`.
