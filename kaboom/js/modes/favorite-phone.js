/* Grandma's Favorite: phone screens (players and the Grandma controller).
   Each screen is (view, A) => void, where A is the phone page's toolkit from play.js:
   { show(html, opts), granny(mood, say), send(msg), esc, $, toast }. */
(function () {
  'use strict';

  const screens = (KB.phoneScreens = KB.phoneScreens || {});

  // Count down in an element until it leaves the page.
  function countdown(el, endsIn, done) {
    if (!el) return;
    const end = Date.now() + endsIn;
    const step = () => {
      if (!el.isConnected) return;
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      el.textContent = left;
      if (left > 0) setTimeout(step, 250);
      else if (done) done();
    };
    step();
  }

  const qLine = (v) => (v.total ? '<p class="muted">Question ' + (v.q + 1) + ' of ' + v.total + '</p>' : '');

  // ---------- players ----------
  screens['fav-pickme'] = (v, A) => {
    if (v.waiting) {
      A.show(A.granny('happy', 'Hmm… who should it be?') + '<h2>Grandma is choosing…</h2><p class="standing">Fingers crossed!</p>', { bar: true });
      return;
    }
    A.show(
      qLine(v) + A.granny('shout', 'Make your case, sweetie!') + '<h2>🗣️ Convince Grandma to pick you!</h2>' +
        '<div class="fav-phone-count" id="fav-pc"></div><p class="muted">Her Favorite scores extra for a right answer.</p>',
      { bar: true }
    );
    countdown(A.$('#fav-pc'), v.endsIn);
  };

  screens['fav-crowned'] = (v, A) => {
    A.show(
      '<div class="crown-phone">👑</div><div class="text-card"><h2>You’re Grandma’s Favorite!</h2>' +
        '<p class="standing">Get it right for ' + v.mult + '× points.</p><p class="muted">Watch the big screen…</p></div>',
      { bar: true, mood: 'gold' }
    );
    if (navigator.vibrate) navigator.vibrate([60, 60, 120]);
  };

  screens['fav-picked'] = (v, A) => {
    A.show(A.granny('happy', 'I choose…') + '<h2>Grandma picked ' + A.esc(v.fav || 'someone') + '</h2><p class="muted">Get ready to answer!</p>', { bar: true });
  };

  // ---------- Grandma ----------
  screens['gm-lobby'] = (v, A) => {
    A.show(
      A.granny('happy', 'Hello, dearies!') + '<h2>You’re Grandma 👵</h2>' +
        '<p class="standing">You won’t answer. Pick who knows you best.</p>' +
        '<p class="muted">Before each question you pick a Favorite. If they get it right, it counts for you. ' +
        'Beat the room’s score to win!</p>',
      { bar: true }
    );
  };

  screens['gm-pick'] = (v, A) => {
    let sel = v.sel;
    const max = v.maxPicks || 0;
    const dots = (used) => {
      let s = '';
      for (let i = 0; i < Math.max(max, used); i++) s += i < used ? '●' : '○';
      return s;
    };
    const cards = v.players
      .map(
        (x) =>
          '<button type="button" class="gm-player' + (x.eligible ? '' : ' off') + (x.tag === sel ? ' sel' : '') + '" data-tag="' + A.esc(x.tag) + '"' +
          (x.eligible ? '' : ' disabled') + '><span class="av">' + A.esc(x.avatar) + '</span><b>' + A.esc(x.name) + '</b>' +
          '<span class="dots" aria-label="' + x.used + ' of ' + max + ' picks used">' + dots(x.used) + '</span>' +
          (x.reason ? '<span class="why">' + A.esc(x.reason) + '</span>' : '') + '</button>'
      )
      .join('');
    const selName = () => {
      const x = v.players.find((y) => y.tag === sel);
      return x ? x.name : '';
    };
    A.show(
      '<div class="gm-top"><span>Q' + (v.q + 1) + ' / ' + v.total + '</span>' +
        (v.waiting ? '<span class="gm-late">Time’s up!</span>' : '<span><b id="gm-count"></b>s</span>') + '</div>' +
        '<div class="gm-q">' + A.esc(v.text) + '</div>' +
        (v.waiting ? '<p class="gm-hurry">Everyone’s waiting, Grandma: pick your Favorite!</p>' : '<p class="muted">Who knows the answer to this one?</p>') +
        (v.relaxed ? '<p class="gm-relaxed">Everyone else was used up, so the rules loosened for this round.</p>' : '') +
        (v.none ? '<p class="gm-relaxed">Nobody can be picked right now. The host can start without a Favorite.</p>' : '') +
        '<div class="gm-grid">' + cards + '</div>' +
        '<button class="btn big gm-lock" type="button" id="gm-lock"' + (sel ? '' : ' disabled') + '>' + (sel ? 'Lock in ' + A.esc(selName()) : 'Pick a Favorite') + '</button>',
      { bar: true }
    );
    if (!v.waiting) countdown(A.$('#gm-count'), v.endsIn);
    const lockBtn = A.$('#gm-lock');
    A.$('.gm-grid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tag]');
      if (!b || b.disabled) return;
      sel = b.dataset.tag;
      document.querySelectorAll('.gm-player').forEach((x) => x.classList.toggle('sel', x === b));
      lockBtn.disabled = false;
      lockBtn.textContent = 'Lock in ' + selName();
      A.send({ t: 'fav-pick', tag: sel });
      if (navigator.vibrate) navigator.vibrate(20);
    });
    lockBtn.addEventListener('click', () => {
      if (!sel) return;
      lockBtn.disabled = true;
      lockBtn.textContent = 'Locking in…';
      A.send({ t: 'fav-lock', tag: sel });
    });
  };

  screens['gm-wait'] = (v, A) => {
    if (!v.fav) {
      A.show(A.granny('happy', 'Just watching this time.') + '<h2>No Favorite this round</h2><p class="muted">' + A.esc(v.tallyText) + '</p>', { bar: true });
      return;
    }
    A.show(
      A.granny(v.answered ? 'shout' : 'happy', v.answered ? 'Ooh, they locked in!' : 'Come on, sweetie…') +
        '<h2>Your Favorite: ' + A.esc(v.favAvatar + ' ' + v.fav) + '</h2>' +
        '<p class="standing">' + (v.answered ? '✔ ' + A.esc(v.fav) + ' locked in an answer' : A.esc(v.fav) + ' is answering…') + '</p>' +
        '<p class="muted">' + A.esc(v.tallyText) + '</p>',
      { bar: true }
    );
  };

  screens['gm-result'] = (v, A) => {
    const r = {
      hit: { mood: 'good', g: ['happy', 'That’s my Favorite!'], h: '✓ ' + A.esc(v.fav) + ' got it! 💖' },
      miss: { mood: 'bad', g: ['shock', 'Oh, sweetie…'], h: '✗ ' + A.esc(v.fav) + ' missed it 😤' },
      void: { mood: 'none', g: ['shock', 'Where did they go?'], h: A.esc(v.fav) + ' disconnected' },
    }[v.status] || { mood: 'none', g: ['happy', 'On to the next one!'], h: 'No Favorite this round' };
    A.show(
      A.granny(r.g[0], r.g[1]) + '<h2>' + r.h + '</h2>' +
        (v.status === 'void' ? '<p class="standing">This pick doesn’t count either way.</p>' : '') +
        '<p class="standing">' + A.esc(v.tallyText) + '</p>',
      { bar: true, mood: r.mood }
    );
  };

  screens['gm-end'] = (v, A) => {
    if (!v.revealed) {
      A.show(A.granny('shock', 'The moment of truth…') + '<h2>Did you know them best?</h2><p class="standing">Watch the big screen for your verdict!</p>', { bar: true });
      return;
    }
    const text = '<h2>' + A.esc(v.verdict) + '</h2><p class="standing">' + A.esc(v.tallyText) + '</p>';
    A.show(A.granny(v.wins ? 'happy' : 'shock', v.wins ? 'I knew it!' : 'Hmph. Next time!') + (v.wins ? '<div class="text-card">' + text + '</div>' : text), {
      bar: true,
      mood: v.wins ? 'gold' : '',
    });
  };
})();
