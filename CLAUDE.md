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

## foothill-ysa/ — Foothill YSA (FYSAA) ward texting + announcements

Static site on GitHub Pages (`foothill-ysa/`, no build step) backed by **Supabase** (Postgres,
email-link logins, Deno edge functions) and **Twilio** (SMS). Setup steps: `foothill-ysa/SETUP.md`.

- Public: `index.html` (Announcements / Calendar / Get texts) and `u.html?t=TOKEN` (manage/unsubscribe).
  Admin console: `admin/` (roles `owner` > `admin` > `member`; members can sign in but see nothing private).
- `config.js` holds only public values (Supabase URL + anon key, Twilio number). Empty → demo mode with
  sample data from `assets/common.js`. **Never commit secrets**; they live in Supabase Edge Function secrets.
- **Phone numbers must never be stored in the repo** (it's public). They live only in the `subscribers` table.
- Schema: `supabase/migrations/*.sql` (add a new migration file for changes; don't edit the applied one).
  Functions: `subscribe` (web form, double opt-in), `manage` (personal link), `twilio-inbound`
  (JOIN / group keywords / LEAVE x / NAME x / STOP / START, else → Inbox), `dispatch` (sends now +
  scheduled via `supabase/cron.sql`), `reply` (Inbox replies).
- Announcements (texts) and calendar events are separate tables; adding an event never texts anyone.
- Checks after editing: `node --check foothill-ysa/assets/*.js foothill-ysa/config.js` and
  `cd foothill-ysa/supabase/functions && deno check */index.ts` (install deno with `npm i -g deno` if missing).
- Deploy functions: `cd foothill-ysa && npx supabase link --project-ref <ref> && npx supabase functions deploy`
  (needs `SUPABASE_ACCESS_TOKEN` in the environment).
