// Kaboom end-to-end test (Playwright). See kaboom/tests/README.md for how to run it.
// Grandma's Favorite end-to-end: 1 host, Grandma, 3 players, all 7 sample questions.
// r1 correct Favorite · r2 selection auto-locks at window end, wrong Favorite · r3 Favorite times out (+ skip spotlight)
// r4 Favorite disconnects (void) then rejoins · r5 Grandma disconnects, host picks for her, she rejoins
// r6 back-to-back graying · r7 limit-reached graying + Random pick · verdict + recap + play again.
const { chromium, devices } = require('playwright');
const BASE = process.env.KABOOM_URL || 'http://127.0.0.1:8000/kaboom/';
const PQ = 'peer=' + (process.env.KABOOM_PEER || '127.0.0.1:9000');
const OUT = process.env.KABOOM_SHOTS || require('os').tmpdir() + '/kaboom-shots';
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => {
  const line = (ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '');
  results.push(line);
  console.log(line);
};
const txt = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());

(async () => {
  const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const watch = (page, label) => {
    page.on('pageerror', (e) => errors.push(label + ': ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Could not connect to peer|Lost connection to server/.test(m.text())) errors.push(label + ' console: ' + m.text());
    });
  };
  const phone = devices['iPhone 13'];
  const host = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  watch(host, 'host');
  await host.goto(BASE + 'host.html?' + PQ);
  await host.click('[data-mode="favorite"]');
  await host.click('[data-timer="20"]');
  await host.screenshot({ path: OUT + '/g00-setup.png' });
  await host.click('[data-act="open"]');
  await host.waitForSelector('.big-pin');
  const pin = (await host.textContent('.big-pin')).replace(/\D/g, '');
  const link = BASE + '?pin=' + pin + '&' + PQ;

  const ctxs = {};
  const P = {};
  async function open(name) {
    if (!ctxs[name]) ctxs[name] = await browser.newContext({ ...phone });
    const page = await ctxs[name].newPage();
    watch(page, name);
    await page.goto(link);
    P[name] = page;
    return page;
  }
  async function join(name) {
    const page = await open(name);
    await page.waitForSelector('#name');
    await page.fill('#name', name);
    await page.click('button[type=submit]');
    await page.waitForSelector('text=Look for your name', { timeout: 10000 });
  }
  const note = async () => (await host.textContent('#lobby-note')).trim();
  const startDisabled = () => host.$eval('[data-act="start"]', (b) => b.disabled);

  // ---------- lobby ----------
  await join('Gran');
  await join('Ana');
  check('Start blocked without a Grandma', (await startDisabled()) && /Make Grandma/.test(await note()), await note());
  await host.click('.player-chip:has-text("Gran")');
  await host.screenshot({ path: OUT + '/g01-player-menu.png' });
  await host.click('[data-menu="grandma"]');
  await P.Gran.waitForSelector('text=Pick who knows you best', { timeout: 8000 });
  check('Make Grandma switches her phone to the Grandma controller', true);
  check('Start blocked with only 1 player besides Grandma', (await startDisabled()) && /at least 2 players/.test(await note()), await note());
  await join('Ben');
  await join('Cy');
  await sleep(300);
  check('Start allowed with Grandma + 3 players', !(await startDisabled()) && /Grandma \(Gran\)/.test(await note()), await note());
  await host.screenshot({ path: OUT + '/g02-lobby.png' });
  await P.Gran.screenshot({ path: OUT + '/g03-gm-lobby.png' });

  const answer = async (name, choice) => {
    await P[name].waitForSelector('.ans-btn', { timeout: 15000 });
    await P[name].click('[data-choice="' + choice + '"]');
  };
  const reasons = async () => {
    await P.Gran.waitForSelector('.gm-player', { timeout: 12000 });
    return P.Gran.$$eval('.gm-player', (els) => Object.fromEntries(els.map((e) => [e.querySelector('b').textContent, e.querySelector('.why') ? e.querySelector('.why').textContent : 'ok'])));
  };
  const gmPick = async (name, lockIt) => {
    await P.Gran.waitForSelector('.gm-player', { timeout: 12000 });
    await P.Gran.click('.gm-player:has-text("' + name + '")');
    if (lockIt) await P.Gran.click('#gm-lock');
  };
  const tally = async () => (await host.textContent('.fav-tally')).trim();
  async function toBoard() {
    await host.waitForSelector('[data-act="next"]', { timeout: 30000 });
    await host.waitForFunction(() => !document.querySelector('.fav-spot'), null, { timeout: 8000 });
    await sleep(150);
    await host.click('[data-act="next"]');
  }
  async function nextQ() {
    await host.waitForSelector('[data-act="next-q"]');
    await host.click('[data-act="next-q"]');
    await host.waitForSelector('.fav-banner', { timeout: 8000 });
  }

  // ---------- round 1: correct Favorite ----------
  await host.click('[data-act="start"]');
  await host.waitForSelector('.fav-banner');
  await P.Ana.waitForSelector('text=Convince Grandma', { timeout: 8000 });
  check('R1 pick window: banner on host, Pick Me on phones', /Who.s Grandma.s Favorite/.test(await host.textContent('.fav-banner')) && !!(await host.$('.tiles-locked')));
  await sleep(600);
  await host.screenshot({ path: OUT + '/g04-host-pick.png' });
  await P.Ana.screenshot({ path: OUT + '/g05-phone-pickme.png' });
  await P.Gran.screenshot({ path: OUT + '/g06-gm-pick.png' });
  const r1 = await reasons();
  check('R1 everyone eligible', Object.values(r1).every((r) => r === 'ok'), JSON.stringify(r1));
  await gmPick('Ana', true);
  await host.waitForSelector('.crown-card', { timeout: 5000 });
  check('R1 Lock in ends the window early and crowns Ana', (await host.textContent('.crown-name')) === 'Ana');
  await P.Ana.waitForSelector('text=Get it right for 1.25', { timeout: 5000 });
  await P.Ben.waitForSelector('text=Grandma picked Ana', { timeout: 5000 });
  check('R1 phones: Favorite sees the crown, others see who was picked', true);
  await sleep(500);
  await host.screenshot({ path: OUT + '/g07-host-crown.png' });
  await P.Ana.screenshot({ path: OUT + '/g08-phone-crowned.png' });
  await P.Ben.screenshot({ path: OUT + '/g09-phone-picked.png' });
  await host.waitForSelector('#timer', { timeout: 5000 });
  check('R1 crown stays on the Favorite while answering', /Ana/.test(await host.textContent('#fav-badge')));
  await answer('Ana', 1);
  await P.Gran.waitForSelector('text=locked in an answer', { timeout: 8000 });
  const gwait = await txt(P.Gran);
  check('R1 Grandma sees the Favorite locked in, not which answer', !/Mars|Venus|Jupiter|Mercury/.test(gwait), gwait.slice(0, 90));
  await P.Gran.screenshot({ path: OUT + '/g10-gm-wait.png' });
  await host.screenshot({ path: OUT + '/g11-host-question.png' });
  await answer('Ben', 2);
  await answer('Cy', 1);
  await host.waitForSelector('.fav-spot', { timeout: 20000 });
  await host.waitForSelector('.fav-spot.hit', { timeout: 5000 });
  await sleep(350);
  await host.screenshot({ path: OUT + '/g12-spotlight-hit.png' });
  check('R1 spotlight: GRANDMA’S FAVORITE!', /GRANDMA.S FAVORITE/.test(await host.textContent('.fav-spot')));
  await P.Ana.waitForSelector('text=Favorite bonus', { timeout: 8000 });
  const pts = Number((await P.Ana.textContent('.points')).replace(/\D/g, ''));
  const bonus = Number((await P.Ana.textContent('.fav-bonus')).replace(/\D/g, ''));
  check('R1 Favorite points are 1.25×', Math.abs(Math.round((pts - bonus) * 1.25) - pts) <= 1, 'total +' + pts + ' (base ' + (pts - bonus) + ', bonus ' + bonus + ')');
  await P.Ana.screenshot({ path: OUT + '/g13-phone-bonus.png' });
  await P.Gran.waitForSelector('text=Ana got it', { timeout: 8000 });
  await P.Gran.screenshot({ path: OUT + '/g14-gm-hit.png' });
  await toBoard();
  await host.waitForSelector('.fav-tally');
  check('R1 tally strip', (await tally()) === "👵 Grandma's picks: 1/1 (100%) vs. Room: 67%", await tally());
  const boardNames = await host.$$eval('.lb-row .nm', (els) => els.map((e) => e.textContent));
  check('Leaderboard leaves Grandma out', !boardNames.includes('Gran') && boardNames.length === 3, boardNames.join(', '));
  await host.screenshot({ path: OUT + '/g15-board.png' });

  // ---------- round 2: selection auto-locks when the window ends; wrong Favorite ----------
  await nextQ();
  const r2 = await reasons();
  check('R2 last round’s Favorite grayed out', r2.Ana === 'picked last round' && r2.Ben === 'ok' && r2.Cy === 'ok', JSON.stringify(r2));
  await P.Gran.screenshot({ path: OUT + '/g16-gm-gray.png' });
  await gmPick('Ben', false);
  await host.waitForSelector('.crown-card', { timeout: 14000 });
  check('R2 a selection without Lock in locks when time runs out', (await host.textContent('.crown-name')) === 'Ben');
  await answer('Ana', 0);
  await answer('Ben', 1);
  await answer('Cy', 0);
  await host.waitForSelector('.fav-spot.miss', { timeout: 25000 });
  await sleep(500);
  await host.screenshot({ path: OUT + '/g17-spotlight-miss.png' });
  check('R2 spotlight: Grandma’s disappointed', /disappointed/.test(await host.textContent('.fav-spot')));
  await P.Ben.screenshot({ path: OUT + '/g18-phone-fav-miss.png' });
  await toBoard();
  check('R2 tally', (await tally()) === "👵 Grandma's picks: 1/2 (50%) vs. Room: 67%", await tally());

  // ---------- round 3: the Favorite doesn't answer (miss); host skips the spotlight ----------
  await nextQ();
  const r3 = await reasons();
  check('R3 back-to-back rule moves on', r3.Ben === 'picked last round' && r3.Ana === 'ok', JSON.stringify(r3));
  await gmPick('Ana', true);
  await host.waitForSelector('#timer', { timeout: 6000 });
  await answer('Ben', 0);
  await answer('Cy', 1);
  await sleep(400);
  await host.click('[data-act="end-q"]');
  await host.waitForSelector('.fav-spot.miss', { timeout: 15000 });
  const t0 = Date.now();
  await host.keyboard.press('ArrowRight');
  await host.waitForFunction(() => !document.querySelector('.fav-spot'), null, { timeout: 3000 });
  check('R3 Favorite who doesn’t answer is a miss; spotlight skippable', Date.now() - t0 < 1000, 'closed in ' + (Date.now() - t0) + 'ms');
  await toBoard();
  check('R3 tally', (await tally()) === "👵 Grandma's picks: 1/3 (33%) vs. Room: 56%", await tally());

  // ---------- round 4: the Favorite disconnects (void), then rejoins ----------
  await nextQ();
  await gmPick('Ben', true);
  await host.waitForSelector('#timer', { timeout: 6000 });
  await ctxs.Ben.close();
  delete ctxs.Ben;
  await host.waitForFunction(() => /\/ 4/.test(document.getElementById('count-pill').textContent), null, { timeout: 15000 });
  await answer('Ana', 3);
  await answer('Cy', 3);
  await host.waitForSelector('[data-act="next"]', { timeout: 15000 });
  await sleep(700);
  const badge4 = await host.textContent('#fav-badge');
  check('R4 disconnected Favorite: pick void, no spotlight', !(await host.$('.fav-spot')) && /void/.test(badge4), badge4.trim());
  await P.Gran.waitForSelector('text=Ben disconnected', { timeout: 8000 });
  await P.Gran.screenshot({ path: OUT + '/g19-gm-void.png' });
  await open('Ben');
  await P.Ben.waitForSelector('#name');
  await P.Ben.fill('#name', 'Ben');
  await P.Ben.click('button[type=submit]');
  await P.Ben.waitForSelector('.p-bar:not([hidden])', { timeout: 10000 });
  await toBoard();
  check('R4 void pick left out of Grandma’s tally', (await tally()) === "👵 Grandma's picks: 1/3 (33%) vs. Room: 58%", await tally());

  // ---------- round 5: Grandma disconnects; host picks for her; she rejoins ----------
  await P.Gran.close();
  await host.waitForFunction(() => /\/ 4/.test(document.getElementById('count-pill').textContent), null, { timeout: 15000 });
  await nextQ();
  await host.waitForSelector('.fav-banner.waiting', { timeout: 14000 });
  check('R5 Grandma offline: game waits, host sees it', /offline/.test(await host.textContent('#fav-panel')), (await host.textContent('#fav-panel')).trim().slice(0, 60));
  await host.click('[data-act="fav-hostpick"]');
  const benChip = await host.$eval('[data-act="fav-choose"]:has-text("Ben")', (b) => b.disabled);
  check('R5 host chooser respects the rules (Ben grayed)', benChip === true);
  await host.screenshot({ path: OUT + '/g20-host-pickwait.png' });
  await host.click('[data-act="fav-choose"]:has-text("Ana")');
  await host.waitForSelector('.crown-card', { timeout: 5000 });
  check('R5 Pick for Grandma works', /picked by the host/.test(await host.textContent('.crown-card')));
  await open('Gran');
  await P.Gran.waitForSelector('text=Your Favorite', { timeout: 15000 });
  check('R5 Grandma rejoins straight into her controller', true);
  await answer('Ana', 1);
  await answer('Ben', 1);
  await answer('Cy', 0);
  await host.waitForSelector('.fav-spot.hit', { timeout: 25000 });
  await toBoard();
  check('R5 tally', (await tally()) === "👵 Grandma's picks: 2/4 (50%) vs. Room: 60%", await tally());

  // ---------- round 6: Ana was just picked (and is at her limit) ----------
  await nextQ();
  const r6 = await reasons();
  check('R6 graying', r6.Ana === 'picked last round' && r6.Ben === 'ok' && r6.Cy === 'ok', JSON.stringify(r6));
  const dots = await P.Gran.$$eval('.gm-player .dots', (els) => els.map((e) => e.textContent));
  check('R6 picks-used dots (limit 3)', dots.join(' ') === '●●● ●●○ ○○○', dots.join(' '));
  await gmPick('Cy', true);
  await answer('Ana', 0);
  await answer('Ben', 1);
  await answer('Cy', 1);
  await host.waitForSelector('.fav-spot.hit', { timeout: 25000 });
  await toBoard();
  check('R6 tally', (await tally()) === "👵 Grandma's picks: 3/5 (60%) vs. Room: 61%", await tally());

  // ---------- round 7: limit reached; Grandma stalls; host uses Random pick ----------
  await nextQ();
  const r7 = await reasons();
  check('R7 limit reached + back-to-back', r7.Ana === 'limit reached' && r7.Cy === 'picked last round' && r7.Ben === 'ok', JSON.stringify(r7));
  await P.Gran.screenshot({ path: OUT + '/g21-gm-limit.png' });
  await host.waitForSelector('.fav-banner.waiting', { timeout: 14000 });
  await host.click('[data-act="fav-random"]');
  await host.waitForSelector('.crown-card', { timeout: 5000 });
  check('R7 Random pick takes the only eligible player', (await host.textContent('.crown-name')) === 'Ben');
  await answer('Ana', 2);
  await answer('Ben', 0);
  await answer('Cy', 2);
  await host.waitForSelector('.fav-spot.miss', { timeout: 25000 });
  await host.waitForSelector('[data-act="next"]', { timeout: 30000 });
  await host.waitForFunction(() => !document.querySelector('.fav-spot'), null, { timeout: 8000 });
  await host.click('[data-act="next"]');

  // ---------- final screens ----------
  await host.waitForSelector('.podium');
  await sleep(4600);
  const podium = await host.$$eval('.place .nm', (els) => els.map((e) => e.textContent));
  check('Podium leaves Grandma out', !podium.includes('Gran'), podium.join(', '));
  await host.click('[data-act="fav-verdict"]');
  await host.waitForSelector('.verdict-head.show', { timeout: 5000 });
  await sleep(500);
  const verdict = await txt(host);
  check('Verdict: 50% vs 62%, the room wins', /50%/.test(verdict) && /62%/.test(verdict) && /THE ROOM KNOWS GRANDMA BETTER/.test(verdict), verdict.slice(0, 140));
  await host.screenshot({ path: OUT + '/g22-verdict.png' });
  await P.Ana.waitForSelector('text=THE ROOM KNOWS GRANDMA BETTER', { timeout: 8000 });
  await P.Gran.waitForSelector('text=THE ROOM KNOWS GRANDMA BETTER', { timeout: 8000 });
  await P.Gran.screenshot({ path: OUT + '/g23-gm-end.png' });
  await host.click('[data-act="fav-recap"]');
  await host.waitForSelector('.recap');
  const rows = await host.$$eval('.recap-row', (els) => els.map((e) => e.querySelector('.rw').textContent.replace(/[^A-Za-z]/g, '') + e.querySelector('.rm').textContent));
  check('Recap rows', rows.join(' ') === 'Ana✓ Ben✗ Ana✗ Ben⚪ Ana✓ Cy✓ Ben✗', rows.join(' '));
  check('Most trusted: Ana', /Most trusted: Ana \(2 correct picks\)/.test(await host.textContent('.recap-trusted')), (await host.textContent('.recap-trusted')).trim());
  await host.screenshot({ path: OUT + '/g24-recap.png' });

  // play again keeps Grandma
  await host.click('[data-act="again"]');
  await host.waitForSelector('.big-pin');
  await P.Gran.waitForSelector('text=Pick who knows you best', { timeout: 8000 });
  check('Play again keeps the same Grandma', /Grandma/.test(await host.textContent('.player-chip:has-text("Gran")')));

  console.log('page errors:', errors.length ? errors : 'none');
  console.log('\n' + results.filter((r) => r.startsWith('FAIL')).join('\n') || 'ALL PASS');
  console.log(results.filter((r) => r.startsWith('PASS')).length + ' passed, ' + results.filter((r) => r.startsWith('FAIL')).length + ' failed');
  await browser.close();
})().catch(async (e) => {
  console.error('CRASH', e.message.split('\n').slice(0, 6).join('\n'));
  console.log(results.join('\n'));
  process.exit(1);
});
