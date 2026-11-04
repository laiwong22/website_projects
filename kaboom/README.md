# Kaboom!

A live quiz game for a room full of people. Your computer shows the questions on a big screen,
and everyone answers on their phones by tapping 1–4.

Your host is **Granny Boom**, a cartoon grandma with a bazooka. She cheers players on, heckles slow ones and
blows up every wrong answer when time runs out. When a player taps an answer on their phone, a rocket flies in
and explodes on that button.

Live at **https://laiwong22.github.io/website_projects/kaboom/** once this folder is on the
default branch (GitHub Pages already publishes this repo).

| Page | Who opens it | What it does |
| --- | --- | --- |
| `kaboom/` | Players, on their phones | Enter the PIN (or scan the QR code), pick a nickname and an avatar, then tap 1–4 |
| `kaboom/host.html` | You, on the computer hooked to the TV or projector | Pick a quiz and a timer, open the lobby, run the game |
| `kaboom/edit.html` | You | Build and edit quizzes |

## Running a game

1. Open **host.html** on the big-screen computer, pick a quiz and the time per question, and click **Open lobby**.
2. Players go to the address on screen and type the 6-digit PIN, or scan the QR code. Their names pop up in the lobby.
   Click a name to remove someone, or **Lock game** to stop new people joining.
3. Click **Start game** (or press Space). For each question:
   - the question shows alone for a few seconds, then the 4 colored answers appear and the timer's fuse starts burning;
   - phones show only the numbered buttons, so players have to look at the big screen. Tapping one fires a rocket
     at it (it explodes, and the answer is locked in);
   - when the fuse runs out, or everyone has answered, Granny fires her bazooka: a rocket hits each wrong answer,
     it goes **KABOOM**, and the right answer lights up with a chart of how many people picked each option;
   - **Leaderboard** shows the top 5, then **Next question**.
4. At the end a podium shows the top 3 while Granny shoots fireworks. You can see all results, download a CSV, or **Play again**
   with the same players (pick the same quiz or another one).

Keyboard on the host screen: **Space / Enter / →** to go to the next step, **M** to mute, **F** for full screen.

Keep the host tab open and in front for the whole game. That tab *is* the game server, so closing or
reloading it ends the game for everyone.

## Scoring

- A right answer is worth 500–1000 points: the faster you answer, the more you get.
- Answer streaks add a bonus: +100 for 2 in a row, +200 for 3, and so on, up to +500.
- On questions with more than one right answer, picking any of them counts.
- No answer or a wrong answer scores 0 and resets the streak.

## Making quizzes (edit.html)

- **Multiple choice**: fill in 2 to 4 answers and tap ✓ on every right one.
- **True or false**: tap ✓ on True or False. Phones show only buttons 1 and 2.
- **Images**: upload a picture (it's shrunk automatically) or paste an `https://` image link.
  Images only show on the big screen.
- Quizzes save automatically **in the browser you edit them in**. Host from the same browser, or use
  **Export** and then **Import** to move them to another computer. Exports are also your backup.
- Unfinished questions (no text, no right answer marked, or fewer than 2 answers) are skipped when you host.

## Good to know

- No accounts or servers to set up. Phones reach the host screen through PeerJS, a free public relay
  that connects browsers directly to each other.
- Players can be on any network (home Wi-Fi, school Wi-Fi or cellular data). A very strict office or school network
  may block the connection. If a phone can't join, try it on cellular data.
- If a phone locks, leaves the browser or drops out, it rejoins by itself and keeps its score when the player
  comes back. Reopening the link, rescanning the QR code or typing the PIN again also gets them straight back in.
  On a different phone or browser, typing the same nickname reclaims their spot (as long as the old one is no
  longer connected). Players who join late start at 0.
- Built and tested for 15–40 players; it allows up to 100.
- Music and sound effects are made in the browser, so there are no audio files. Use the 🔊 button (or M) to mute.
  Phones stay silent and buzz when their rocket hits.
- All the cartoon art (Granny, rockets, explosions) is drawn in code as SVG, so there are no image files either.
  If a device asks for reduced motion, the effects are toned down.

## Files

```
kaboom/
  index.html      player page (phones)
  host.html       big screen
  edit.html       quiz editor
  css/kaboom.css  all styles
  js/shared.js    shared helpers, quiz format, sample quiz
  js/play.js      player logic
  js/host.js      game server and big-screen logic
  js/edit.js      editor logic
  js/fx.js        Granny Boom, rockets and explosions (cartoon SVG + CSS animation)
  js/sound.js     synthesized music and sound effects
  vendor/         PeerJS 1.5.5 and qrcode-generator 1.4.4 (MIT, see vendor/LICENSES.md)
```
