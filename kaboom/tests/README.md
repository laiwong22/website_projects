# Kaboom tests

## Unit tests (no setup)

Grandma's Favorite rules: pick eligibility (including relaxing the rules when nobody is eligible), the
Favorite multiplier, hit rate and room rate, void picks and the tie rule. From the repo root:

```bash
node --test kaboom/tests/*.test.js
```

## End-to-end tests (Playwright)

Each one plays real games: a host screen plus several phone-sized browsers, connected through a local relay.

- `classic.e2e.js`: a full Classic game, joining, scoring, reload, late join, play again, kick.
- `reconnect.e2e.js`: phones leaving the browser and coming back.
- `favorite.e2e.js`: a full Grandma's Favorite game (every case in the manual checklist below).

They need Playwright with Chromium (`npm i playwright`) and a local PeerServer. Run each of these from the
repo root, in its own terminal:

```bash
npx -p peer peerjs --port 9000 --host 127.0.0.1
```

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

```bash
node kaboom/tests/e2e/favorite.e2e.js
```

Screenshots go to your temp folder (`kaboom-shots`), or to `KABOOM_SHOTS` if you set it. `KABOOM_URL` and
`KABOOM_PEER` change the site address and relay.

## Manual checklist: Grandma's Favorite

Use real phones, or one browser window per person (a private window or another browser for each, so they
don't share a saved player). You need **1 host, 1 Grandma and at least 3 players**.

**Setup**
1. On the host, open `host.html`, pick **Grandma's Favorite**, a quiz, and a timer, then **Open lobby**.
2. Join with 4 phones (say Gran, Ana, Ben, Cy). Before anyone is Grandma, **Start** is grayed out and the
   lobby says to choose a Grandma.
3. Click **Gran → Make Grandma**. Gran's phone switches to "You're Grandma 👵", and her chip shows the 👵 tag.
   With only 1 other player joined, Start stays blocked with "needs at least 2 players besides Grandma".
4. Start the game.

**Correct Favorite**
5. The host shows "Who's Grandma's Favorite?" with a 10-second countdown, the question and the 4 answers
   locked. Players' phones say "🗣️ Convince Grandma to pick you!" with the countdown.
6. On Gran's phone, tap Ana, then **Lock in**: the window ends right away.
7. The host shows the 👑 crown over Ana's name with a fanfare. Ana's phone: "You're Grandma's Favorite!";
   everyone else: "Grandma picked Ana".
8. While answering, the host shows the crown badge with Ana's name. When Ana answers, Gran's phone shows
   "✔ Ana locked in an answer" but **not** which answer.
9. Ana answers right. After the usual reveal, the spotlight shows "GRANDMA'S FAVORITE! 💖" with hearts,
   "+1.25×" and a sparkle sound. Ana's phone shows the Favorite bonus. The leaderboard has the strip
   "Grandma's picks: 1/1 (100%) vs. Room: …%", and Gran isn't on the leaderboard.

**Wrong Favorite, and graying**
10. Next round, Ana is grayed out on Gran's phone, tagged "picked last round". Each player shows ●○ dots for
    picks used.
11. Gran taps Ben but doesn't press Lock in: when the countdown ends, Ben is locked in anyway.
12. Ben answers wrong: the spotlight shows Grandma shaking her head, a smoke puff on Ben's name,
    "Grandma's disappointed 😤" and a sigh. Press **Skip** or Space to cut it short.

**Favorite who times out**
13. Pick a Favorite who doesn't answer. When time runs out (or the host clicks **End now**), it counts as a
    miss.

**Favorite who disconnects**
14. Pick a Favorite, then close their browser tab while answering. At the reveal there's no spotlight, the
    host's badge says "pick void", Gran's phone says they disconnected, and the tally doesn't change.

**Grandma disconnects**
15. Close Gran's tab before a round. When the countdown ends, the host shows "Waiting for Grandma…" and
    "Grandma is offline". Use **🎲 Random pick** or **Pick for Grandma** (grayed-out players can't be chosen).
    Reopen the join link on Gran's phone: she lands straight back in her Grandma screen.

**Pick limit**
16. Keep picking the same two people. Once someone has used up their picks (the limit is questions ÷ players,
    rounded up), they're grayed out as "limit reached".

**End of the game**
17. After the podium, **Grandma's Verdict** shows "Grandma's picks X% vs. Room Y%" and either
    "GRANDMA KNOWS WHO KNOWS HER BEST 👵💖" or "THE ROOM KNOWS GRANDMA BETTER 😤" (a tie goes to the room).
18. **Favorites recap** lists every question with who was picked and ✓/✗ (⚪ for void), plus "Most trusted".
19. **Play again** keeps the same Grandma.

**Classic still the same**
20. Host a Classic game. It plays exactly as before: no Grandma, no pick window, and clicking a name in the
    lobby asks to remove that player.
