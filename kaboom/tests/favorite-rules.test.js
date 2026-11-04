// Unit tests for Grandma's Favorite rules. Run from the repo root:  node --test kaboom/tests
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/modes/favorite-rules.js');

const players = (...specs) =>
  specs.map((s) => (typeof s === 'string' ? { pid: s, name: s.toUpperCase(), online: true } : Object.assign({ online: true }, s)));
const reasons = (elig) => Object.fromEntries(elig.list.map((x) => [x.pid, x.reason || 'ok']));

test('config has the documented defaults', () => {
  assert.equal(R.CONFIG.LOBBY_SECONDS, 10);
  assert.equal(R.CONFIG.FAVORITE_MULTIPLIER, 1.25);
  assert.equal(R.CONFIG.SPOTLIGHT_MS, 2000);
  assert.equal(R.CONFIG.EXTRA_PICK_ALLOWANCE, 0);
  assert.equal(R.CONFIG.GRANDMA_WINS_TIES, false);
});

test('pick limit is ceil(questions / players) plus the allowance', () => {
  assert.equal(R.maxPicks(7, 3), 3);
  assert.equal(R.maxPicks(6, 3), 2);
  assert.equal(R.maxPicks(10, 4), 3);
  assert.equal(R.maxPicks(3, 5), 1);
  assert.equal(R.maxPicks(6, 3, 1), 3);
});

test('everyone is eligible on the first round', () => {
  const e = R.eligibility(players('a', 'b', 'c'), { lastPid: null, counts: {}, max: 2 });
  assert.deepEqual(reasons(e), { a: 'ok', b: 'ok', c: 'ok' });
  assert.equal(e.relaxed, '');
  assert.equal(e.none, false);
});

test('last round’s Favorite is grayed out (no back-to-back)', () => {
  const e = R.eligibility(players('a', 'b', 'c'), { lastPid: 'b', counts: { b: 1 }, max: 2 });
  assert.deepEqual(reasons(e), { a: 'ok', b: 'picked last round', c: 'ok' });
  assert.equal(R.isEligible(e, 'b'), false);
  assert.equal(R.isEligible(e, 'a'), true);
});

test('a player who used up their picks is grayed out, with picks-used counts', () => {
  const e = R.eligibility(players('a', 'b', 'c'), { lastPid: 'c', counts: { a: 2, c: 1 }, max: 2 });
  assert.deepEqual(reasons(e), { a: 'limit reached', b: 'ok', c: 'picked last round' });
  assert.deepEqual(
    e.list.map((x) => x.used),
    [2, 0, 1]
  );
});

test('if nobody is eligible, the back-to-back rule is dropped first', () => {
  // a is at the limit, b was picked last round
  const e = R.eligibility(players('a', 'b'), { lastPid: 'b', counts: { a: 2, b: 1 }, max: 2 });
  assert.equal(e.relaxed, 'back-to-back');
  assert.deepEqual(reasons(e), { a: 'limit reached', b: 'ok' });
});

test('then the limit is dropped too', () => {
  const e = R.eligibility(players('a', 'b'), { lastPid: 'b', counts: { a: 2, b: 2 }, max: 2 });
  assert.equal(e.relaxed, 'back-to-back+limit');
  assert.deepEqual(reasons(e), { a: 'ok', b: 'ok' });
});

test('offline players are never pickable, even when rules relax', () => {
  const e = R.eligibility(players({ pid: 'a', online: false }, 'b'), { lastPid: 'b', counts: { b: 1 }, max: 2 });
  assert.deepEqual(reasons(e), { a: 'offline', b: 'ok' });
  assert.equal(e.relaxed, 'back-to-back');
  const none = R.eligibility(players({ pid: 'a', online: false }), { lastPid: null, counts: {}, max: 2 });
  assert.equal(none.none, true);
  assert.equal(R.isEligible(none, 'a'), false);
});

test('late joiners start with no picks and the same limit', () => {
  const e = R.eligibility(players('a', 'b', 'late'), { lastPid: 'a', counts: { a: 1, b: 1 }, max: 1 });
  assert.deepEqual(reasons(e), { a: 'picked last round', b: 'limit reached', late: 'ok' });
});

