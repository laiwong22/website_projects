# Friendo

A personal site for keeping up with your friends and journaling about life with them.
Live at **https://laiwong22.github.io/website_projects/friendo/** once GitHub Pages is on (see below).

- **Friends**: everyone at a glance, sorted by this week's AI priority (or the order you added them, or A–Z).
  You can filter by closeness: acquaintance, friend or close friend.
- **History**: one page per friend. It holds their photo, closeness, an unlimited list of details to remember (sorted by AI importance
  each week), likes and dislikes, and a timeline of every invite, gift and kind act between you.
- **Invites**: every invite in both directions, whether you said yes or turned it down, and who's been inviting whom.
- **Calendar**: a month view of everything, plus a **Year map** where each friend's block grows with how many
  moments you shared and how big they were.
- **Ideas**: suggestions for each friend:
  - birthdays coming up
  - thank-yous you owe
  - making up for an invite you turned down
  - returning invites
  - reconnecting after a month
  - "just because" ideas built around what they like

  Every idea also lists their dislikes so you know what to avoid.
- **Journal**: your private-ish journal in Markdown, linked to the friends in each post.

Every Sunday evening a Claude routine re-ranks your friends and their details and emails you a summary.

## Adding things

1. **Ask Claude.** For example: "Maya invited me to ramen Friday and I said yes",
   "write a journal entry about the hike with Jordan", or "Pri is allergic to peanuts". Claude edits `data/`
   following `../CLAUDE.md` and commits.
2. **Use the site.** Edits are kept in your browser until you press the yellow **Save** button. Connect a
   GitHub token once per device (⚙ in the top right). The site explains how to make one.
   After that, Save writes straight to the repo, so your laptop and phone stay in sync.

## Turning on the web address (one time)

GitHub → this repo → **Settings → Pages** → *Build and deployment*: Source **Deploy from a branch**,
Branch **the default branch** and **/ (root)** → Save. The site appears at the address above within a minute or two.

## Privacy

The repo and the site are public right now, so anyone with the link can read your friends' details, photos and
journal. When you're ready to make it private, the plan is to add sign-in profiles.
