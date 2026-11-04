/* Kaboom game modes.

   A mode is { id, name, icon, tagline, create(H) }. The host calls create(H) when a lobby opens (and on
   Play again) with its own helpers H, and gets back an object of optional hooks. Classic has no hooks,
   so the host runs exactly its original code. Hooks the host calls (all optional):

     isContestant(p)            false for players who don't answer (e.g. Grandma)
     chipActions(p) / chipBadge(p) / onChipAction(act, p) / lobbyNote() / lobbyHint
                                lobby: extra actions when the host clicks a player, and a status line
     canStart()                 '' or a warning that blocks Start
     onStart()                  game is starting (reset mode state)
     beginQuestion()            return true to take over before answering opens; call H.startAnswering(true)
     onAnswerStart() / onAnswer(p)
     adjustPoints(p, points)    points for a correct answer (after speed and streak)
     afterScore()               scoring done for this question (G.ranked is fresh)
     afterReveal()              the reveal is on screen; may hold G.revealReady = false for an extra beat
     sideExtras()               HTML for the right column of the question and reveal screens
     boardExtras() / podiumActions()
     onPrimary()                Space/Enter/→: return true if the mode handled it
     onAct(act, el)             a click on a [data-act] the host doesn't know
     onMessage(p, msg)          a phone message the host doesn't know
     onRoster()                 a player joined, left, or went on/offline
     render(phase)              draw a phase the host doesn't know
     view(p, v)                 adjust (or replace) the view sent to a phone

   Phone screens for a mode register in KB.phoneScreens[screenName] = (view, api) => {...}. */
(function () {
  'use strict';

  const modes = [];
  KB.MODES = modes;
  KB.phoneScreens = KB.phoneScreens || {};

  KB.registerMode = function (def) {
    if (!modes.some((m) => m.id === def.id)) modes.push(def);
    return def;
  };
  KB.getMode = (id) => modes.find((m) => m.id === id) || modes[0];

  KB.registerMode({
    id: 'classic',
    name: 'Classic',
    icon: '💣',
    tagline: 'Everyone answers. Fast right answers score the most.',
  });
})();
