// Kaboom end-to-end test (Playwright). See kaboom/tests/README.md for how to run it.
const { chromium, devices } = require('playwright');
const BASE = process.env.KABOOM_URL || 'http://127.0.0.1:8000/kaboom/';
const PQ = 'peer=' + (process.env.KABOOM_PEER || '127.0.0.1:9000');
const OUT = process.env.KABOOM_SHOTS || require('os').tmpdir() + '/kaboom-shots';
require('fs').mkdirSync(OUT, { recursive: true });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'] });
  const watch = (page, label) => {
    page.on('console', (m) => { if (m.type() === 'error') errors.push(label + ': ' + m.text()); });
    page.on('pageerror', (e) => errors.push(label + ' PAGEERROR: ' + e.message));
  };

  // ---------- host ----------
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await hostCtx.newPage();
  watch(host, 'host');
  await host.goto(BASE + 'host.html?' + PQ);
  await host.click('[data-timer="10"]');
  await host.screenshot({ path: OUT + '/1-setup.png' });
  await host.click('[data-act="open"]');
  await host.waitForSelector('.big-pin', { timeout: 15000 });
  const pin = (await host.textContent('.big-pin')).replace(/\D/g, '');
  console.log('PIN', pin);

  // ---------- players ----------
  const phone = devices['iPhone 13'];
  const players = [];
  const names = ['Ana', 'Ben', 'Cy'];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ ...phone });
    const page = await ctx.newPage();
    watch(page, names[i]);
    if (i === 2) {
      // QR-style link with PIN prefilled
      await page.goto(BASE + '?pin=' + pin + '&' + PQ);
    } else {
      await page.goto(BASE + '?' + PQ);
      await page.fill('#pin', pin.slice(0, 3) + ' ' + pin.slice(3));
      await page.click('button[type=submit]');
    }
    await page.waitForSelector('#name', { timeout: 15000 });
    if (i === 0) await page.screenshot({ path: OUT + '/2-phone-name.png' });
    await page.fill('#name', names[i]);
    await page.click('[data-av]:nth-child(' + (i * 3 + 2) + ')');
    await page.click('button[type=submit]');
    await page.waitForSelector('text=Look for your name', { timeout: 10000 });
    players.push(page);
  }
  await players[0].screenshot({ path: OUT + '/3-phone-lobby.png' });

  // duplicate name is rejected
  const dupCtx = await browser.newContext({ ...phone });
  const dup = await dupCtx.newPage();
  watch(dup, 'dup');
  await dup.goto(BASE + '?pin=' + pin + '&' + PQ);
  await dup.waitForSelector('#name');
  await dup.fill('#name', 'ana');
  await dup.click('button[type=submit]');
  await dup.waitForSelector('text=is already playing', { timeout: 10000 });
  console.log('dup name rejected OK');
  // wrong PIN
  await dup.click('#change-pin');
  await dup.fill('#pin', '111111');
  await dup.click('button[type=submit]');
  await dup.waitForSelector('text=No game found', { timeout: 20000 });
  console.log('wrong pin OK');

  await host.waitForFunction(() => document.querySelectorAll('.player-chip').length === 3);
  await sleep(500);
  await host.screenshot({ path: OUT + '/4-lobby.png' });

  // ---------- play ----------
  // correct choice index per sample question (first correct one)
  const correct = [1, 0, 2, 3, 1, 1, 2];
  for (let q = 0; q < 7; q++) {
    await host.click('[data-act="start"], [data-act="next-q"]');
    await host.waitForSelector('.intro');
    if (q === 0) {
      await host.screenshot({ path: OUT + '/5-intro.png' });
      await players[0].screenshot({ path: OUT + '/5b-phone-intro.png' });
    }
    await host.click('[data-act="skip-intro"]');
    await host.waitForSelector('#timer');
    await Promise.all(players.map((p) => p.waitForSelector('.ans-btn', { timeout: 10000 })));
    if (q === 0) {
      await sleep(1200);
      await host.screenshot({ path: OUT + '/6-question.png' });
      await players[0].screenshot({ path: OUT + '/6b-phone-question.png' });
    }
    if (q === 1) {
      await players[1].screenshot({ path: OUT + '/6c-phone-tf.png' });
      await host.screenshot({ path: OUT + '/6d-host-tf.png' });
    }
    if (q === 3) {
      // Cy reloads the page mid-question and should land back in the game
      const before = await players[2].textContent('.p-bar .score');
      await players[2].reload();
      await players[2].waitForSelector('.ans-btn', { timeout: 15000 });
      const after = await players[2].textContent('.p-bar .score');
      console.log('reload resume OK, score', before, '->', after);
    }
    // Ana: always right, fast. Ben: always wrong. Cy: right on even questions, slower.
    await players[0].click('[data-choice="' + correct[q] + '"]');
    if (q === 0) {
      await sleep(260);
      await players[0].screenshot({ path: OUT + '/7a-phone-rocket.png' });
      await sleep(330);
      await players[0].screenshot({ path: OUT + '/7b-phone-boom.png' });
    }
    await players[0].waitForSelector('text=Locked in!');
    if (q === 0) await players[0].screenshot({ path: OUT + '/7-phone-locked.png' });
    await sleep(300);
    const n = await players[1].locator('.ans-btn').count();
    await players[1].click('[data-choice="' + ((correct[q] + 1) % n) + '"]');
    if (q === 2) {
      // let the timer run out for Cy on this one
    } else {
      await sleep(700);
      await players[2].click('[data-choice="' + (q % 2 === 0 ? correct[q] : (correct[q] + 1) % n) + '"]');
    }
    if (q === 0) {
      await host.waitForSelector('.granny.firing', { timeout: 15000 });
      await sleep(420);
      await host.screenshot({ path: OUT + '/8a-host-rocket.png' });
      await sleep(300);
      await host.screenshot({ path: OUT + '/8a2-host-boom.png' });
      await sleep(500);
      await host.screenshot({ path: OUT + '/8a3-host-boom.png' });
    }
    await host.waitForSelector('.bars', { timeout: 15000 });
    if (q === 0) {
      await host.screenshot({ path: OUT + '/8-reveal.png' });
      await players[0].screenshot({ path: OUT + '/8b-phone-correct.png' });
      await players[1].screenshot({ path: OUT + '/8c-phone-wrong.png' });
    }
    if (q === 2) {
      await players[2].screenshot({ path: OUT + '/8d-phone-timeout.png' });
      await host.screenshot({ path: OUT + '/8e-reveal-multi.png' });
    }
    if (q === 4) {
      // late joiner
      const lateCtx = await browser.newContext({ ...phone });
      const late = await lateCtx.newPage();
      watch(late, 'late');
      await late.goto(BASE + '?pin=' + pin + '&' + PQ);
      await late.waitForSelector('#name');
      await late.fill('#name', 'Dee');
      await late.click('button[type=submit]');
      await late.waitForSelector('text=joined mid-question', { timeout: 10000 });
      console.log('late join OK');
      players.push(late);
    }
    const res = await Promise.all(players.map((p) => p.textContent('h2')));
    console.log('Q' + (q + 1), 'phones:', res.join(' | '));
    await host.click('[data-act="next"]');
    if (q < 6) {
      await host.waitForSelector('.board');
      if (q === 1) {
        await sleep(600);
        await host.screenshot({ path: OUT + '/9-board.png' });
        await players[1].screenshot({ path: OUT + '/9b-phone-standing.png' });
      }
    }
  }
  await host.waitForSelector('.podium');
  await sleep(4500);
  await host.screenshot({ path: OUT + '/10-podium.png' });
  await players[0].screenshot({ path: OUT + '/10b-phone-end.png' });
  const ends = await Promise.all(players.map((p) => p.textContent('h2')));
  console.log('END phones:', ends.join(' | '));
  const lb = await host.$$eval('.place', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')));
  console.log('podium', lb);

  // play again keeps players
  await host.click('[data-act="again"]');
  await host.waitForSelector('.big-pin');
  await Promise.all(players.map((p) => p.waitForSelector('text=Look for your name', { timeout: 10000 })));
  console.log('play again OK, chips:', await host.locator('.player-chip').count());

  // kick
  host.once('dialog', (d) => d.accept());
  await host.click('.player-chip >> text=Ben');
  await players[1].waitForSelector('text=You were removed', { timeout: 10000 });
  console.log('kick OK');

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => {
  console.error('FAILED', e);
  console.log('ERRORS:', errors.join('\n'));
  process.exit(1);
});