test('the Favorite multiplier applies only to a correct Favorite', () => {
  assert.equal(R.favoritePoints(800, true, true), 1000);
  assert.equal(R.favoritePoints(777, true, true), 971); // 971.25 rounds
  assert.equal(R.favoritePoints(0, true, false), 0);
  assert.equal(R.favoritePoints(800, false, true), 800);
  assert.equal(R.favoritePoints(800, true, true, 2), 1600);
});

test('pick outcomes: hit, miss, timeout is a miss, disconnect is void', () => {
  assert.equal(R.pickOutcome({ present: true, answered: true, correct: true }), 'hit');
  assert.equal(R.pickOutcome({ present: true, answered: true, correct: false }), 'miss');
  assert.equal(R.pickOutcome({ present: true, answered: false, correct: false }), 'miss');
  assert.equal(R.pickOutcome({ present: false, answered: true, correct: true }), 'void');
  assert.equal(R.pickOutcome(null), 'void');
});

test('room rate counts a non-answer as wrong', () => {
  const q = R.roomQuestion([
    { answered: true, correct: true },
    { answered: true, correct: false },
    { answered: false, correct: false },
    { answered: true, correct: true },
  ]);
  assert.deepEqual(q, { correct: 2, opportunities: 4 });
});

test('hit rate leaves out void picks; room rate is correct / answers expected', () => {
  const s = R.stats([{ status: 'hit' }, { status: 'miss' }, { status: 'void' }, { status: 'hit' }], { correct: 11, opportunities: 18 });
  assert.equal(s.hits, 2);
  assert.equal(s.validPicks, 3);
  assert.equal(s.voids, 1);
  assert.equal(s.favoriteHitRate, 2 / 3);
  assert.equal(s.roomCorrectRate, 11 / 18);
  assert.equal(R.tallyText(s), "Grandma's picks: 2/3 (67%) vs. Room: 61%");
});

test('Grandma wins only by beating the room; ties go to the room by default', () => {
  const win = R.stats([{ status: 'hit' }, { status: 'hit' }, { status: 'miss' }], { correct: 5, opportunities: 10 });
  assert.equal(R.grandmaWins(win), true);
  const lose = R.stats([{ status: 'hit' }, { status: 'miss' }, { status: 'miss' }], { correct: 5, opportunities: 10 });
  assert.equal(R.grandmaWins(lose), false);
  // 2/3 vs 4/6 is an exact tie
  const tie = R.stats([{ status: 'hit' }, { status: 'hit' }, { status: 'miss' }], { correct: 4, opportunities: 6 });
  assert.equal(R.grandmaWins(tie), false);
  assert.equal(R.grandmaWins(tie, true), true);
});

test('no valid picks at all cannot beat the room', () => {
  const s = R.stats([{ status: 'void' }], { correct: 3, opportunities: 6 });
  assert.equal(s.validPicks, 0);
  assert.equal(R.grandmaWins(s), false);
  const empty = R.stats([], { correct: 0, opportunities: 0 });
  assert.equal(R.grandmaWins(empty), false); // 0 vs 0 is a tie: the room
});

test('most trusted is the player with the most correct picks (ties shared)', () => {
  const picks = [
    { pid: 'a', name: 'Ana', status: 'hit' },
    { pid: 'b', name: 'Ben', status: 'hit' },
    { pid: 'a', name: 'Ana', status: 'hit' },
    { pid: 'b', name: 'Ben', status: 'miss' },
    { pid: 'c', name: 'Cy', status: 'void' },
  ];
  assert.deepEqual(R.mostTrusted(picks), [{ pid: 'a', name: 'Ana', hits: 2 }]);
  picks.push({ pid: 'b', name: 'Ben', status: 'hit' });
  assert.deepEqual(
    R.mostTrusted(picks).map((x) => x.name),
    ['Ana', 'Ben']
  );
  assert.deepEqual(R.mostTrusted([{ pid: 'a', name: 'Ana', status: 'miss' }]), []);
});
