/* Kaboom cartoon effects: Granny Boom (the host), rockets and explosions. Shared by the host and player pages. */
(function () {
  'use strict';

  const FX = (window.KBFx = {});
  const OUT = '#1b1233';

  FX.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  FX.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  FX.pick = (list) => list[Math.floor(Math.random() * list.length)];

  function layer() {
    let l = document.getElementById('fx');
    if (!l) {
      l = document.createElement('div');
      l.id = 'fx';
      l.className = 'fx-layer';
      l.setAttribute('aria-hidden', 'true');
      document.body.appendChild(l);
    }
    return l;
  }

  // ---------- Granny Boom ----------
  const SKIN = '#f8c9a4';
  const HAIR = '#ece8f4';
  const CARDI = '#d6457f';
  const S5 = 'stroke="' + OUT + '" stroke-width="5"';

  const MOUTHS = {
    happy:
      '<path d="M94,130 Q110,151 126,130 Q110,137 94,130 Z" fill="#7a1b2e" stroke="' + OUT + '" stroke-width="4" stroke-linejoin="round"/>' +
      '<rect x="104.5" y="133.2" width="7" height="5.5" rx="1.5" fill="#fff"/>',
    shout:
      '<ellipse cx="110" cy="138" rx="12" ry="13" fill="#7a1b2e" stroke="' + OUT + '" stroke-width="4"/>' +
      '<ellipse cx="110" cy="146" rx="7" ry="4" fill="#ff6b81"/><rect x="106" y="127" width="7" height="5.5" rx="1.5" fill="#fff"/>',
    shock: '<ellipse cx="110" cy="137" rx="7" ry="8.5" fill="#7a1b2e" stroke="' + OUT + '" stroke-width="4"/>',
  };
  const BROWS = {
    happy: 'M80,86 Q90,79 100,86 M120,86 Q130,79 140,86',
    shout: 'M80,82 Q91,84 101,91 M119,91 Q129,84 140,82',
    shock: 'M80,79 Q90,70 100,79 M120,79 Q130,70 140,79',
  };

  function burstPoints(n, R, r, jitter, cx, cy) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (Math.PI * i) / n + (Math.random() - 0.5) * 0.12;
      const rad = (i % 2 ? r : R) * (1 + (Math.random() - 0.5) * jitter);
      pts.push(((cx || 0) + Math.cos(a) * rad).toFixed(1) + ',' + ((cy || 0) + Math.sin(a) * rad).toFixed(1));
    }
    return pts.join(' ');
  }

  function grannyInner(mood) {
    const hair = [
      [110, 30, 22],
      [64, 88, 24],
      [156, 88, 24],
      [72, 60, 26],
      [148, 60, 26],
      [110, 50, 34],
    ]
      .map((c) => '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '"/>')
      .join('');
    const pearls = [92, 98, 104, 110, 116, 122, 128]
      .map((x) => '<circle cx="' + x + '" cy="' + (170 + 13 * (1 - Math.pow((x - 110) / 18, 2))).toFixed(1) + '" r="3.6" fill="#fff" stroke="' + OUT + '" stroke-width="2"/>')
      .join('');
    const arm = (d) =>
      '<path d="' + d + '" fill="none" stroke="' + OUT + '" stroke-width="33" stroke-linecap="round"/>' +
      '<path d="' + d + '" fill="none" stroke="' + CARDI + '" stroke-width="23" stroke-linecap="round"/>';
    return (
      // hair and bun (outline layer, then fill layer to hide inner lines)
      '<g fill="' + HAIR + '" stroke="' + OUT + '" stroke-width="10">' + hair + '</g><g fill="' + HAIR + '">' + hair + '</g>' +
      '<path d="M101,28 q9,-11 19,0 M58,80 q4,-8 12,-9 M150,71 q8,1 12,9" fill="none" stroke="#c4bdd8" stroke-width="3" stroke-linecap="round"/>' +
      // cardigan, neck, blouse, pearls
      '<path d="M30,300 C28,214 58,168 110,164 C162,168 192,214 190,300 Z" fill="' + CARDI + '" ' + S5 + '/>' +
      '<path d="M60,214 C62,246 66,280 70,300 M160,214 C158,246 154,280 150,300" fill="none" stroke="#b4346a" stroke-width="4" stroke-linecap="round"/>' +
      '<rect x="97" y="138" width="26" height="32" fill="' + SKIN + '" ' + S5 + '/>' +
      '<path d="M90,166 L110,204 L130,166 Z" fill="#fff7ec" stroke="' + OUT + '" stroke-width="4" stroke-linejoin="round"/>' +
      pearls +
      // ears, earrings, face
      '<circle cx="62" cy="104" r="11" fill="' + SKIN + '" ' + S5 + '/><circle cx="158" cy="104" r="11" fill="' + SKIN + '" ' + S5 + '/>' +
      '<circle cx="60" cy="119" r="4.5" fill="#fff" stroke="' + OUT + '" stroke-width="2"/><circle cx="160" cy="119" r="4.5" fill="#fff" stroke="' + OUT + '" stroke-width="2"/>' +
      '<circle cx="110" cy="100" r="50" fill="' + SKIN + '" ' + S5 + '/>' +
      '<path d="M60,100 C54,58 84,40 110,42 C136,40 166,58 160,100 C154,84 144,76 132,80 C126,68 116,66 110,74 C104,66 94,68 88,80 C76,76 66,84 60,100 Z" fill="' + HAIR + '" ' + S5 + ' stroke-linejoin="round"/>' +
      '<circle cx="76" cy="124" r="9" fill="#ff8fab" opacity=".6"/><circle cx="144" cy="124" r="9" fill="#ff8fab" opacity=".6"/>' +
      '<path class="brows" d="' + BROWS[mood] + '" fill="none" stroke="#9a93b3" stroke-width="4.5" stroke-linecap="round"/>' +
      // glasses and eyes
      '<g fill="#fff" opacity=".25"><circle cx="90" cy="104" r="15"/><circle cx="130" cy="104" r="15"/></g>' +
      '<ellipse class="eye" cx="90" cy="105" rx="4" ry="5.5" fill="' + OUT + '"/><ellipse class="eye" cx="130" cy="105" rx="4" ry="5.5" fill="' + OUT + '"/>' +
      '<g fill="none" stroke="' + OUT + '" stroke-width="4" stroke-linecap="round"><circle cx="90" cy="104" r="15"/><circle cx="130" cy="104" r="15"/>' +
      '<path d="M105,102 Q110,97 115,102 M75,101 L62,97 M145,101 L158,97"/></g>' +
      '<path d="M82,98 q4,-5 9,-5 M122,98 q4,-5 9,-5" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>' +
      '<path d="M110,110 q-6,10 2,12" fill="none" stroke="#c98a6b" stroke-width="3.5" stroke-linecap="round"/>' +
      '<g class="mouth">' + MOUTHS[mood] + '</g>' +
      // arms, then the bazooka (with hands) on top
      arm('M54,214 Q66,266 150,252') +
      arm('M166,214 Q196,252 222,244') +
      '<g transform="rotate(-5 180 227)"><g class="recoil">' +
      '<path d="M92,213 L68,202 L68,252 L92,241 Z" fill="#55702b" ' + S5 + ' stroke-linejoin="round"/>' +
      '<rect x="88" y="210" width="170" height="34" rx="10" fill="#7a9a3a" ' + S5 + '/>' +
      '<rect x="97" y="216" width="150" height="6" rx="3" fill="#a8c862" opacity=".8"/>' +
      '<rect x="120" y="210" width="10" height="34" fill="#55702b" stroke="' + OUT + '" stroke-width="4"/>' +
      '<rect x="226" y="210" width="10" height="34" fill="#55702b" stroke="' + OUT + '" stroke-width="4"/>' +
      '<rect x="170" y="195" width="22" height="16" rx="4" fill="#3d3a4f" stroke="' + OUT + '" stroke-width="4"/><circle cx="181" cy="203" r="3.5" fill="#8fd3ff"/>' +
      '<path d="M156,236 C146,228 147,220 152,220 C155,220 156,223 156,224 C156,223 157,220 160,220 C165,220 166,228 156,236 Z" fill="#ff6b8b" stroke="' + OUT + '" stroke-width="3" stroke-linejoin="round"/>' +
      '<rect x="252" y="204" width="22" height="46" rx="7" fill="#55702b" ' + S5 + '/>' +
      '<ellipse cx="274" cy="227" rx="4" ry="15" fill="' + OUT + '"/>' +
      '<g class="flash"><polygon points="' + burstPoints(8, 30, 14, 0.25, 294, 227) + '" fill="#ffd23f" stroke="' + OUT + '" stroke-width="4" stroke-linejoin="round"/>' +
      '<circle cx="292" cy="227" r="8" fill="#fff"/></g>' +
      '<circle class="muzzle" cx="284" cy="227" r="1" fill="none"/>' +
      '<circle cx="150" cy="250" r="12" fill="' + SKIN + '" ' + S5 + '/><circle cx="222" cy="248" r="12" fill="' + SKIN + '" ' + S5 + '/>' +
      '</g></g>'
    );
  }

  // Returns the HTML for Granny. opts: { mood: happy|shout|shock, say, flip, cls }
  FX.granny = function (opts) {
    opts = opts || {};
    const mood = MOUTHS[opts.mood] ? opts.mood : 'happy';
    const inner = grannyInner(mood);
    return (
      '<div class="granny' + (opts.flip ? ' flip' : '') + (opts.cls ? ' ' + opts.cls : '') + '">' +
      '<svg viewBox="0 0 320 300" role="img" aria-label="Granny Boom">' +
      (opts.flip ? '<g transform="translate(320 0) scale(-1 1)">' + inner + '</g>' : inner) +
      '</svg>' +
      '<div class="bubble"' + (opts.say ? '' : ' hidden') + '>' + KB.esc(opts.say || '') + '</div>' +
      '</div>'
    );
  };

  FX.say = function (el, text, mood) {
    if (!el) return;
    const b = el.querySelector('.bubble');
    if (b) {
      b.hidden = !text;
      b.textContent = text || '';
      b.style.animation = 'none';
      void b.offsetWidth;
      b.style.animation = '';
    }
    if (mood) FX.mood(el, mood);
  };

  FX.mood = function (el, mood) {
    if (!el || !MOUTHS[mood]) return;
    const m = el.querySelector('.mouth');
    const b = el.querySelector('.brows');
    if (m) m.innerHTML = MOUTHS[mood];
    if (b) b.setAttribute('d', BROWS[mood]);
  };

  FX.muzzle = function (el) {
    const m = el && el.querySelector('.muzzle');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  FX.fire = function (el) {
    if (!el) return;
    el.classList.remove('firing');
    void el.offsetWidth;
    el.classList.add('firing');
    clearTimeout(el._fireTimer);
    el._fireTimer = setTimeout(() => el.classList.remove('firing'), 400);
  };

  FX.shake = function (el) {
    if (!el || FX.reduced) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    clearTimeout(el._shakeTimer);
    el._shakeTimer = setTimeout(() => el.classList.remove('shake'), 550);
  };

  FX.center = function (el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // ---------- rockets ----------
  const ROCKET =
    '<svg viewBox="-14 -2 98 36">' +
    '<g class="fx-flame"><path d="M16,16 L-12,5 L-4,16 L-12,27 Z" fill="#ff9f1c" stroke="' + OUT + '" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M14,16 L0,10 L4,16 L0,22 Z" fill="#fff3b0"/></g>' +
    '<path d="M22,8 L12,0 L30,2 L38,8 Z" fill="#2f6fe0" stroke="' + OUT + '" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M22,24 L12,32 L30,30 L38,24 Z" fill="#2f6fe0" stroke="' + OUT + '" stroke-width="3" stroke-linejoin="round"/>' +
    '<rect x="16" y="7" width="46" height="18" rx="7" fill="#e5432a"/>' +
    '<rect x="41" y="7" width="7" height="18" fill="#fff"/>' +
    '<rect x="16" y="7" width="46" height="18" rx="7" fill="none" stroke="' + OUT + '" stroke-width="3"/>' +
    '<path d="M60,7 Q83,16 60,25 Z" fill="#ece7f6" stroke="' + OUT + '" stroke-width="3" stroke-linejoin="round"/>' +
    '<circle cx="30" cy="16" r="4" fill="#9fe0ff" stroke="' + OUT + '" stroke-width="2.5"/>' +
    '</svg>';

  function trail(L, x, y, size) {
    const p = document.createElement('i');
    p.className = 'fx-trail';
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.width = p.style.height = size + 'px';
    L.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }

  // Fly a rocket from one screen point to another along an arc. Resolves on impact.
  FX.rocket = function (from, to, opts) {
    opts = opts || {};
    const L = layer();
    const size = opts.size || 80;
    const dur = FX.reduced ? 1 : opts.duration || 600;
    const arc = opts.arc == null ? 0.22 : opts.arc;
    const el = document.createElement('div');
    el.className = 'fx-rocket';
    el.style.width = size + 'px';
    el.innerHTML = ROCKET;
    el.style.transform = 'translate(' + from.x + 'px,' + from.y + 'px) translate(-50%,-50%)';
    L.appendChild(el);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    let nx = dy / dist;
    let ny = -dx / dist;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const c = { x: from.x + dx / 2 + nx * dist * arc, y: from.y + dy / 2 + ny * dist * arc };
    return new Promise((resolve) => {
      let done = false;
      let lastPuff = 0;
      const t0 = performance.now();
      const finish = () => {
        if (done) return;
        done = true;
        el.remove();
        resolve(to);
      };
      const frame = (now) => {
        if (done) return;
        const k = Math.min(1, (now - t0) / dur);
        const t = 0.4 * k + 0.6 * k * k; // speeds up like a rocket
        const u = 1 - t;
        const x = u * u * from.x + 2 * u * t * c.x + t * t * to.x;
        const y = u * u * from.y + 2 * u * t * c.y + t * t * to.y;
        const ang = Math.atan2(2 * u * (c.y - from.y) + 2 * t * (to.y - c.y), 2 * u * (c.x - from.x) + 2 * t * (to.x - c.x));
        el.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%) rotate(' + ang + 'rad)';
        if (now - lastPuff > 22 && !FX.reduced) {
          lastPuff = now;
          trail(L, x - Math.cos(ang) * size * 0.55, y - Math.sin(ang) * size * 0.55, size * 0.34);
        }
        if (k < 1) requestAnimationFrame(frame);
        else finish();
      };
      requestAnimationFrame(frame);
      setTimeout(finish, dur + 500); // animation frames pause in background tabs
    });
  };

  // ---------- explosions ----------
  // opts: { size, word, colors: [outer, middle, inner], wordSize }
  FX.explode = function (at, opts) {
    opts = opts || {};
    const size = opts.size || 160;
    const colors = opts.colors || ['#ff4d2e', '#ff9f1c', '#ffe14d'];
    const L = layer();
    const el = document.createElement('div');
    el.className = 'fx-boom';
    el.style.left = at.x + 'px';
    el.style.top = at.y + 'px';
    el.style.width = el.style.height = size + 'px';
    let html = '';
    if (!FX.reduced) {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + Math.random() * 0.8;
        const d = size * (0.32 + Math.random() * 0.2);
        html +=
          '<i class="fx-smoke" style="--dx:' + (Math.cos(a) * d).toFixed(0) + 'px;--dy:' + (Math.sin(a) * d - size * 0.18).toFixed(0) + 'px;--s:' +
          (0.26 + Math.random() * 0.16).toFixed(2) + ';animation-delay:' + (0.06 + Math.random() * 0.12).toFixed(2) + 's"></i>';
      }
    }
    html +=
      '<svg class="fx-burst" viewBox="-100 -100 200 200">' +
      '<polygon points="' + burstPoints(11, 96, 58, 0.28) + '" fill="' + colors[0] + '" stroke="' + OUT + '" stroke-width="7" stroke-linejoin="round"/>' +
      '<polygon points="' + burstPoints(9, 70, 40, 0.3) + '" fill="' + colors[1] + '"/>' +
      '<polygon points="' + burstPoints(7, 44, 24, 0.3) + '" fill="' + colors[2] + '"/>' +
      '<circle r="15" fill="#fff"/></svg>';
    if (!FX.reduced) {
      const bits = colors.concat([OUT, '#fff']);
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = size * (0.6 + Math.random() * 0.5);
        html +=
          '<i class="fx-bit" style="--c:' + bits[i % bits.length] + ';--dx:' + (Math.cos(a) * d).toFixed(0) + 'px;--dy:' + (Math.sin(a) * d).toFixed(0) +
          'px;--rot:' + (Math.random() * 720 - 360).toFixed(0) + 'deg"></i>';
      }
    }
    if (opts.word) {
      // Keep the word on screen when the explosion is near an edge.
      const fs = Math.round(Math.min(opts.wordSize || size * 0.26, window.innerWidth * 0.15));
      const half = opts.word.length * fs * 0.33 + 10;
      const x = Math.max(half, Math.min(window.innerWidth - half, at.x));
      html += '<b class="fx-word" style="font-size:' + fs + 'px;margin-left:' + Math.round(x - at.x) + 'px">' + KB.esc(opts.word) + '</b>';
    }
    el.innerHTML = html;
    L.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  };

  FX.BOOM_WORDS = ['BOOM!', 'POW!', 'BLAM!', 'KABOOM!', 'WHAM!', 'BANG!'];

  // ---------- Grandma's Favorite: hearts and a smoke puff ----------
  const HEART =
    '<svg viewBox="0 0 32 30"><path d="M16,28 C6,20 1,14 1,8.5 C1,4.4 4.3,1.5 8.2,1.5 C11.4,1.5 14.2,3.6 16,6.6 C17.8,3.6 20.6,1.5 23.8,1.5 ' +
    'C27.7,1.5 31,4.4 31,8.5 C31,14 26,20 16,28 Z" fill="#ff5f9e" stroke="' + OUT + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M7,7 q2,-3 5,-2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/></svg>';

  // A burst of cartoon hearts from a point. opts: { count, spread }
  FX.hearts = function (at, opts) {
    opts = opts || {};
    const L = layer();
    const n = FX.reduced ? 4 : opts.count || 16;
    const spread = opts.spread || 260;
    for (let i = 0; i < n; i++) {
      const h = document.createElement('i');
      h.className = 'fx-heart';
      const a = Math.random() * Math.PI * 2;
      const d = spread * (0.35 + Math.random() * 0.65);
      h.style.left = at.x + 'px';
      h.style.top = at.y + 'px';
      h.style.width = (22 + Math.random() * 28).toFixed(0) + 'px';
      h.style.setProperty('--dx', (Math.cos(a) * d).toFixed(0) + 'px');
      h.style.setProperty('--dy', (Math.sin(a) * d * 0.7 - spread * 0.25).toFixed(0) + 'px');
      h.style.setProperty('--rot', (Math.random() * 70 - 35).toFixed(0) + 'deg');
      h.style.animationDelay = (Math.random() * 0.15).toFixed(2) + 's';
      h.innerHTML = HEART;
      L.appendChild(h);
      setTimeout(() => h.remove(), 1700);
    }
  };

  // A soft cartoon smoke puff (no fire), e.g. over the name of a Favorite who missed.
  FX.puff = function (at, opts) {
    opts = opts || {};
    const size = opts.size || 160;
    const L = layer();
    const el = document.createElement('div');
    el.className = 'fx-boom fx-puff';
    el.style.left = at.x + 'px';
    el.style.top = at.y + 'px';
    el.style.width = el.style.height = size + 'px';
    let html = '';
    const n = FX.reduced ? 3 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = size * (0.12 + Math.random() * 0.22);
      html +=
        '<i class="fx-smoke" style="--dx:' + (Math.cos(a) * d).toFixed(0) + 'px;--dy:' + (Math.sin(a) * d * 0.6 - size * 0.25).toFixed(0) + 'px;--s:' +
        (0.3 + Math.random() * 0.2).toFixed(2) + ';animation-delay:' + (Math.random() * 0.1).toFixed(2) + 's"></i>';
    }
    el.innerHTML = html;
    L.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  };
})();
