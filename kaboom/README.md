# Kaboom!

A live quiz game for a room full of people. Your computer shows the questions on a big screen,
and everyone answers on their phones by tapping 1–4.

Your host is **Granny Boom**, a cartoon grandma with a bazooka. She cheers players on, heckles slow ones and
blows up every wrong answer when time runs out. When a player taps an answer on their phone, their choice lights
up and rockets blow up all the other options, leaving wreckage behind.

Live at **https://laiwong22.github.io/website_projects/kaboom/** once this folder is on the
default branch (GitHub Pages already publishes this repo).

| Page | Who opens it | What it does |
| --- | --- | --- |
| `kaboom/` | Players, on their phones | Enter the PIN (or scan the QR code), pick a nickname and an avatar, then tap 1–4 |
| `kaboom/host.html` | You, on the computer hooked to the TV or projector | Pick a quiz and a timer, open the lobby, run the game |
| `kaboom/edit.html` | You | Build and edit quizzes |

## Running a game

1. Open **host.html** on the big-screen computer, pick a game mode (see [Game modes](#game-modes)), a quiz and the time
   per question, and click **Open lobby**.
2. Players go to the address on screen and type the 6-digit PIN, or scan the QR code. Their names pop up in the lobby.
   Click a name to remove someone, or **Lock game** to stop new people joining.
3. Click **Start game** (or press Space). For each question:
   - the question shows alone for a few seconds, then the 4 colored answers appear and the timer's fuse starts burning;
   - phones show only the numbered buttons, so players have to look at the big screen. Tapping one locks it in
     (it's sent right away, so the animation never costs points): it glows with a ✓ while rockets blow up the
     other options;
   - when the fuse runs out, or everyone has answered, Granny fires her bazooka: a rocket hits each wrong answer,
     it goes **KABOOM** and leaves wreckage (a hole, cracks, flames and smoke), and the right answer lights up with
     a chart of how many people picked each option;
   - **Leaderboard** shows the top 5, then **Next question**.
4. At the end a podium shows the top 3 while Granny shoots fireworks. You can see all results, download a CSV, or **Play again**
   with the same players (pick the same quiz or another one).

Keyboard on the host screen: **Space / Enter / →** to go to the next step, **M** to mute, **F** for full screen.

Keep the host tab open and in front for the whole game. That tab *is* the game server, so closing or
reloading it ends the game for everyone.

## Game modes

Pick the mode on the host's start screen. **Classic** is the game described above and never changes.

### Grandma's Favorite

One person, the guest of honor who wrote the quiz, plays as **Grandma**. She doesn't answer questions.
Before each question she picks one player as her **Favorite**. If the Favorite gets it right, their points
for that question are multiplied by 1.25. Grandma has her own goal: her Favorites have to beat the room.

1. **Choosing Grandma:** in the lobby, click a player and choose **Make Grandma**. Her phone becomes the
   Grandma controller, and she's left out of the leaderboard and the podium. You need at least 2 other players.
2. **Pick Me (10 seconds):** the big screen shows the question and its answers, locked. Everyone lobbies
   Grandma out loud while she picks on her phone. **Lock in** ends the window early; otherwise whoever she has
   selected locks when time runs out. If she hasn't picked, the game waits, and the host can use
   **🎲 Random pick** or **Pick for Grandma** (handy if her phone dies).
3. **Crown:** a 👑 lands on the Favorite's name, and it stays there while everyone answers like in Classic.
4. **Reveal:** the usual Classic reveal, then the **Favorite Spotlight**: a drumroll, then about 3½ seconds of
   cheer or shame. A right answer gets a cheering crowd, hearts, confetti, celebration rockets and
   "GRANDMA'S FAVORITE! 💖". A miss gets a playful crowd boo, the crown tumbling off, a little rain cloud and
   Granny shaking her head. Press **Skip** or Space to cut it short.
5. **Leaderboard:** the normal one, plus Grandma's tally, e.g. `Grandma's picks: 5/7 (71%) vs. Room: 61%`.
6. **End:** the podium, then **Grandma's Verdict** (did her picks beat the room's correct rate?), then the
   **Favorites recap** with every pick and the most trusted player.

Pick rules (Grandma's phone grays out anyone she can't pick, and says why):
- Nobody can be the Favorite two rounds in a row.
- Each player can be picked at most `ceil(questions ÷ players)` times (players counted at the start).
- If nobody is left, the back-to-back rule is dropped first, then the limit. Late joiners can be picked too.

How Grandma's score works:
- **Her hit rate** is her Favorites' right answers divided by her picks.
- **The room's rate** is every right answer divided by every answer expected; a missing answer counts as wrong.
- **A Favorite who runs out of time** counts as a miss.
- **A Favorite who disconnects** before the reveal voids that pick: it doesn't count either way, and there's no bonus.
- **Grandma wins** only if her rate is higher. A tie goes to the room.

Settings are in one place, at the top of `js/modes/favorite-rules.js`: `LOBBY_SECONDS` (10),
`FAVORITE_MULTIPLIER` (1.25), `SPOTLIGHT_MS` (4500, the whole spotlight), `SPOTLIGHT_BUILDUP_MS` (1000, the drumroll
before the cheer or shame), `EXTRA_PICK_ALLOWANCE` (0), `GRANDMA_WINS_TIES` (false).
The crown fanfare, sparkle, sigh and the crowd cheering and booing are synthesized like the other sounds; there are
no audio files.

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

## Quiz files (Import and Export)

The quiz builder imports **`.json` quiz files**: the ones its **Export** button makes, or one you write yourself
starting from [`quiz-template.json`](quiz-template.json) (also linked in the quiz builder, under Import).
One file can hold several quizzes:

```json
{
  "kaboom": 1,
  "quizzes": [
    {
      "title": "My quiz",
      "questions": [
        { "type": "quiz", "text": "Which planet is known as the Red Planet?",
          "answers": ["Venus", "Mars", "Jupiter", "Mercury"], "correct": [1], "image": "" },
        { "type": "tf", "text": "An octopus has three hearts.", "correct": [0], "image": "" }
      ]
    }
  ]
}
```

| Field | What to put |
| --- | --- |
| `title` | The quiz name (up to 80 characters) |
| `type` | `"quiz"` for multiple choice, `"tf"` for true or false |
| `text` | The question (up to 200 characters) |
| `answers` | Multiple choice only: 2 to 4 answers, each in quotes (up to 80 characters each). Leave it out for true or false |
| `correct` | Which answers are right, **counting from 0**: `0` = answer 1, `1` = answer 2, `2` = answer 3, `3` = answer 4. Several can be right: `[0, 2]`. For true or false, `[0]` = True and `[1]` = False |
| `image` | Optional: an `https://` link to a picture, or `""` for none. You can also add pictures in the builder after importing |

Tips:

- Edit the file in a plain-text editor (Notepad, TextEdit in plain-text mode, VS Code). Kaboom fixes curly
  "smart" quotes and a comma after the last item by itself. Other typos, like a missing comma or quote, stop that
  file from importing, and the message says which line to look at.
- Every text goes in straight double quotes, and items in a list are separated by commas.
- Questions with a problem (no text, fewer than 2 answers, no right answer marked) still import. They're marked
  red with what's missing, and they're skipped when you host until you fix them. Import never deletes or changes
  your other quizzes.

### Quiz links

A quiz can also travel inside a link, ready to play with no file to import:
`…/kaboom/host.html#quiz=<data>` (opens the host screen with the quiz added and picked) or `…/kaboom/edit.html#quiz=<data>`
(opens it in the quiz builder). The quiz data lives only in the link, never on the website, so the answers stay private.
Open the link on the computer you'll host from; opening it again just updates the same quiz. Ask Claude to make one
from a quiz file.

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
  js/fx.js        Granny Boom, rockets, explosions, hearts and smoke (cartoon SVG + CSS animation)
  js/sound.js     synthesized music and sound effects
  js/modes.js     game mode registry (Classic, and the hooks a mode can use)
  js/modes/       Grandma's Favorite: favorite-rules.js (rules + settings), favorite.js (big screen),
                  favorite-phone.js (phone screens)
  tests/          unit tests, end-to-end tests and the manual checklist (see tests/README.md)
  vendor/         PeerJS 1.5.5 and qrcode-generator 1.4.4 (MIT, see vendor/LICENSES.md)
```
