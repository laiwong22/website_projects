// Usage: node render.js data.json out.jpg
// Renders the weekly "Week at a Glance" flyer as a 1080x1350 JPEG (Instagram portrait),
// in the layout of the ward's own flyers, with a color theme that changes by month.
const fs = require('fs');
const { chromium } = require('playwright');
const [, , dataPath, outPath] = process.argv;
const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const leaf = c => `<svg viewBox="0 0 24 24" width="54" height="54"><path fill="${c}" d="M12 2l1.6 4.2 3.2-2.1-.6 4 4-.8-2.2 3.4 4 1.3-3.9 1.5 1.5 3.3-3.8-.5.2 4.1L12 17.2 8.8 20.4 9 16.3l-3.8.5 1.5-3.3-3.9-1.5 4-1.3-2.2-3.4 4 .8-.6-4 3.2 2.1z"/><path stroke="#5a3a22" stroke-width="1.2" d="M12 17v6"/></svg>`;
const star = c => `<svg viewBox="0 0 24 24" width="46" height="46"><path fill="${c}" d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z"/></svg>`;
const flake = c => `<svg viewBox="0 0 24 24" width="50" height="50" stroke="${c}" stroke-width="2" stroke-linecap="round"><path d="M12 1v22M2.5 6.5l19 11M2.5 17.5l19-11M9 3l3 3 3-3M9 21l3-3 3 3"/></svg>`;
const heart = c => `<svg viewBox="0 0 24 24" width="46" height="46"><path fill="${c}" d="M12 21s-9-5.6-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.4-9 12-9 12z"/></svg>`;
const flower = c => `<svg viewBox="0 0 24 24" width="50" height="50"><g fill="${c}"><circle cx="12" cy="5.5" r="4"/><circle cx="18.5" cy="12" r="4"/><circle cx="12" cy="18.5" r="4"/><circle cx="5.5" cy="12" r="4"/></g><circle cx="12" cy="12" r="3.2" fill="#f6c453"/></svg>`;
const sun = c => `<svg viewBox="0 0 24 24" width="50" height="50"><circle cx="12" cy="12" r="5" fill="${c}"/><g stroke="${c}" stroke-width="2" stroke-linecap="round"><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></g></svg>`;

// One theme per month: background, row color, row text, ornament, accent (chevrons).
const THEMES = {
  1:  { bg: '#eef3f7', row: '#3d6a8f', text: '#fff', orn: flake, ornC: '#7aa3c4', acc: '#a9c8e0' },   // winter
  2:  { bg: '#fbf0f2', row: '#b5485d', text: '#fff', orn: heart, ornC: '#d97a8c', acc: '#f2a7b5' },   // Valentine's
  3:  { bg: '#f1f6ee', row: '#4f8a4a', text: '#fff', orn: flower, ornC: '#7fb069', acc: '#b8d99a' },  // spring
  4:  { bg: '#f6f1f8', row: '#7c5c9e', text: '#fff', orn: flower, ornC: '#b39ad1', acc: '#f6c453' },  // Easter
  5:  { bg: '#f3f7ef', row: '#5f9a5a', text: '#fff', orn: flower, ornC: '#e98aa6', acc: '#f6c453' },  // late spring
  6:  { bg: '#f2f8fb', row: '#2f8ab3', text: '#fff', orn: sun, ornC: '#f2b134', acc: '#f6c453' },     // summer
  7:  { bg: '#f4f6fb', row: '#2f4e8c', text: '#fff', orn: star, ornC: '#c8323c', acc: '#c8323c' },    // July 4th / Pioneer Day
  8:  { bg: '#fbf6ec', row: '#d9822b', text: '#fff', orn: sun, ornC: '#f2b134', acc: '#f6c453' },     // late summer
  9:  { bg: '#f8f3ea', row: '#b8692e', text: '#fff', orn: leaf, ornC: '#d18a3a', acc: '#e8b04a' },    // early fall
  10: { bg: '#f1f1ef', row: '#d06a2c', text: '#fff', orn: star, ornC: '#333', acc: '#f8b84a' },       // Halloween / fall
  11: { bg: '#f7f0e4', row: '#9c4a23', text: '#fff', orn: leaf, ornC: '#c9772f', acc: '#e3a53b' },    // Thanksgiving
  12: { bg: '#f4f1ea', row: '#2f5d46', text: '#fff', orn: star, ornC: '#b8333c', acc: '#c9a13b' },    // Christmas
};
const t = THEMES[d.month] || THEMES[11];

const n = d.days.length;
const rowH = n >= 4 ? 168 : 200;
const days = d.days.map(x => `
  <div class="row"><div class="box"><div class="dow">${esc(x.dow)}</div><div class="num">${esc(x.num)}</div></div>
  <div class="txt">${esc(x.text)}</div></div>`).join('');
const other = (d.other || []).map(o => `<div>${esc(o)}</div>`).join('');

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Libre+Baskerville&family=Poppins:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1350px;background:${t.bg};color:#222;font-family:'Libre Baskerville',serif;
  display:flex;flex-direction:column;align-items:center;padding:56px 90px 44px;position:relative}
.top{display:flex;align-items:center;justify-content:space-between;width:100%}
.range{font-family:Poppins,sans-serif;font-weight:500;font-size:40px;letter-spacing:.22em;color:#222}
h1{font-family:'Kaushan Script',cursive;font-weight:400;font-size:118px;line-height:1.15;margin:4px 0 26px;color:#222}
.rows{display:flex;flex-direction:column;gap:${n >= 4 ? 20 : 28}px;width:100%;flex:1;justify-content:center}
.row{display:flex;align-items:center;gap:40px;background:${t.row};border-radius:26px;padding:16px;min-height:${rowH}px}
.box{flex:none;width:${rowH - 32}px;align-self:stretch;background:#fff;border-radius:16px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;font-family:Poppins,sans-serif;color:#2a2a2a}
.dow{font-weight:700;font-size:28px}
.num{font-weight:700;font-size:${n >= 4 ? 62 : 74}px;line-height:1.05}
.txt{color:${t.text};font-size:${n >= 4 ? 32 : 36}px;line-height:1.3;padding-right:14px}
.other{width:100%;margin-top:26px;text-align:center;font-size:28px;line-height:1.45;color:#333}
.other b{font-family:Poppins,sans-serif;letter-spacing:.18em;font-size:24px;color:${t.row};display:block;margin-bottom:4px}
.chev{display:flex;gap:10px;margin-top:22px}
.chev span{width:84px;height:44px;background:${t.acc};clip-path:polygon(0 0,70% 0,100% 50%,70% 100%,0 100%,30% 50%)}
</style></head><body>
<div class="top">${t.orn(t.ornC)}<div class="range">${esc(d.range)}</div>${t.orn(t.ornC)}</div>
<h1>Week at a Glance</h1>
<div class="rows">${days}</div>
${other ? `<div class="other"><b>COMING UP</b>${other}</div>` : ''}
<div class="chev"><span></span><span></span><span></span></div>
</body></html>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  if (await p.evaluate(() => document.body.scrollHeight > 1350)) console.error('WARNING: content taller than 1350px, shorten text');
  await p.screenshot({ path: outPath, type: 'jpeg', quality: 90 });
  await b.close();
})();
