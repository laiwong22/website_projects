/* Grandma's Favorite: the rules, with no screen code, so the browser and the unit tests share them.
   In the browser this file sets window.KBFavRules; in Node it is require()-able. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KBFavRules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- config: tweak the mode here ----------
  const CONFIG = {
    LOBBY_SECONDS: 10, // the "Pick Me" window before answering opens
    FAVORITE_MULTIPLIER: 1.25, // points multiplier when the Favorite answers correctly
    SPOTLIGHT_MS: 2000, // length of the Favorite Spotlight after the reveal
    EXTRA_PICK_ALLOWANCE: 0, // extra picks allowed per player on top of ceil(questions / players)
    GRANDMA_WINS_TIES: false, // false: a tie between Grandma and the room goes to the room
    ANNOUNCE_MS: 1500, // the crown announcement
  };

  // Most times one player can be Grandma's Favorite in a game.
  function maxPicks(totalQuestions, playerCount, extra) {
    const allowance = extra == null ? CONFIG.EXTRA_PICK_ALLOWANCE : extra;
    if (!playerCount) return totalQuestions + allowance;
    return Math.ceil(totalQuestions / playerCount) + allowance;
  }

  // Who Grandma can pick this round.
  //   candidates: [{ pid, name, online }] for every non-Grandma player (late joiners included)
  //   state: { lastPid, counts: { pid: picksSoFar }, max }
  // Returns { list: [{ pid, name, used, eligible, reason }], relaxed, none }.
  // If nobody is eligible, the back-to-back rule is dropped first, then the limit. Offline players
  // are never pickable (a disconnected Favorite would only void the round).
  function eligibility(candidates, state) {
    const counts = (state && state.counts) || {};
    const max = state && state.max != null ? state.max : Infinity;
    const lastPid = state && state.lastPid;
    const tiers = [
      { backToBack: true, limit: true, relaxed: '' },
      { backToBack: false, limit: true, relaxed: 'back-to-back' },
      { backToBack: false, limit: false, relaxed: 'back-to-back+limit' },
    ];
    let list = [];
    for (const tier of tiers) {
      list = candidates.map((c) => {
        const used = counts[c.pid] || 0;
        let reason = '';
        if (!c.online) reason = 'offline';
        else if (tier.backToBack && c.pid === lastPid) reason = 'picked last round';
        else if (tier.limit && used >= max) reason = 'limit reached';
        return { pid: c.pid, name: c.name, used, eligible: !reason, reason };
      });
      if (list.some((x) => x.eligible)) return { list, relaxed: tier.relaxed, none: false };
    }
    return { list, relaxed: tiers[tiers.length - 1].relaxed, none: true };
  }

  const isEligible = (elig, pid) => !!elig.list.find((x) => x.pid === pid && x.eligible);

  // Points a player keeps for the question: the Favorite's are multiplied when they're right.
  function favoritePoints(points, isFavorite, correct, multiplier) {
    if (!isFavorite || !correct) return points;
    return Math.round(points * (multiplier == null ? CONFIG.FAVORITE_MULTIPLIER : multiplier));
  }

  // How a pick turned out. fav: { present, answered, correct }.
  //   present = still connected when the answer phase ended; if not, the pick is void.
  //   No answer before time ran out counts as a miss.
  function pickOutcome(fav) {
    if (!fav || !fav.present) return 'void';
    return fav.answered && fav.correct ? 'hit' : 'miss';
  }

  // One question's contribution to the room rate: every non-Grandma player who was in the game when
  // answering opened counts once; a missing answer counts as wrong.
  //   results: [{ answered, correct }] for those players
  function roomQuestion(results) {
    return {
      correct: results.filter((r) => r.answered && r.correct).length,
      opportunities: results.length,
    };
  }

  // picks: [{ status: 'hit'|'miss'|'void' }], room: { correct, opportunities }
  function stats(picks, room) {
    const valid = picks.filter((p) => p.status === 'hit' || p.status === 'miss');
    const hits = valid.filter((p) => p.status === 'hit').length;
    const r = room || { correct: 0, opportunities: 0 };
    return {
      hits,
      validPicks: valid.length,
      voids: picks.length - valid.length,
      favoriteHitRate: valid.length ? hits / valid.length : 0,
      roomCorrect: r.correct,
      roomOpportunities: r.opportunities,
      roomCorrectRate: r.opportunities ? r.correct / r.opportunities : 0,
    };
  }

  // Grandma wins if her hit rate beats the room's. Compared exactly (2/3 equals 4/6).
  function grandmaWins(s, winsTies) {
    const ties = winsTies == null ? CONFIG.GRANDMA_WINS_TIES : winsTies;
    const a = s.validPicks ? s.hits : 0;
    const b = s.validPicks || 1;
    const c = s.roomOpportunities ? s.roomCorrect : 0;
    const d = s.roomOpportunities || 1;
    const lhs = a * d;
    const rhs = c * b;
    if (lhs === rhs) return !!ties;
    return lhs > rhs;
  }

  const pct = (rate) => Math.round(rate * 100) + '%';

  // "Grandma's picks: 5/7 (71%) vs. Room: 61%"
  function tallyText(s) {
    return "Grandma's picks: " + s.hits + '/' + s.validPicks + ' (' + pct(s.favoriteHitRate) + ') vs. Room: ' + pct(s.roomCorrectRate);
  }

  // The player(s) whose picks came good most often. picks: [{ pid, name, status }]
  function mostTrusted(picks) {
    const by = new Map();
    for (const p of picks) {
      if (p.status !== 'hit') continue;
      const e = by.get(p.pid) || { pid: p.pid, name: p.name, hits: 0 };
      e.hits++;
      e.name = p.name;
      by.set(p.pid, e);
    }
    const all = [...by.values()];
    const top = Math.max(0, ...all.map((e) => e.hits));
    return top ? all.filter((e) => e.hits === top) : [];
  }

  return { CONFIG, maxPicks, eligibility, isEligible, favoritePoints, pickOutcome, roomQuestion, stats, grandmaWins, pct, tallyText, mostTrusted };
});
