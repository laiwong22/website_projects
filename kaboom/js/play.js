/* Kaboom player (phone): join with a PIN, pick a nickname and avatar, then tap 1-4. */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const app = $('#app');
  const bar = $('#bar');
  const overlay = $('#reconnect');
  const esc = KB.esc;

  const me = KB.store.get('kaboom.me', {}) || {};
  const P = {
    peer: null,
    conn: null,
    pin: '',
    pid: '',
    name: KB.cleanName(me.name),
    avatar: KB.AVATARS.includes(me.avatar) ? me.avatar : KB.AVATARS[Math.floor(Math.random() * KB.AVATARS.length)],
    joined: false, // the host has accepted us at least once
    resuming: false, // reloading the page mid-game
    left: false,
    attempt: 0,
    retries: 0,
    retryTimer: null,
    gaveUp: false,
    paused: false, // another tab on this phone took over this player
    resumeTries: 0,
    connectingSince: 0,
    lastSeen: 0,
    view: null,
  };

  const fmtPin = (pin) => pin.slice(0, 3) + ' ' + pin.slice(3);

  // Who this phone is in the current game. Saved for this tab AND for the whole browser, so reopening
  // the link, rescanning the QR code or a reloaded tab all land back in the same player.
  const SESSION_KEY = 'kaboom.player';
  const SESSION_TTL = 4 * 60 * 60 * 1000;
  function saveSession() {
    const v = { pin: P.pin, pid: P.pid, name: P.name, avatar: P.avatar, at: Date.now() };
    KB.session.set(SESSION_KEY, v);
    KB.store.set(SESSION_KEY, v);
  }
  function clearSession() {
    KB.session.remove(SESSION_KEY);
    KB.store.remove(SESSION_KEY);
  }
  function loadSession() {
    const v = KB.session.get(SESSION_KEY, null) || KB.store.get(SESSION_KEY, null);
    if (!v || !v.pin || !v.pid || (v.at && Date.now() - v.at > SESSION_TTL)) return null;
    return v;
  }
  function adopt(v) {
    P.pin = v.pin;
    P.pid = v.pid;
    P.name = KB.cleanName(v.name) || P.name;
    if (KB.AVATARS.includes(v.avatar)) P.avatar = v.avatar;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 2600);
  }

  function setMood(mood) {
    document.body.classList.remove('is-good', 'is-bad', 'is-none');
    if (mood) document.body.classList.add('is-' + mood);
  }

  function show(html, opts) {
    opts = opts || {};
    setMood(opts.mood);
    app.className = 'p-main' + (opts.full ? ' full' : '');
    app.innerHTML = html;
    if (opts.bar) {
      bar.hidden = false;
      bar.innerHTML =
        '<span class="who"><span>' + esc(P.avatar) + '</span><span>' + esc(P.name) + '</span></span>' +
        '<span class="score">' + KB.num(P.view ? P.view.score : 0) + '</span>';
    } else {
      bar.hidden = true;
    }
  }

  // ---------- screens before joining ----------
  function showPin(error, pin) {
    show(
      '<h1 class="logo">KAB<span class="o">OO</span>M!</h1>' +
        KBFx.granny({ mood: 'happy', say: 'Got a PIN, sweetie?', cls: 'p-granny bubble-top small' }) +
        '<form class="join-form" id="pin-form" autocomplete="off">' +
        '<input class="field pin-input" id="pin" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" placeholder="Game PIN" aria-label="Game PIN" value="' +
        esc(pin || '') +
        '">' +
        '<button class="btn big" type="submit">Enter</button>' +
        '<p class="error" role="alert">' + esc(error || '') + '</p>' +
        '</form>' +
        '<nav class="p-links"><a href="host.html">Host a game</a><a href="edit.html">Make a quiz</a></nav>'
    );
    const input = $('#pin');
    $('#pin-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const digits = input.value.replace(/\D/g, '');
      if (digits.length !== 6) {
        $('.error').textContent = 'The PIN is the 6 numbers on the big screen.';
        input.focus();
        return;
      }
      P.left = false;
      P.paused = false;
      const saved = loadSession();
      if (saved && saved.pin === digits) {
        adopt(saved);
        P.resuming = true;
        P.resumeTries = 0;
        connect(digits, true);
      } else {
        connect(digits, false);
      }
    });
    if (!('ontouchstart' in window)) input.focus();
  }

  function showConnecting(text) {
    show('<div class="spinner" aria-hidden="true"></div><p class="standing">' + esc(text) + '</p>');
  }

  function showName(error) {
    show(
      '<h2>Who are you?</h2>' +
        '<form class="join-form" id="name-form" autocomplete="off">' +
        '<input class="field name-input" id="name" maxlength="' + KB.NAME_MAX + '" placeholder="Nickname" aria-label="Nickname" value="' + esc(P.name) + '">' +
        '<div class="avatars" role="group" aria-label="Pick an avatar">' +
        KB.AVATARS.map((a) => '<button type="button" class="avatar-btn" data-av="' + a + '" aria-pressed="' + (a === P.avatar) + '">' + a + '</button>').join('') +
        '</div>' +
        '<button class="btn big" type="submit">Join game</button>' +
        '<p class="error" role="alert">' + esc(error || '') + '</p>' +
        '</form>' +
        '<p class="muted">Game PIN ' + fmtPin(P.pin) + ' · <a href="#" id="change-pin">change</a></p>'
    );
    const input = $('#name');
    app.querySelector('.avatars').addEventListener('click', (e) => {
      const b = e.target.closest('[data-av]');
      if (!b) return;
      P.avatar = b.dataset.av;
      app.querySelectorAll('[data-av]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    $('#name-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = KB.cleanName(input.value);
      if (!name) {
        $('.error').textContent = 'Type a nickname first.';
        input.focus();
        return;
      }
      P.name = name;
      KB.store.set('kaboom.me', { name: P.name, avatar: P.avatar });
      sendJoin();
    });
    $('#change-pin').addEventListener('click', (e) => {
      e.preventDefault();
      leave();
      showPin('', '');
    });
    if (!P.name && !('ontouchstart' in window)) input.focus();
  }

  function showMessage(icon, title, text, button) {
    show(
      '<div class="result-icon">' + icon + '</div><h2>' + esc(title) + '</h2>' +
        (text ? '<p class="standing">' + esc(text) + '</p>' : '') +
        '<button class="btn big" id="again">' + esc(button || 'Join another game') + '</button>'
    );
    $('#again').addEventListener('click', () => showPin('', ''));
  }

  // ---------- connection ----------
  function closeConn() {
    const c = P.conn;
    P.conn = null;
    if (c) {
      try {
        c.close();
      } catch (e) {
        /* already closed */
      }
    }
  }

  function getPeer() {
    if (P.peer && !P.peer.destroyed && P.peer.open) return Promise.resolve(P.peer);
    if (P.peer) {
      try {
        P.peer.destroy();
      } catch (e) {
        /* ignore */
      }
    }
    return new Promise((resolve, reject) => {
      const peer = (P.peer = new Peer(KB.peerOptions()));
      let opened = false;
      peer.on('open', () => {
        opened = true;
        resolve(peer);
      });
      peer.on('error', (err) => {
        if (peer !== P.peer) return;
        if (err.type === 'peer-unavailable') return failConnect('peer-unavailable');
        if (!opened) return reject(err);
        if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type) && !(P.conn && P.conn.open)) failConnect(err.type);
      });
    });
  }

  function dropPeer() {
    const old = P.peer;
    P.peer = null;
    if (old) {
      try {
        old.destroy();
      } catch (e) {
        /* ignore */
      }
    }
  }

  function connect(pin, autoJoin) {
    const attempt = ++P.attempt;
    const rejoin = autoJoin && (P.joined || P.resuming);
    closeConn();
    clearTimeout(P.retryTimer);
    P.retryTimer = null;
    P.pin = pin;
    P.connectingSince = Date.now();
    // After the phone slept, the old relay socket can look open but be dead. Never reuse it to rejoin.
    if (rejoin) dropPeer();
    if (!P.joined) showConnecting(autoJoin ? 'Rejoining the game…' : 'Finding game ' + fmtPin(pin) + '…');
    getPeer().then(
      (peer) => {
        if (attempt !== P.attempt) return;
        let conn;
        try {
          conn = peer.connect(KB.PREFIX + pin, { serialization: 'json', reliable: true });
        } catch (e) {
          return failConnect('network');
        }
        P.conn = conn;
        const timer = setTimeout(() => {
          if (attempt === P.attempt && !conn.open) failConnect('timeout');
        }, rejoin ? 8000 : 15000);
        conn.on('open', () => {
          clearTimeout(timer);
          if (attempt !== P.attempt) return;
          P.connectingSince = 0;
          P.lastSeen = Date.now();
          if (autoJoin) sendJoin();
          else showName('');
        });
        conn.on('data', (msg) => {
          if (conn === P.conn) onData(msg);
        });
        conn.on('close', () => {
          if (conn === P.conn) onLost();
        });
        conn.on('error', () => {
          if (conn === P.conn) onLost();
        });
      },
      (err) => {
        if (attempt === P.attempt) failConnect(err && err.type);
      }
    );
  }

  function failConnect(type) {
    if (P.left || P.paused) return;
    P.connectingSince = 0;
    if (P.joined) return scheduleRetry();
    P.attempt++;
    closeConn();
    if (P.resuming) {
      if (type !== 'peer-unavailable' && P.resumeTries < 3) {
        P.resumeTries++;
        showConnecting('Rejoining the game…');
        P.retryTimer = setTimeout(() => {
          P.retryTimer = null;
          connect(P.pin, true);
        }, 1500);
        return;
      }
      P.resuming = false;
      if (type === 'peer-unavailable') {
        clearSession();
        return showPin('That game is over, or the host closed it.', '');
      }
      return showPin("Couldn't reach the game. Check your internet, then tap Enter to rejoin.", P.pin);
    }
    const messages = {
      'peer-unavailable': 'No game found with PIN ' + fmtPin(P.pin) + '. Check the number on the big screen.',
      timeout: "Couldn't reach that game. Check the PIN and your internet, then try again.",
      'browser-incompatible': "This browser can't play Kaboom. Try Chrome or Safari.",
    };
    showPin(messages[type] || "Can't reach the Kaboom relay. Check your internet connection and try again.", P.pin);
  }

  function send(msg) {
    if (!P.conn || !P.conn.open) return false;
    try {
      P.conn.send(msg);
      return true;
    } catch (e) {
      return false;
    }
  }

  function sendJoin() {
    if (!P.pid) P.pid = KB.uid('p-');
    if (!P.joined) showConnecting('Joining…');
    send({ t: 'join', pid: P.pid, name: P.name, avatar: P.avatar });
  }

  function onData(msg) {
    if (!msg || typeof msg !== 'object') return;
    P.lastSeen = Date.now();
    switch (msg.t) {
      case 'ping':
        send({ t: 'pong' });
        break;
      case 'view':
        P.joined = true;
        P.resuming = false;
        P.retries = 0;
        overlay.hidden = true;
        if (msg.view.name) P.name = msg.view.name;
        if (msg.view.avatar) P.avatar = msg.view.avatar;
        P.resumeTries = 0;
        saveSession();
        KB.keepAwake();
        // Let the rocket finish exploding before switching screens.
        if (P.firing) P.pendingView = msg.view;
        else renderView(msg.view);
        break;
      case 'reject':
        if (msg.reason === 'name') {
          P.resuming = false;
          showName(msg.msg);
        } else {
          leave();
          showPin(msg.msg || "Couldn't join that game.", '');
        }
        break;
      case 'kicked':
        leave();
        showMessage('🚪', 'You were removed', 'The host removed you from this game.');
        break;
      case 'closed':
        leave();
        showMessage('👋', 'Game closed', 'The host ended the game. Thanks for playing!');
        break;
      case 'replaced':
        standDown();
        break;
    }
  }

  // This player was picked up by another tab or window on this phone: step aside instead of
  // fighting over the connection, and offer to take it back.
  function standDown() {
    P.paused = true;
    P.attempt++;
    P.firing = false;
    P.pendingView = null;
    clearTimeout(P.retryTimer);
    P.retryTimer = null;
    overlay.hidden = true;
    closeConn();
    show(
      granny('shock', 'Two of you, dear?') + '<h2>Playing in another tab</h2>' +
        '<p class="standing">Kaboom is open somewhere else on this phone, so this tab stepped aside.</p>' +
        '<button class="btn big" id="here">Play here instead</button>',
      { bar: true }
    );
    $('#here').addEventListener('click', () => {
      P.paused = false;
      reconnectNow();
    });
  }

  function showReconnecting() {
    overlay.hidden = false;
    overlay.innerHTML =
      '<div class="spinner" aria-hidden="true"></div><h2 class="display">Reconnecting…</h2><p class="muted">Hang tight, getting you back in the game.</p>';
  }

  // Back from another app, the lock screen or a network change: rejoin right away.
  function reconnectNow() {
    if (!P.joined || P.left || P.paused) return;
    P.retries = 0;
    P.gaveUp = false;
    clearTimeout(P.retryTimer);
    P.retryTimer = null;
    showReconnecting();
    connect(P.pin, true);
  }

  const looksDead = () => !P.conn || !P.conn.open || Date.now() - P.lastSeen > 5000;
  const connectingNow = () => P.connectingSince && Date.now() - P.connectingSince < 3000;

  function onLost() {
    if (P.left || P.paused) return;
    closeConn();
    if (!P.joined) return failConnect('timeout');
    showReconnecting();
    scheduleRetry();
  }

  function scheduleRetry() {
    if (P.left || P.paused || P.retryTimer) return;
    overlay.hidden = false;
    if (P.retries >= 30) {
      P.gaveUp = true;
      overlay.innerHTML =
        '<div class="result-icon">📡</div><h2 class="display">Lost the game</h2>' +
        '<p class="muted">We can’t reach the host. Their screen may have closed.</p>' +
        '<button class="btn big" id="retry">Try again</button><button class="btn ghost" id="quit">Leave game</button>';
      $('#retry').onclick = () => reconnectNow();
      $('#quit').onclick = () => {
        leave();
        overlay.hidden = true;
        showPin('', '');
      };
      return;
    }
    const delay = Math.min(800 + P.retries * 700, 5000);
    P.retries++;
    P.retryTimer = setTimeout(() => {
      P.retryTimer = null;
      connect(P.pin, true);
    }, delay);
  }

  function leave() {
    P.left = true;
    P.paused = false;
    P.firing = false;
    P.pendingView = null;
    P.gaveUp = false;
    P.joined = false;
    P.resuming = false;
    P.pid = '';
    P.view = null;
    P.attempt++;
    clearTimeout(P.retryTimer);
    P.retryTimer = null;
    overlay.hidden = true;
    closeConn();
    clearSession();
  }

  // Notice a dead connection (phone slept, Wi-Fi switched) and reconnect.
  setInterval(() => {
    if (!P.joined || P.left || P.paused || P.retryTimer || P.gaveUp || connectingNow()) return;
    if (!P.conn || (P.conn.open && Date.now() - P.lastSeen > 10000)) onLost();
  }, 3000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && looksDead() && !connectingNow()) reconnectNow();
  });
  window.addEventListener('online', () => {
    if (looksDead()) reconnectNow();
  });

  // ---------- game screens ----------
  function standingLine(v) {
    if (!v.rank) return '';
    if (v.rank === 1) return v.ahead ? '' : 'You’re in the lead! 🔥';
    return v.ahead ? KB.num(v.ahead.gap) + ' pts behind ' + v.ahead.name : '';
  }

  const LINES = {
    good: ['That’s my sweetie!', 'Clever cookie!', 'Granny’s so proud!', 'Bullseye, dear!'],
    bad: ['Oh, bless your heart!', 'Oopsie daisy!', 'Not quite, dear!', 'So close, sweetie!'],
    slow: ['Too slow, dear!', 'Snooze, you lose!', 'Faster next time!'],
    locked: ['Nice shot!', 'Locked and loaded!', 'Kaboom! Got it!'],
  };
  const granny = (mood, say) => KBFx.granny({ mood, say, cls: 'p-granny bubble-top' });

  // Tap an answer: a rocket flies up and blows up on that button.
  function fireAt(btn, nextView) {
    P.firing = true;
    P.pendingView = nextView;
    const grid = btn.parentNode;
    grid.classList.add('fired');
    btn.classList.add('target');
    const to = KBFx.center(btn);
    const box = btn.getBoundingClientRect();
    const from = { x: window.innerWidth / 2, y: window.innerHeight + 50 };
    KBFx.rocket(from, to, { size: Math.min(120, window.innerWidth * 0.27), duration: 460, arc: 0.12 })
      .then(() => {
        if (navigator.vibrate) navigator.vibrate([70, 40, 40]);
        KBFx.explode(to, { size: Math.min(box.width, box.height) * 1.45, word: KBFx.pick(KBFx.BOOM_WORDS) });
        btn.classList.add('hit');
        KBFx.shake(app);
        return KBFx.sleep(KBFx.reduced ? 150 : 900);
      })
      .then(() => {
        P.firing = false;
        const v = P.pendingView;
        P.pendingView = null;
        if (v) renderView(v);
      });
  }

  function renderView(v) {
    P.view = v;
    const place = v.rank ? 'You’re in ' + KB.ordinal(v.rank) + ' place' : '';
    switch (v.screen) {
      case 'lobby':
        show(
          granny('happy', 'You’re in, ' + P.name + '!') +
            '<p class="standing">Look for your name on the big screen.</p><p class="muted">The game starts soon…</p>',
          { bar: true }
        );
        break;

      case 'intro':
        show(
          '<p class="muted">Question ' + (v.q + 1) + ' of ' + v.total + '</p>' + granny('shout', 'Get ready!') +
            '<p class="standing">Read the question on the big screen</p>',
          { bar: true }
        );
        break;

      case 'question': {
        let buttons = '';
        for (let i = 0; i < v.n; i++) {
          buttons +=
            '<button class="ans-btn c' + (i + 1) + '" data-choice="' + i + '" aria-label="Answer ' + (i + 1) + (v.labels ? ', ' + v.labels[i] : '') + '">' +
            (i + 1) + (v.labels ? '<small>' + esc(v.labels[i]) + '</small>' : '') + '</button>';
        }
        show(
          '<div class="p-top"><span>Q' + (v.q + 1) + ' / ' + v.total + '</span><span>Pick ' + (v.n === 2 ? '1 or 2' : '1–' + v.n) + '</span></div>' +
            '<div class="timebar"><i id="tb"></i></div>' +
            '<div class="qgrid n' + v.n + '">' + buttons + '</div>',
          { full: true, bar: true }
        );
        const tb = $('#tb');
        const total = v.duration || v.endsIn || 1;
        tb.style.transform = 'scaleX(' + Math.max(0, Math.min(1, v.endsIn / total)) + ')';
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            tb.style.transition = 'transform ' + v.endsIn + 'ms linear';
            tb.style.transform = 'scaleX(0)';
          })
        );
        app.querySelector('.qgrid').addEventListener('click', (e) => {
          const b = e.target.closest('[data-choice]');
          if (!b || P.firing) return;
          const choice = Number(b.dataset.choice);
          if (!send({ t: 'answer', q: v.q, choice })) return toast('Reconnecting… try again in a second');
          if (navigator.vibrate) navigator.vibrate(25);
          fireAt(b, Object.assign({}, v, { screen: 'answered', choice }));
        });
        break;
      }

      case 'answered':
        show(
          granny('happy', KBFx.pick(LINES.locked)) +
            '<div class="locked-row"><div class="locked-tile c' + (v.choice + 1) + '">' + (v.choice + 1) + '</div>' +
            '<div><h2>Locked in!</h2><p class="muted">Waiting for everyone else…</p></div></div>',
          { bar: true }
        );
        break;

      case 'wait':
        show(granny('shock', KBFx.pick(LINES.slow)) + '<h2>Time’s up!</h2><p class="muted">Let’s see who got it…</p>', { bar: true, mood: 'none' });
        break;

      case 'result': {
        const r = v.last;
        let html;
        let mood;
        if (r && r.correct) {
          mood = 'good';
          html =
            granny('happy', KBFx.pick(LINES.good)) + '<h2>Correct!</h2><div class="points">+' + KB.num(r.points) + '</div>' +
            (r.streak > 1 ? '<p class="streak">🔥 ' + r.streak + ' in a row' + (r.bonus ? ' · +' + r.bonus + ' bonus' : '') + '</p>' : '');
        } else if (r && r.answered) {
          mood = 'bad';
          html = granny('shock', KBFx.pick(LINES.bad)) + '<h2>Not quite!</h2><p class="streak">' + (r.lostStreak ? 'Streak lost. ' : '') + 'Get the next one.</p>';
        } else {
          mood = 'none';
          html =
            granny('shock', r ? KBFx.pick(LINES.slow) : 'Welcome aboard, dear!') + '<h2>Time’s up!</h2><p class="streak">' +
            (r ? 'You didn’t answer this one.' : 'You joined mid-question. Get ready for the next one!') + '</p>';
        }
        html += place ? '<p class="standing">' + place + '</p>' : '';
        const sl = standingLine(v);
        if (sl) html += '<p class="muted">' + esc(sl) + '</p>';
        show(html, { bar: true, mood });
        break;
      }

      case 'standing': {
        const sl = standingLine(v);
        show(
          granny('happy', v.rank === 1 ? 'You’re winning, sweetie!' : 'Keep going, dear!') +
            '<h2>' + (place || 'Leaderboard') + '</h2>' + (sl ? '<p class="standing">' + esc(sl) + '</p>' : '') +
            '<p class="muted">Next question coming up…</p>',
          { bar: true }
        );
        break;
      }

      case 'end': {
        const medal = KB.medal(v.rank);
        show(
          granny(v.rank <= 3 ? 'shout' : 'happy', v.rank <= 3 ? 'Cookies for you, sweetie!' : 'Good game, dear!') +
            '<h2>' + (medal ? medal + ' ' : '') + 'You finished ' + KB.ordinal(v.rank) + '!</h2>' +
            '<div class="points">' + KB.num(v.score) + ' pts</div>' +
            '<p class="standing">' + v.correct + ' of ' + v.total + ' correct</p>' +
            '<p class="muted">Stay here if the host starts another round.</p>' +
            '<button class="btn ghost" id="leave">Leave game</button>',
          { bar: true, mood: v.rank <= 3 ? 'good' : '' }
        );
        $('#leave').addEventListener('click', () => {
          leave();
          showPin('', '');
        });
        break;
      }

      default:
        show('<div class="spinner"></div>', { bar: true });
    }
  }

  // ---------- start ----------
  const saved = loadSession();
  const urlPin = (KB.params.get('pin') || '').replace(/\D/g, '');
  if (saved && (!urlPin || urlPin === saved.pin)) {
    // Reloaded, reopened the link or rescanned the QR code mid-game: pick up where we left off.
    adopt(saved);
    P.resuming = true;
    connect(saved.pin, true);
  } else if (urlPin.length === 6) {
    connect(urlPin, false);
  } else {
    showPin('', '');
  }

  window.addEventListener('pagehide', () => {
    if (P.peer) P.peer.destroy();
  });
  // Coming back from the browser's back/forward cache: the connection was closed on pagehide.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) reconnectNow();
  });
})();
