// Friendo data — AI priorities. Rewritten every week by the "Friendo weekly" routine.
// friends: who to focus on this week, most important first, each with a one-line reason.
// details: for each friend, their detail ids ordered most-important first.
// See CLAUDE.md at the repo root for how this is produced.
window.FC_DATA = window.FC_DATA || {};
window.FC_DATA.priorities = {
  "updated": "2026-10-11",
  "summary": "Make up the game night you missed with Jordan, and get Pri's birthday sorted before the 24th.",
  "friends": [
    { "id": "jordan", "reason": "You turned down his housewarming game night last week and he's job hunting. Make it up to him." },
    { "id": "priya", "reason": "Birthday on Oct 24, and she brought you soup and a cactus when you were sick." },
    { "id": "maya", "reason": "Your ramen night on the 17th is already planned. Ask how marathon training is going." }
  ],
  "details": {
    "maya": ["d-maya-1", "d-maya-3", "d-maya-4", "d-maya-2"],
    "jordan": ["d-jordan-3", "d-jordan-2", "d-jordan-1"],
    "priya": ["d-priya-1", "d-priya-2"]
  }
};
