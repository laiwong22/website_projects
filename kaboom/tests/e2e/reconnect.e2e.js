// Kaboom end-to-end test (Playwright). See kaboom/tests/README.md for how to run it.
// Phones leaving the browser and coming back. Reports each scenario instead of stopping at the first failure.
const { chromium, devices } = require('playwright');
const BASE = process.env.KABOOM_URL || 'http://127.0.0.1:8000/kaboom/';
const PQ = 'peer=' + (process.env.KABOOM_PEER || '127.0.0.1:9000');
const OUT = process.env.KABOOM_SHOTS || require('os').tmpdir() + '/kaboom-shots';
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const report = (name, ok, detail) => {
  results.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  console.log(results[results.length - 1]);
};
const screenText = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 160));

(async () => {
  const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const errors = [];
  const watch = (page, label) => page.on('pageerror', (e) => errors.push(label + ': ' + e.message));
  const phone = devices['iPhone 13'];

  const host = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  watch(host, 'host');
  await host.goto(BASE + 'host.html?' + PQ);
  await host.click('[data-timer="90"]');
  await host.click('[data-act="open"]');
  await host.waitForSelector('.big-pin');
  const pin = (await host.textContent('.big-pin')).replace(/\D/g, '');
  const link = BASE + '?pin=' + pin + '&' + PQ;

  async function join(ctx, name, viaLink) {
    const page = await ctx.newPage();
    watch(page, name);
    if (viaLink) await page.goto(link);
    else {
      await page.goto(BASE + '?' + PQ);
      await page.fill('#pin', pin);
      await page.click('button[type=submit]');
    }
    await page.waitForSelector('#name');
    await page.fill('#name', name);
    await page.click('button[type=submit]');
    await page.waitForSelector('text=Look for your name', { timeout: 10000 });
    return page;
  }
  const anaCtx = await browser.newContext({ ...phone });
  const benCtx = await browser.newContext({ ...phone });
  let cyCtx = await browser.newContext({ ...phone });
  let ana = await join(anaCtx, 'Ana', false);
  let ben = await join(benCtx, 'Ben', true);
  let cy = await join(cyCtx, 'Cy', true);

  // Q1: everyone answers, so everybody has points to keep
  await host.click('[data-act="start"]');
  await host.waitForSelector('[data-act="skip-intro"]');
  await host.click('[data-act="skip-intro"]');
  for (const p of [ana, ben, cy]) {
    await p.waitForSelector('.ans-btn');
    await p.click('[data-choice="1"]');
  }
  await host.waitForSelector('.bars', { timeout: 15000 });
  await host.click('[data-act="next"]');
  await host.click('[data-act="next-q"]');
  await host.click('[data-act="skip-intro"]');
  await Promise.all([ana, ben, cy].map((p) => p.waitForSelector('.ans-btn', { timeout: 10000 })));
  const score = async (p) => (await p.textContent('.p-bar .score')).trim();
  const before = { ana: await score(ana), ben: await score(ben), cy: await score(cy) };
  console.log('scores before', before);

  // S1: Ana leaves the browser, then reopens the join link (new tab on the same phone).
  await ana.close();
  await sleep(1500);
  ana = await anaCtx.newPage();
  watch(ana, 'Ana2');
  await ana.goto(link);
  try {
    await ana.waitForSelector('.ans-btn, #name', { timeout: 12000 });
    if (await ana.$('#name')) {
      await ana.fill('#name', 'Ana');
      await ana.click('button[type=submit]');
      await sleep(2500);
    }
    const ok = !!(await ana.$('.ans-btn'));
    report('S1 reopen link in a new tab', ok && (await score(ana)) === before.ana, ok ? 'score ' + (await score(ana)) : await screenText(ana));
  } catch (e) {
    report('S1 reopen link in a new tab', false, await screenText(ana));
  }

  // S2: Cy's browser lost everything (in-app browser closed); opens the link fresh and types the same name.
  await cyCtx.close();
  await sleep(1500);
  cyCtx = await browser.newContext({ ...phone });
  cy = await cyCtx.newPage();
  watch(cy, 'Cy2');
  await cy.goto(link);
  await cy.waitForSelector('#name');
  await cy.fill('#name', 'cy');
  await cy.click('button[type=submit]');
  try {
    await cy.waitForSelector('.ans-btn', { timeout: 8000 });
    report('S2 same nickname from a fresh browser', (await score(cy)) === before.cy, 'score ' + (await score(cy)));
  } catch (e) {
    report('S2 same nickname from a fresh browser', false, await screenText(cy));
  }

  // S3: Ben switches apps: hidden + pagehide, then his page's JavaScript is stuck for 20s, then he's back.
  await ben.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
  });
  const frozen = ben.evaluate(() => {
    const end = Date.now() + 20000;
    while (Date.now() < end) {}
  });
  await sleep(17000);
  const countAway = await host.textContent('#count-pill');
  await frozen;
  await ben.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const t0 = Date.now();
  try {
    await host.waitForFunction(() => document.getElementById('count-pill').textContent.trim() === '👥 3', null, { timeout: 15000 });
    await ben.waitForSelector('.ans-btn', { timeout: 5000 });
    await ben.waitForFunction(() => document.getElementById('reconnect').hidden, null, { timeout: 5000 });
    report('S3 switch apps for 20s and come back', (await score(ben)) === before.ben, 'host saw him back in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's; host showed "' + countAway.trim() + '" while away');
  } catch (e) {
    report('S3 switch apps for 20s and come back', false, 'host ' + (await host.textContent('#count-pill')).trim() + '; phone: ' + (await screenText(ben)));
  }

  // S4: Ana now has a second tab open on the same game: only one should play, with no tug-of-war.
  const ana2 = await anaCtx.newPage();
  watch(ana2, 'Ana-tab2');
  await ana2.goto(link);
  await sleep(10000);
  const t2 = !!(await ana2.$('.ans-btn'));
  const t1 = await screenText(ana);
  const chips = await host.textContent('#count-pill');
  report('S4 second tab on the same phone', t2 && /another tab|Play here/i.test(t1), 'tab2 playing=' + t2 + '; tab1: ' + t1.slice(0, 70) + '; host ' + chips.trim());
  await ana2.screenshot({ path: OUT + '/r-tab2.png' });
  await ana.screenshot({ path: OUT + '/r-tab1.png' });

  // S5: someone else tries a nickname that is still playing
  const evil = await (await browser.newContext({ ...phone })).newPage();
  await evil.goto(link);
  await evil.waitForSelector('#name');
  await evil.fill('#name', 'Ben');
  await evil.click('button[type=submit]');
  try {
    await evil.waitForSelector('text=Pick another nickname', { timeout: 8000 });
    report('S5 nickname still in use is refused', true);
  } catch (e) {
    report('S5 nickname still in use is refused', false, await screenText(evil));
  }

  // A fresh question that all three rejoined phones answer.
  if (await host.$('[data-act="end-q"]')) await host.click('[data-act="end-q"]');
  await host.waitForSelector('[data-act="next"]', { timeout: 20000 });
  await sleep(300);
  await host.click('[data-act="next"]');
  await host.click('[data-act="next-q"]');
  await host.click('[data-act="skip-intro"]');
  for (const p of [ana2, ben, cy]) {
    await p.waitForSelector('.ans-btn', { timeout: 10000 });
    await p.click('[data-choice="1"]');
  }
  await host.waitForSelector('.bars', { timeout: 20000 });
  const answers = await host.$$eval('.bar .lbl', (els) => els.reduce((n, e) => n + Number(e.textContent.replace(/\D/g, '')), 0));
  report('Answers from rejoined phones count', answers === 3, answers + ' answers received');
  const hostChips = await host.evaluate(() => document.getElementById('count-pill').textContent);
  console.log('host players pill:', hostChips.trim());
  console.log('page errors:', errors.length ? errors : 'none');
  console.log('\n' + results.join('\n'));
  await browser.close();
})().catch((e) => {
  console.error('CRASH', e);
  console.log('\n' + results.join('\n'));
  process.exit(1);
});
