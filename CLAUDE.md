# website_projects

## kindred/ — friends tracker + journal

A static site (no build step). Open `kindred/index.html` directly in a browser.
All data lives in three plain JS files that Claude edits when the user asks:

| File | What it holds |
| --- | --- |
| `kindred/data/friends.js` | One object per friend: who they are, likes, dislikes |
| `kindred/data/moments.js` | Every invite and every kind act, in both directions |
| `kindred/data/journal.js` | Journal / blog entries (Markdown) |

The sample people (Maya, Jordan, Priya) and their moments/entry are placeholders.
When the user adds their first real friends, ask whether to delete the samples.

### friends.js

```js
{
  "id": "maya",                 // unique, lowercase slug; referenced by moments & journal
  "name": "Maya Chen",          // required
  "nickname": "Maya",           // optional, used in suggestions ("Your turn to invite Maya")
  "birthday": "03-14",          // optional, MM-DD (drives birthday suggestions)
  "met": "College roommate, 2018",
  "likes": ["spicy ramen", "pottery"],     // short phrases; they feed the Ideas tab
  "dislikes": ["cilantro", "loud bars"],
  "notes": "What's going on in their life"
}
```

### moments.js

```js
{
  "id": "2026-09-27-maya-pottery",   // unique; convention: date-friend-keyword
  "date": "2026-09-27",              // YYYY-MM-DD
  "type": "invite",                  // "invite" | "kindness" (helped me, gift, check-in…)
  "from": "them",                    // "them" = they did it for me, "me" = I did it for them
  "friends": ["maya"],               // one or more friend ids
  "title": "Pottery studio open night",
  "outcome": "went",                 // invites only: "went" | "upcoming" | "couldn't go" | "declined"
  "notes": "optional detail"
}
```

Examples of how to translate what the user says:
- "Maya invited me to her birthday dinner Saturday" → `type: "invite", from: "them"`, `outcome: "upcoming"` if it's in the future.
- "Jordan helped me fix my bike" → `type: "kindness", from: "them"`.
- "I invited Pri to brunch" → `type: "invite", from: "me"`.
- If they mention a new like or dislike ("she hates cilantro"), add it to that friend too.
- If a friend isn't in `friends.js` yet, add them (ask for anything important you can't infer).

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
  `-` / `1.` lists, `>` quotes, `---` rules, `[links](https://…)`.
- Writing posts: write in the user's first-person voice, keep their words and details,
  and don't invent events. Tag friends who appear. Offer a draft before committing if the
  user hasn't said to go ahead.
- When a post describes an invite or a kind act, also log it in `moments.js`.

### Conventions

- Keep arrays newest-first in `moments.js` and `journal.js` (the app sorts anyway).
- Keep the files valid JS: run `node --check kindred/data/*.js` after editing.
- Edits made in the browser live in localStorage until exported with the "Save" button;
  if the user pastes exported file contents, replace the matching data file with them.
