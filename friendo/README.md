# Friendo

A personal site for keeping track of your friends and journaling about life with them.

- **Friends**: everyone in your circle at a glance: when you last saw them, who's been inviting whom, what they like.
- **History**: one page per friend with every time they invited you or did something kind,
  your side of the ledger, and their likes and dislikes (add or remove them inline).
- **Invites**: every invite in both directions, with a "who's been inviting whom" balance.
- **Ideas**: suggestions for what to do for each friend: return an invite you owe, say thanks for something
  recent, plan their upcoming birthday, reconnect after a long gap, or try something built around what they love
  (while avoiding their dislikes). "I did this" logs it for you.
- **Journal**: your blog/journal in Markdown, linked to the friends who appear in each post.

## Using it

Open `index.html` in a browser. Nothing to install.

There are two ways to add things:

1. **Ask Claude** (recommended). For example: "Maya invited me to a ramen night on Friday",
   "write a journal post about the hike with Jordan", or "Pri hates horror movies". Claude
   updates the files in `data/` following the rules in `../CLAUDE.md`, then commits.
2. **Use the buttons on the site.** Browser edits are stored in that browser only. Click
   the yellow **Save** pill to download the updated `data/*.js` files, or copy them and paste them to Claude to commit.

The friends, moments and journal entry that ship with the site are sample data. Replace them with your own.

## Privacy

Everything is stored in this repository. If the repo is public, or you host it with
GitHub Pages, anyone with the link can read it. Keep the repo private if that matters to you.
