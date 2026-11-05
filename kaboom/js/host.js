/* Kaboom host (big screen). This browser tab IS the game server: phones connect to it
   through the PeerJS relay, and everything (players, answers, scores) lives here. */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const stage = $('#stage');
  const esc = KB.esc;
  const S = KBSound;

  const G = {
    phase: 'setup', // setup | lobby | intro | question | boom | reveal | board | podium (+ phases a mode adds)
    modeId: KB.getMode(KB.store.get('kaboom.mode', 'classic')).id,
    quizzes: [],
    quizId: null,
    duration: KB.TIMERS.includes(KB.store.get('kaboom.timer', 20)) ? KB.store.get('kaboom.timer', 20) : 20,
    quiz: null,
    questions: [],
    qi: -1,
    pin: '',
    peer: null,
    players: new Map(), // pid -> player
    kicked: new Set(),
    locked: false,
    answers: new Map(), // pid -> { choice, ms } for the current question
    counts: [],
    ranked: [],
    qStart: 0,
    qEnd: 0,
    raf: 0,
    lastSec: null,
    revealReady: false,
    timers: [],
  };

  const fmtPin = (pin) => pin.slice(0, 3) + ' ' + pin.slice(3);
  const cur = () => G.questions[G.qi];
  const list = () => [...G.players.values()];

  // ---------- game modes (see js/modes.js) ----------
  // Classic has no hooks, so every `hooks.x` check below falls through to the original behavior.
  let hooks = {};
  const contestants = () => (hooks.isContestant ? list().filter(hooks.isContestant) : list());
  function useMode(id) {
    const m = KB.getMode(id);
    G.modeId = m.id;
    hooks = m.create ? m.create(H) || {} : {};
  }

  // ---------- Granny Boom, the host ----------
  const pick = KBFx.pick;
  const LINES = {
    lobby: ['Phones out, sweeties!', 'Scan Granny\u2019s code, dear!', 'Cookies for the winner!', 'No dawdling now!', 'My bazooka is loaded!', 'Come on in, dearies!'],
    intro: ['Ooh, this one\u2019s tricky!', 'Thinking caps on!', 'Granny knows this one!', 'Eyes on the big screen!', 'Here it comes!'],
    go: ['Pick a number, quick!', 'Tap tap tap!', 'Ready\u2026 aim\u2026'],
    hurry: ['Hurry up, sweetie!', 'Tick tock, dearies!', 'The fuse is burning!'],
    fire: ['Wrong answers, begone!', 'Fire in the hole!', 'Stand back, dearies!'],
  };
  const granny = () => stage.querySelector('.granny');
  const say = (text, mood) => KBFx.say(granny(), text, mood);

  // She chats while everyone joins.
  setInterval(() => {
    if (G.phase !== 'lobby' || Date.now() < (G.quietUntil || 0)) return;
    G.lobbyLine = ((G.lobbyLine || 0) + 1) % LINES.lobby.length;
    say(LINES.lobby[G.lobbyLine], 'happy');
  }, 6000);

  function later(fn, ms) {
    G.timers.push(setTimeout(fn, ms));
  }
  function clearTimers() {
    G.timers.forEach(clearTimeout);
    G.timers = [];
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 3000);
  }
  function banner(msg) {
    const b = $('#banner');
    b.textContent = msg || '';
    b.hidden = !msg;
  }

  const safeImg = (src) => (/^(data:image\/|https?:\/\/)/i.test(src || '') ? src : '');

  // ---------- connection ----------
  function send(conn, msg) {
    if (!conn || !conn.open) return;
    try {
      conn.send(msg);
    } catch (e) {
      /* connection closing */
    }
  }

  function broadcast() {
    for (const p of G.players.values()) if (p.conn) send(p.conn, { t: 'view', view: viewFor(p) });
  }

  function startPeer() {
    stage.innerHTML = '<div class="intro"><div class="spinner"></div><p class="q-meta">Opening your game…</p></div>';
    G.pin = String(100000 + Math.floor(Math.random() * 900000));
    const peer = (G.peer = new Peer(KB.PREFIX + G.pin, KB.peerOptions()));
    let opened = false;
    peer.on('open', () => {
      opened = true;
      banner('');
      if (G.phase === 'setup') enterLobby();
    });
    peer.on('connection', setupConn);
    peer.on('disconnected', () => {
      if (peer.destroyed || peer !== G.peer) return;
      banner('Lost the connection to the game relay. Reconnecting… (players already in can keep playing)');
      setTimeout(() => {
        if (!peer.destroyed && peer.disconnected) {
          try {
            peer.reconnect();
          } catch (e) {
            /* retried on the next disconnect */
          }
        }
      }, 2000);
    });
    peer.on('error', (err) => {
      if (peer !== G.peer) return;
      if (err.type === 'unavailable-id') {
        peer.destroy();
        return startPeer();
      }
      if (err.type === 'peer-unavailable') return;
      if (!opened) {
        peer.destroy();
        G.peer = null;
        renderSetup();
        banner("Couldn't open a game (" + err.type + '). Check your internet connection and try again.');
        return;
      }
      if (peer.disconnected && !peer.destroyed) {
        setTimeout(() => {
          if (!peer.destroyed && peer.disconnected) {
            try {
              peer.reconnect();
            } catch (e) {
              /* retried later */
            }
          }
        }, 4000);
      }
    });
  }

  function setupConn(conn) {
    conn.on('data', (msg) => onMessage(conn, msg));
    conn.on('close', () => onConnGone(conn));
    conn.on('error', () => onConnGone(conn));
  }

  function playerByConn(conn) {
    for (const p of G.players.values()) if (p.conn === conn) return p;
    return null;
  }

  function onConnGone(conn) {
    const p = playerByConn(conn);
    if (!p) return;
    p.conn = null;
    p.online = false;
    renderPlayers();
    if (G.phase === 'question') checkAllAnswered();
  }

  function onMessage(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    const p = playerByConn(conn);
    if (p) {
      p.lastSeen = Date.now();
      if (!p.online) {
        p.online = true;
        renderPlayers();
      }
    }
    if (msg.t === 'join') handleJoin(conn, msg);
    else if (msg.t === 'answer' && p) handleAnswer(p, msg);
    else if (p && hooks.onMessage) hooks.onMessage(p, msg);
  }

  // A player gone quiet: no open connection, or no reply to pings for a while.
  const isGone = (p) => !p.conn || !p.conn.open || Date.now() - p.lastSeen > 9000;

  // Hook a player up to a (new) connection. If another tab still holds them, tell it to step aside.
  function attach(p, conn) {
    if (p.conn && p.conn !== conn) {
      const old = p.conn;
      p.conn = null;
      send(old, { t: 'replaced' });
      setTimeout(() => {
        try {
          old.close();
        } catch (e) {
          /* already closed */
        }
      }, 400);
    }
    p.conn = conn;
    p.online = true;
    p.lastSeen = Date.now();
    send(conn, { t: 'view', view: viewFor(p) });
    renderPlayers();
  }

  // The same person under a new player id (their browser forgot the old one): keep their spot and score.
  function rekey(p, pid) {
    const old = p.pid;
    G.players = new Map([...G.players].map(([k, v]) => (k === old ? [pid, v] : [k, v])));
    if (G.answers.has(old)) {
      G.answers.set(pid, G.answers.get(old));
      G.answers.delete(old);
    }
    p.pid = pid;
  }

  function handleJoin(conn, msg) {
    const pid = String(msg.pid || '').slice(0, 40);
    if (!pid) return;
    if (G.kicked.has(pid)) return send(conn, { t: 'kicked' });
    const owner = playerByConn(conn);
    if (owner && owner.pid !== pid) return; // one connection, one player
    let p = G.players.get(pid);
    if (p) return attach(p, conn); // same phone coming back (slept, switched apps, reloaded, new tab)
    const name = KB.cleanName(msg.name);
    if (!name) return send(conn, { t: 'reject', reason: 'name', msg: 'Type a nickname first.' });
    const same = list().find((o) => o.name.toLowerCase() === name.toLowerCase());
    if (same) {
      const reclaim = () => {
        rekey(same, pid);
        if (KB.AVATARS.includes(msg.avatar)) same.avatar = msg.avatar;
        attach(same, conn);
        if (G.phase === 'lobby') {
          say('Welcome back, ' + same.name + '!', 'shout');
          G.quietUntil = Date.now() + 4000;
        }
      };
      if (isGone(same)) return reclaim();
      // Their old connection may have died without telling us (phone left the browser). Ask it:
      // no answer means the nickname goes back to whoever is here now.
      const asked = Date.now();
      send(same.conn, { t: 'ping' });
      setTimeout(() => {
        if (!conn.open || same.conn === conn || G.players.get(same.pid) !== same) return;
        if (same.lastSeen >= asked && same.conn && same.conn.open) {
          send(conn, { t: 'reject', reason: 'name', msg: '\u201c' + name + '\u201d is already playing. Pick another nickname.' });
        } else {
          reclaim();
        }
      }, 2500);
      return;
    }
    if (G.locked) return send(conn, { t: 'reject', reason: 'locked', msg: 'This game is locked. Ask the host to unlock it.' });
    if (G.players.size >= 100) return send(conn, { t: 'reject', reason: 'full', msg: 'This game is full (100 players).' });
    p = {
      pid,
      tag: KB.uid('t'),
      name,
      avatar: KB.AVATARS.includes(msg.avatar) ? msg.avatar : KB.AVATARS[0],
      conn,
      online: true,
      lastSeen: Date.now(),
      joinedAt: Date.now(),
      score: 0,
      streak: 0,
      correctCount: 0,
      rank: 0,
      prevRank: 0,
      ahead: null,
      last: null,
      gain: 0,
    };
    G.players.set(pid, p);
    if (G.phase !== 'lobby') rankPlayers();
    S.pop();
    renderPlayers(p.pid);
    if (G.phase === 'lobby') {
      say('Welcome, ' + name + '!', 'shout');
      G.quietUntil = Date.now() + 4000;
    }
    send(conn, { t: 'view', view: viewFor(p) });
  }

  function handleAnswer(p, msg) {
    if (G.phase !== 'question' || msg.q !== G.qi || G.answers.has(p.pid)) return;
    if (hooks.isContestant && !hooks.isContestant(p)) return;
    const choice = Number(msg.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= cur().answers.length) return;
    G.answers.set(p.pid, { choice, ms: Math.max(0, performance.now() - G.qStart) });
    send(p.conn, { t: 'view', view: viewFor(p) });
    S.blip();
    const c = $('#ans-count');
    if (c) {
      c.textContent = G.answers.size;
      c.classList.remove('bump');
      void c.offsetWidth;
      c.classList.add('bump');
    }
    if (hooks.onAnswer) hooks.onAnswer(p);
    checkAllAnswered();
  }

  function checkAllAnswered() {
    if (G.phase !== 'question') return;
    const online = contestants().filter((p) => p.online);
    if (online.length && online.every((p) => G.answers.has(p.pid))) endQuestion(true);
  }

  function kick(pid) {
    const p = G.players.get(pid);
    if (!p) return;
    G.kicked.add(pid);
    G.players.delete(pid);
    G.answers.delete(pid);
    if (p.conn) {
      send(p.conn, { t: 'kicked' });
      const c = p.conn;
      setTimeout(() => c.close(), 600);
    }
    if (G.phase !== 'lobby') rankPlayers();
    renderPlayers();
    if (G.phase === 'question') checkAllAnswered();
  }

  // Heartbeat: lets both sides notice dead connections (sleeping phones, Wi-Fi drops).
  setInterval(() => {
    if (G.phase === 'setup') return;
    const now = Date.now();
    let changed = false;
    for (const p of G.players.values()) {
      if (p.conn) send(p.conn, { t: 'ping' });
      const online = !!(p.conn && p.conn.open) && now - p.lastSeen < 12000;
      if (online !== p.online) {
        p.online = online;
        changed = true;
      }
    }
    if (changed) {
      renderPlayers();
      checkAllAnswered();
    }
  }, 4000);

  // ---------- what each phone shows ----------
  function viewFor(p) {
    const v = baseView(p);
    return hooks.view ? hooks.view(p, v) || v : v;
  }

  function baseView(p) {
    const v = { name: p.name, avatar: p.avatar, score: p.score, rank: p.rank, ahead: p.ahead };
    const q = cur();
    const total = G.questions.length;
    switch (G.phase) {
      case 'intro':
        return Object.assign(v, { screen: 'intro', q: G.qi, total });
      case 'question':
      case 'boom': {
        const a = G.answers.get(p.pid);
        if (a) return Object.assign(v, { screen: 'answered', choice: a.choice });
        if (G.phase === 'boom') return Object.assign(v, { screen: 'wait' });
        return Object.assign(v, {
          screen: 'question',
          q: G.qi,
          total,
          n: q.answers.length,
          labels: q.type === 'tf' ? ['True', 'False'] : null,
          duration: G.duration * 1000,
          endsIn: Math.max(0, Math.round(G.qEnd - performance.now())),
        });
      }
      case 'reveal':
        return Object.assign(v, { screen: 'result', last: p.last && p.last.q === G.qi ? p.last : null });
      case 'board':
        return Object.assign(v, { screen: 'standing' });
      case 'podium':
        return Object.assign(v, { screen: 'end', correct: p.correctCount, total });
      default:
        return Object.assign(v, { screen: 'lobby' });
    }
  }

  // ---------- scoring ----------
  function scoreQuestion() {
    const q = cur();
    const dur = G.duration * 1000;
    G.counts = q.answers.map(() => 0);
    for (const p of contestants()) {
      p.prevRank = p.rank;
      const a = G.answers.get(p.pid);
      if (a) G.counts[a.choice]++;
      if (a && q.answers[a.choice].correct) {
        p.streak++;
        const base = Math.round(1000 * (1 - Math.min(a.ms, dur) / dur / 2));
        const bonus = Math.min((p.streak - 1) * 100, 500);
        p.gain = hooks.adjustPoints ? hooks.adjustPoints(p, base + bonus) : base + bonus;
        p.score += p.gain;
        p.correctCount++;
        p.last = { q: G.qi, answered: true, correct: true, points: p.gain, bonus, streak: p.streak };
        if (p.gain > base + bonus) p.last.boost = p.gain - (base + bonus);
      } else {
        p.gain = 0;
        p.last = { q: G.qi, answered: !!a, correct: false, points: 0, lostStreak: p.streak >= 2 };
        p.streak = 0;
      }
    }
    rankPlayers();
    if (hooks.afterScore) hooks.afterScore();
  }

  function rankPlayers() {
    const sorted = contestants().sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
    sorted.forEach((p, i) => {
      const prev = sorted[i - 1];
      p.rank = prev && prev.score === p.score ? prev.rank : i + 1;
      let ahead = null;
      for (let j = i - 1; j >= 0; j--) {
        if (sorted[j].score > p.score) {
          ahead = sorted[j];
          break;
        }
      }
      p.ahead = ahead ? { name: ahead.name, gap: ahead.score - p.score } : null;
    });
    G.ranked = sorted;
  }

  // ---------- game flow ----------
  function enterLobby() {
    G.phase = 'lobby';
    document.body.classList.remove('setup-mode');
    render();
    broadcast();
    S.music('lobby');
    KB.keepAwake();
  }

  function startGame() {
    if (!G.players.size) return toast('Wait for at least one player to join.');
    const warn = hooks.canStart ? hooks.canStart() : '';
    if (warn) return toast(warn);
    S.unlock();
    if (hooks.onStart) hooks.onStart();
    G.qi = -1;
    nextQuestion();
  }

  function nextQuestion() {
    clearTimers();
    G.qi++;
    if (G.qi >= G.questions.length) return showPodium();
    G.answers = new Map();
    if (hooks.beginQuestion && hooks.beginQuestion()) return;
    G.phase = 'intro';
    G.introMs = Math.min(7000, 3000 + cur().text.length * 30);
    render();
    broadcast();
    S.stopMusic();
    S.whoosh();
    later(startAnswering, G.introMs);
  }

  // force: a mode calls this from its own pre-answer phase (Classic always comes from 'intro').
  function startAnswering(force) {
    if (G.phase !== 'intro' && force !== true) return;
    clearTimers();
    G.phase = 'question';
    G.qStart = performance.now();
    G.qEnd = G.qStart + G.duration * 1000;
    G.lastSec = null;
    if (hooks.onAnswerStart) hooks.onAnswerStart();
    render();
    broadcast();
    S.music('question');
    runFuse();
    // Backup in case this tab is in the background (animation frames pause there).
    later(() => endQuestion(false), G.duration * 1000 + 150);
  }

  function endQuestion(early) {
    if (G.phase !== 'question') return;
    G.phase = 'boom';
    G.revealReady = false;
    cancelAnimationFrame(G.raf);
    clearTimers();
    const go = () => {
      S.stopMusic(0.05);
      scoreQuestion();
      G.phase = 'reveal';
      broadcast();
      blastWrong().then(() => {
        if (G.phase !== 'reveal') return;
        render();
        G.revealReady = true;
        S.correct();
        if (hooks.afterReveal) hooks.afterReveal();
      });
    };
    if (early) rushFuse(450, go);
    else go();
  }

  // Time's up: Granny fires a rocket at every wrong answer.
  function blastWrong() {
    const q = cur();
    const g = granny();
    if (g) g.classList.remove('urgent');
    say(pick(LINES.fire), 'shout');
    const tiles = [...stage.querySelectorAll('.tiles .tile')];
    const wrong = tiles.filter((t, i) => q.answers[i] && !q.answers[i].correct);
    const area = stage.querySelector('.tiles');
    const targets = wrong.length ? wrong : area ? [area] : [];
    const shots = targets.map((el, k) => KBFx.sleep(250 + k * 280).then(() => shoot(g, el, k === 0)));
    return Promise.all(shots).then(() => KBFx.sleep(targets.length ? 750 : 300));
  }

  // The wreck on a tile is drawn from a seed, so the reveal screen redraws the very same damage.
  const WRECK_SALT = Math.floor(Math.random() * 1e6);
  const wreckSeed = (i) => WRECK_SALT + (G.qi + 1) * 97 + i * 13;

  function shoot(g, el, first) {
    KBFx.fire(g);
    S.launch();
    const to = KBFx.center(el);
    const from = KBFx.muzzle(g) || { x: 0, y: window.innerHeight * 0.6 };
    return KBFx.rocket(from, to, { size: Math.max(56, window.innerWidth * 0.065), duration: 560, arc: 0.18 }).then(() => {
      const h = Math.min(el.offsetHeight, 240);
      if (first) {
        S.boom();
        blast();
      } else {
        S.smallBoom();
      }
      KBFx.explode(to, { size: h * (first ? 2.3 : 1.8), word: first ? '' : pick(KBFx.BOOM_WORDS) });
      if (el.classList.contains('tile')) {
        el.classList.add('blasted');
        KBFx.wreck(el, wreckSeed([...el.parentNode.children].indexOf(el)));
      }
      KBFx.shake(stage);
    });
  }

  function afterReveal() {
    if (!G.revealReady) return;
    if (G.qi >= G.questions.length - 1) return showPodium();
    G.phase = 'board';
    render();
    broadcast();
    S.whoosh();
  }

  function showPodium() {
    clearTimers();
    G.phase = 'podium';
    rankPlayers();
    render();
    broadcast();
    S.stopMusic();
    S.drumroll(1.8);
    const reveal = (n, fn) =>
      later(() => {
        const el = document.querySelector('.place.p' + n);
        if (el) el.classList.add('show');
        fn();
      }, { 3: 1900, 2: 2800, 1: 3800 }[n]);
    reveal(3, S.reveal);
    reveal(2, S.reveal);
    reveal(1, () => {
      S.fanfare();
      confetti();
      const w = G.ranked[0];
      say(w ? 'Cookies for ' + w.name + '!' : 'What a game!', 'shout');
      fireworks();
    });
  }

  // Granny shoots celebration rockets into the sky.
  function fireworks() {
    const palettes = [
      ['#2f6fe0', '#7cc4ff', '#ffffff'],
      ['#7b3fe4', '#ff6bd6', '#ffe14d'],
      ['#1fa855', '#ffe14d', '#ffffff'],
      ['#ff4d2e', '#ff9f1c', '#ffe14d'],
    ];
    const words = ['YAY!', 'WOO!', 'BRAVO!', 'WAHOO!'];
    palettes.forEach((colors, i) =>
      later(() => {
        if (G.phase !== 'podium') return;
        const g = granny();
        KBFx.fire(g);
        S.launch();
        const to = { x: window.innerWidth * (0.3 + Math.random() * 0.6), y: window.innerHeight * (0.1 + Math.random() * 0.25) };
        KBFx.rocket(KBFx.muzzle(g) || { x: 0, y: window.innerHeight }, to, { size: 60, duration: 650, arc: 0.3 }).then(() => {
          S.smallBoom();
          KBFx.explode(to, { size: Math.min(220, window.innerWidth * 0.17), colors, word: words[i] });
        });
      }, 300 + i * 500)
    );
  }

  function playAgain() {
    const sel = $('#again-quiz');
    const quiz = G.quizzes.find((z) => z.id === (sel ? sel.value : G.quiz.id)) || G.quiz;
    if (!loadQuiz(quiz)) return;
    clearTimers();
    useMode(G.modeId); // fresh mode state; roles (like Grandma) stay on the players
    for (const p of G.players.values()) Object.assign(p, { score: 0, streak: 0, correctCount: 0, rank: 0, prevRank: 0, ahead: null, last: null, gain: 0 });
    G.qi = -1;
    G.phase = 'lobby';
    render();
    broadcast();
    S.music('lobby');
  }

  function endGame() {
    if (!confirm('End the game for everyone?')) return;
    for (const p of G.players.values()) send(p.conn, { t: 'closed' });
    G.phase = 'setup';
    setTimeout(() => location.reload(), 500);
  }

  function primary() {
    S.unlock();
    if (hooks.onPrimary && hooks.onPrimary()) return;
    if (G.phase === 'lobby') startGame();
    else if (G.phase === 'intro') startAnswering();
    else if (G.phase === 'reveal') afterReveal();
    else if (G.phase === 'board') nextQuestion();
  }

  // ---------- quiz choice (setup screen) ----------
  function loadQuiz(quiz) {
    const qs = quiz ? quiz.questions.filter((q) => !KB.questionProblem(q)).map(KB.playable) : [];
    if (!qs.length) {
      toast('That quiz has no finished questions yet. Open the editor to finish it.');
      return false;
    }
    G.quiz = quiz;
    G.questions = qs;
    return true;
  }

  function renderSetup() {
    document.body.classList.add('setup-mode');
    G.quizzes = KB.loadQuizzes();
    const want = G.quizId || KB.params.get('quiz');
    G.quizId = (G.quizzes.find((z) => z.id === want) || G.quizzes[0] || {}).id || null;
    updateTopbar();
    const cards = G.quizzes
      .map((z) => {
        const ready = z.questions.filter((q) => !KB.questionProblem(q)).length;
        const todo = z.questions.length - ready;
        return (
          '<button class="quiz-card" type="button" data-quiz="' + esc(z.id) + '" aria-pressed="' + (z.id === G.quizId) + '">' +
          '<b>' + esc(z.title) + '</b><span class="muted">' + ready + ' question' + (ready === 1 ? '' : 's') +
          (todo ? ' · ' + todo + ' unfinished' : '') + '</span></button>'
        );
      })
      .join('');
    const chosen = G.quizzes.find((z) => z.id === G.quizId);
    const todo = chosen ? chosen.questions.filter((q) => KB.questionProblem(q)).length : 0;
    stage.innerHTML =
      '<section class="setup">' +
      '<div class="setup-hero"><div><h1>Host a game</h1><p class="muted">Granny Boom runs the show. Put this screen on the TV or projector; players join on their phones. ' +
      'This tab runs the game, so keep it open until the end.</p></div>' +
      KBFx.granny({ mood: 'happy', say: 'Ready to rumble, dear?', cls: 'setup-granny' }) +
      '</div>' +
      '<div><h2>1. Game mode</h2><div class="mode-pick">' +
      KB.MODES.map(
        (m) =>
          '<button class="mode-card" type="button" data-mode="' + esc(m.id) + '" aria-pressed="' + (m.id === G.modeId) + '">' +
          '<span class="mode-icon">' + m.icon + '</span><b>' + esc(m.name) + '</b><span class="muted">' + esc(m.tagline) + '</span></button>'
      ).join('') +
      '</div></div>' +
      '<div><h2>2. Pick a quiz</h2>' +
      (cards ? '<div class="quiz-pick">' + cards + '</div>' : '<p class="note">No quizzes yet. <a href="edit.html">Make one in the editor</a>.</p>') +
      '</div>' +
      '<div><h2>3. Time per question</h2><div class="chips">' +
      KB.TIMERS.map((t) => '<button class="chip" type="button" data-timer="' + t + '" aria-pressed="' + (t === G.duration) + '">' + t + ' sec</button>').join('') +
      '</div></div>' +
      (todo ? '<p class="note">' + todo + ' unfinished question' + (todo === 1 ? '' : 's') + ' in this quiz will be skipped.</p>' : '') +
      '<div class="setup-actions"><button class="btn big" type="button" data-act="open"' + (chosen ? '' : ' disabled') + '>Open lobby</button>' +
      '<a class="btn ghost" href="edit.html' + (chosen ? '#' + encodeURIComponent(chosen.id) : '') + '">Edit quizzes</a></div>' +
      '</section>';
  }

  // ---------- rendering ----------
  function updateTopbar() {
    const inGame = G.phase !== 'setup';
    const pin = $('#pin-pill');
    pin.hidden = !inGame || !G.pin;
    pin.innerHTML = 'PIN <b>' + (G.pin ? fmtPin(G.pin) : '') + '</b>';
    const cnt = $('#count-pill');
    cnt.hidden = !inGame;
    const online = list().filter((p) => p.online).length;
    cnt.textContent = '👥 ' + online + (online !== G.players.size ? ' / ' + G.players.size : '');
    cnt.title = online + ' connected, ' + G.players.size + ' joined';
    const qp = $('#q-pill');
    const showQ = ['intro', 'question', 'boom', 'reveal', 'board', 'pick', 'pickwait', 'crown'].includes(G.phase);
    qp.hidden = !showQ;
    if (showQ) qp.textContent = 'Q ' + (G.qi + 1) + ' / ' + G.questions.length;
    $('#mute').textContent = S.isMuted() ? '🔇' : '🔊';
  }

  function render() {
    updateTopbar();
    stage.classList.remove('shake');
    switch (G.phase) {
      case 'setup':
        return renderSetup();
      case 'lobby':
        return renderLobby();
      case 'intro':
        return renderIntro();
      case 'question':
        return renderQuestion();
      case 'reveal':
        return renderReveal();
      case 'board':
        return renderBoard();
      case 'podium':
        return renderPodium();
      default:
        if (hooks.render) hooks.render(G.phase);
    }
  }

  function joinBase() {
    return new URL('./', location.href).href;
  }

  function qrSvg(text) {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) {
      return '';
    }
  }

  function renderLobby() {
    const base = joinBase();
    const url = base + '?pin=' + G.pin + KB.peerQuery();
    const shown = base.replace(/^https?:\/\//, '').replace(/\/$/, '');
    stage.innerHTML =
      '<div class="lobby-top">' +
      '<div class="join-how">On your phone, go to<span class="url">' + esc(shown) + '</span>and enter the game PIN:' +
      '<div class="big-pin">' + fmtPin(G.pin) + '</div></div>' +
      '<div class="qr" title="Scan to join">' + qrSvg(url) + '</div>' +
      '</div>' +
      '<div class="lobby-mid"><div class="players" id="players"></div>' +
      KBFx.granny({ mood: 'happy', flip: true, say: LINES.lobby[0], cls: 'lobby-granny' }) +
      '</div>' +
      '<div class="lobby-bottom">' +
      '<button class="btn ghost small" type="button" data-act="lock">' + (G.locked ? '🔒 Locked' : '🔓 Lock game') + '</button>' +
      '<span class="grow muted" id="lobby-note">' + esc(G.quiz.title) + ' · ' + G.questions.length + ' questions · ' + G.duration + 's each. ' +
      esc(hooks.lobbyHint || 'Click a name to remove that player.') + '</span>' +
      '<button class="btn big" type="button" data-act="start">Start game ▸</button>' +
      '</div>';
    renderPlayers();
  }

  function renderPlayers(newPid) {
    updateTopbar();
    if (hooks.onRoster) hooks.onRoster();
    const box = $('#players');
    if (!box || G.phase !== 'lobby') return;
    const ps = list();
    box.innerHTML = ps.length
      ? ps
          .map(
            (p) =>
              '<button class="player-chip' + (p.online ? '' : ' offline') + '" type="button" data-kick="' + esc(p.pid) + '" title="Remove ' + esc(p.name) + '"' +
              (p.pid === newPid ? '' : ' style="animation:none"') + '><span class="av">' + esc(p.avatar) + '</span>' + esc(p.name) +
              (hooks.chipBadge ? hooks.chipBadge(p) : '') + '</button>'
          )
          .join('')
      : '<div class="lobby-empty"><div class="spinner"></div>Waiting for players to join…</div>';
    const start = stage.querySelector('[data-act="start"]');
    if (start) start.disabled = !ps.length;
    if (hooks.lobbyNote) {
      const note = hooks.lobbyNote();
      const el = $('#lobby-note');
      if (el) {
        el.innerHTML = note.html;
        el.classList.toggle('warn', !note.ok);
      }
      if (start && !note.ok) start.disabled = true;
    }
  }

  function imageHtml(q) {
    const src = safeImg(q.image);
    return src ? '<img src="' + esc(src) + '" alt="">' : '';
  }

  function renderIntro() {
    const q = cur();
    const line = G.qi === 0 ? 'First question, sweeties!' : G.qi === G.questions.length - 1 ? 'Last one! Make it count!' : pick(LINES.intro);
    stage.innerHTML =
      '<div class="intro">' +
      KBFx.granny({ mood: 'shout', say: line, cls: 'intro-granny' }) +
      '<div class="intro-main">' +
      '<div class="q-meta">Question ' + (G.qi + 1) + ' of ' + G.questions.length + (q.type === 'tf' ? ' · True or false' : '') + '</div>' +
      '<div class="q-text">' + esc(q.text) + '</div>' +
      (safeImg(q.image) ? '<div class="q-image">' + imageHtml(q) + '</div>' : '') +
      '<div class="intro-bar"><i style="animation-duration:' + G.introMs + 'ms"></i></div>' +
      '</div></div>' +
      '<div class="host-actions"><button class="btn ghost small" type="button" data-act="skip-intro">Skip ▸</button></div>';
  }

  function tilesHtml(q, revealed) {
    return (
      '<div class="tiles' + (revealed ? ' revealed' : '') + ' n' + q.answers.length + '">' +
      q.answers
        .map(
          (a, i) =>
            '<div class="tile c' + (i + 1) + (revealed ? (a.correct ? ' right' : ' wrong blasted') : '') + '">' +
            '<span class="n">' + (i + 1) + '</span><span class="tx">' + esc(a.text) + '</span>' +
            (revealed && a.correct ? '<span class="mark">✓</span>' : '') +
            '</div>'
        )
        .join('') +
      '</div>'
    );
  }

  const RING_R = 46;
  const RING_C = 2 * Math.PI * RING_R;

  function timerSvg() {
    return (
      '<svg viewBox="0 0 140 140" aria-hidden="true">' +
      '<circle cx="70" cy="70" r="61" fill="#fff" stroke="#1b1233" stroke-width="7"/>' +
      '<circle cx="70" cy="70" r="' + RING_R + '" fill="none" stroke="#ebe6f7" stroke-width="14"/>' +
      '<circle class="ring-fill" cx="70" cy="70" r="' + RING_R + '" fill="none" stroke-width="14" stroke-linecap="round" transform="rotate(-90 70 70)" stroke-dasharray="' +
      RING_C.toFixed(2) + '" stroke-dashoffset="0"/>' +
      '<text class="secs" x="70" y="88" text-anchor="middle">' + G.duration + '</text>' +
      '<g class="spark"><circle r="12" fill="#ff6b2c" opacity=".55"/><circle r="7.5" fill="#ffd23f" stroke="#1b1233" stroke-width="2"/><circle r="3" fill="#fff"/></g>' +
      '</svg>'
    );
  }

  function renderQuestion() {
    const q = cur();
    const hasImg = !!safeImg(q.image);
    const answered = '<div class="answered"><b id="ans-count">' + G.answers.size + '</b><span>answers</span></div>';
    const endBtn = '<p><button class="btn ghost small" type="button" data-act="end-q">End now</button></p>';
    const timer = '<div class="timer' + (hasImg ? '' : ' hero') + '" id="timer">' + timerSvg() + '</div>';
    const extras = hooks.sideExtras ? hooks.sideExtras() : '';
    // Granny on the left. The timer takes the middle, unless there's a picture.
    const mid =
      '<div class="side granny-side">' + KBFx.granny({ mood: 'happy', say: pick(LINES.go), cls: 'q-granny' }) + '</div>' +
      (hasImg
        ? '<div class="q-image">' + imageHtml(q) + '</div><div class="side">' + extras + timer + answered + endBtn + '</div>'
        : '<div class="q-image">' + timer + '</div><div class="side">' + extras + answered + endBtn + '</div>');
    stage.innerHTML = '<div class="q-text">' + esc(q.text) + '</div><div class="q-mid">' + mid + '</div>' + tilesHtml(q, false);
  }

  // The ring is a burning fuse: f is the fraction of time left.
  function drawTimer(f) {
    const fill = stage.querySelector('.ring-fill');
    const spark = stage.querySelector('.timer .spark');
    if (!fill) return;
    f = Math.max(0, Math.min(1, f));
    fill.style.strokeDashoffset = (RING_C * (1 - f)).toFixed(2);
    const a = -Math.PI / 2 + 2 * Math.PI * f;
    spark.setAttribute(
      'transform',
      'translate(' + (70 + RING_R * Math.cos(a)).toFixed(1) + ' ' + (70 + RING_R * Math.sin(a)).toFixed(1) + ') scale(' + (1 + Math.random() * 0.4).toFixed(2) + ')'
    );
  }

  function runFuse() {
    const secs = stage.querySelector('.timer .secs');
    const timer = $('#timer');
    const total = G.duration * 1000;
    const step = () => {
      if (G.phase !== 'question') return;
      const left = Math.max(0, G.qEnd - performance.now());
      drawTimer(left / total);
      const s = Math.ceil(left / 1000);
      if (s !== G.lastSec) {
        if (G.lastSec !== null && s > 0 && s <= 5) S.tick(true);
        if (G.lastSec !== null && s === 5) {
          say(pick(LINES.hurry), 'shock');
          const g = granny();
          if (g) g.classList.add('urgent');
        }
        G.lastSec = s;
        if (secs) secs.textContent = s;
        if (timer) timer.classList.toggle('urgent', s <= 5);
      }
      if (left <= 0) return endQuestion(false);
      G.raf = requestAnimationFrame(step);
    };
    step();
  }

  // Everyone answered: burn the rest of the fuse quickly, then fire.
  function rushFuse(ms, done) {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      done();
    };
    if (!$('#timer')) return finish();
    const from = Math.max(0, G.qEnd - performance.now()) / (G.duration * 1000);
    const t0 = performance.now();
    const secs = stage.querySelector('.timer .secs');
    const step = () => {
      if (finished) return;
      const k = Math.min(1, (performance.now() - t0) / ms);
      const f = from * (1 - k);
      drawTimer(f);
      if (secs) secs.textContent = Math.ceil(f * G.duration);
      if (k < 1) requestAnimationFrame(step);
      else finish();
    };
    requestAnimationFrame(step);
    setTimeout(finish, ms + 400); // animation frames pause in background tabs
  }

  function blast() {
    const layer = $('#blast-layer');
    layer.innerHTML = '<div class="blast"><div class="flash"></div><div class="word">KABOOM!</div></div>';
    stage.classList.remove('shake');
    void stage.offsetWidth;
    stage.classList.add('shake');
    setTimeout(() => (layer.innerHTML = ''), 1300);
  }

  function renderReveal() {
    const q = cur();
    const max = Math.max(1, ...G.counts);
    const right = contestants().filter((p) => p.last && p.last.q === G.qi && p.last.correct).length;
    const bars = q.answers
      .map(
        (a, i) =>
          '<div class="bar' + (a.correct ? '' : ' wrong') + '"><span class="lbl">' + (a.correct ? '✓ ' : '') + G.counts[i] + '</span>' +
          '<div class="fill c' + (i + 1) + '" style="height:' + Math.max(4, (G.counts[i] / max) * 100) + '%"></div></div>'
      )
      .join('');
    const last = G.qi >= G.questions.length - 1;
    const total = contestants().length;
    let line = right === 1 ? 'Just one clever cookie!' : right + ' clever cookies!';
    let mood = 'happy';
    if (!right) {
      line = pick(['Oh dear, nobody got it!', 'Not one of you? Oh, sweeties!']);
      mood = 'shock';
    } else if (right === total) {
      line = 'Clever cookies, every one of you!';
    }
    stage.innerHTML =
      '<div class="q-text">' + esc(q.text) + '</div>' +
      '<div class="q-mid">' +
      '<div class="side granny-side">' + KBFx.granny({ mood, say: line, cls: 'q-granny' }) + '</div>' +
      '<div class="bars">' + bars + '</div>' +
      '<div class="side">' + (hooks.sideExtras ? hooks.sideExtras() : '') + '<div class="answered"><b>' + right + '/' + total + '</b><span>got it right</span></div>' +
      '<p><button class="btn big" type="button" data-act="next">' + (last ? 'Final results ▸' : 'Leaderboard ▸') + '</button></p></div>' +
      '</div>' +
      tilesHtml(q, true);
    stage.querySelectorAll('.tiles .tile').forEach((t, i) => {
      if (t.classList.contains('blasted')) KBFx.wreck(t, wreckSeed(i));
    });
  }

  function renderBoard() {
    const top = G.ranked.slice(0, 5);
    const rows = top
      .map((p, i) => {
        const moved = p.prevRank ? p.prevRank - p.rank : 0;
        return (
          '<div class="lb-row" style="animation-delay:' + i * 0.08 + 's"><span class="rk">' + p.rank + '</span><span class="av">' + esc(p.avatar) + '</span>' +
          '<span class="nm">' + esc(p.name) + '</span>' +
          (moved > 0 ? '<span class="mv">▲ ' + moved + '</span>' : moved < 0 ? '<span class="mv down">▼ ' + -moved + '</span>' : '') +
          (p.gain ? '<span class="gain">+' + KB.num(p.gain) + '</span>' : '') +
          '<span class="sc">' + KB.num(p.score) + '</span></div>'
        );
      })
      .join('');
    const streaker = G.ranked.filter((p) => p.streak >= 3).sort((a, b) => b.streak - a.streak)[0];
    const leader = G.ranked[0];
    const line = streaker
      ? streaker.name + ' is on fire!'
      : leader
        ? pick([leader.name + ' is in the lead!', 'Look at you go, ' + leader.name + '!', 'Watch out for ' + leader.name + '!'])
        : 'Ooh, close race!';
    stage.innerHTML =
      '<div class="board-wrap">' + KBFx.granny({ mood: 'happy', say: line, cls: 'side-granny bubble-top' }) +
      '<div class="board"><h2>Leaderboard</h2>' + rows +
      (streaker ? '<p class="q-meta" style="text-align:center">🔥 ' + esc(streaker.name) + ' is on a ' + streaker.streak + '-answer streak!</p>' : '') +
      (hooks.boardExtras ? hooks.boardExtras() : '') +
      '</div></div>' +
      '<div class="host-actions"><button class="btn big" type="button" data-act="next-q">Next question ▸</button></div>';
  }

  function renderPodium() {
    const place = (n) => {
      const p = G.ranked[n - 1];
      if (!p) return '<div class="place p' + n + '"></div>';
      return (
        '<div class="place p' + n + '"><span class="av">' + esc(p.avatar) + '</span><span class="nm">' + esc(p.name) + '</span>' +
        '<span class="sc">' + KB.num(p.score) + ' pts</span><div class="block">' + p.rank + '</div></div>'
      );
    };
    stage.innerHTML =
      '<div class="podium-wrap"><h2>' + esc(G.quiz.title) + '</h2>' +
      '<div class="podium-row">' + KBFx.granny({ mood: 'shock', say: 'And the winner is\u2026', cls: 'side-granny bubble-top' }) +
      '<div class="podium">' + place(2) + place(1) + place(3) + '</div></div>' +
      endActionsHtml(hooks.podiumActions ? hooks.podiumActions() : '') +
      '</div>';
  }

  function endActionsHtml(first) {
    const options = G.quizzes
      .filter((z) => z.questions.some((q) => !KB.questionProblem(q)))
      .map((z) => '<option value="' + esc(z.id) + '"' + (z.id === G.quiz.id ? ' selected' : '') + '>' + esc(z.title) + '</option>')
      .join('');
    return (
      '<div class="end-actions">' +
      (first || '') +
      '<button class="btn ghost" type="button" data-act="results">All results</button>' +
      '<button class="btn ghost" type="button" data-act="csv">Download CSV</button>' +
      '<select id="again-quiz" aria-label="Quiz for the next round">' + options + '</select>' +
      '<button class="btn" type="button" data-act="again">Play again ▸</button>' +
      '<button class="btn ghost" type="button" data-act="end-game">End game</button>' +
      '</div>'
    );
  }

  function confetti() {
    const colors = ['#e5432a', '#2f6fe0', '#f5b301', '#7b3fe4', '#ffd23f', '#ff6b2c'];
    for (let i = 0; i < 120; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--dx', (Math.random() * 200 - 100).toFixed(0) + 'px');
      c.style.setProperty('--rot', (Math.random() * 1440 - 720).toFixed(0) + 'deg');
      c.style.animationDuration = (2.2 + Math.random() * 2).toFixed(2) + 's';
      c.style.animationDelay = (Math.random() * 0.8).toFixed(2) + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 5500);
    }
  }

  function showResults() {
    const d = $('#results');
    d.innerHTML =
      '<h2 class="display" style="margin:0 0 12px">All results</h2><table><thead><tr><th>#</th><th>Player</th><th class="r">Correct</th><th class="r">Score</th></tr></thead><tbody>' +
      G.ranked
        .map((p) => '<tr><td>' + p.rank + '</td><td>' + esc(p.avatar + ' ' + p.name) + '</td><td class="r">' + p.correctCount + '/' + G.questions.length + '</td><td class="r">' + KB.num(p.score) + '</td></tr>')
        .join('') +
      '</tbody></table><p style="text-align:right;margin:16px 0 0"><button class="btn small" type="button" id="close-results">Close</button></p>';
    d.showModal();
    $('#close-results').onclick = () => d.close();
  }

  function downloadCsv() {
    // Quote every cell; prefix text that a spreadsheet would treat as a formula.
    const cell = (s) => '"' + String(s).replace(/^([=+\-@])/, "'$1").replace(/"/g, '""') + '"';
    const rows = [['Rank', 'Player', 'Correct', 'Questions', 'Score']].concat(G.ranked.map((p) => [p.rank, p.name, p.correctCount, G.questions.length, p.score]));
    const day = new Date().toISOString().slice(0, 10);
    KB.download('kaboom-' + day + '.csv', rows.map((r) => r.map(cell).join(',')).join('\n'), 'text/csv');
  }

  // ---------- events ----------
  stage.addEventListener('click', (e) => {
    S.unlock();
    const quiz = e.target.closest('[data-quiz]');
    if (quiz) {
      G.quizId = quiz.dataset.quiz;
      return renderSetup();
    }
    const timer = e.target.closest('[data-timer]');
    if (timer) {
      G.duration = Number(timer.dataset.timer);
      return renderSetup();
    }
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) {
      G.modeId = KB.getMode(modeBtn.dataset.mode).id;
      KB.store.set('kaboom.mode', G.modeId);
      return renderSetup();
    }
    const kickBtn = e.target.closest('[data-kick]');
    if (kickBtn) {
      const p = G.players.get(kickBtn.dataset.kick);
      if (p && hooks.chipActions) return playerMenu(p);
      if (p && confirm('Remove ' + p.name + ' from the game?')) kick(p.pid);
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    switch (btn.dataset.act) {
      case 'open': {
        const quizObj = G.quizzes.find((z) => z.id === G.quizId);
        if (!loadQuiz(quizObj)) return;
        KB.store.set('kaboom.timer', G.duration);
        useMode(G.modeId);
        startPeer();
        break;
      }
      case 'lock':
        G.locked = !G.locked;
        btn.textContent = G.locked ? '🔒 Locked' : '🔓 Lock game';
        toast(G.locked ? 'Game locked: no new players can join.' : 'Game unlocked: new players can join.');
        break;
      case 'start':
        startGame();
        break;
      case 'skip-intro':
        startAnswering();
        break;
      case 'end-q':
        endQuestion(true);
        break;
      case 'next':
        afterReveal();
        break;
      case 'next-q':
        nextQuestion();
        break;
      case 'results':
        showResults();
        break;
      case 'csv':
        downloadCsv();
        break;
      case 'again':
        playAgain();
        break;
      case 'end-game':
        endGame();
        break;
      default:
        if (hooks.onAct) hooks.onAct(btn.dataset.act, btn);
    }
  });

  // A mode with player roles: clicking a name in the lobby opens a small menu instead of "remove?".
  function playerMenu(p) {
    let d = $('#player-menu');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'player-menu';
      d.className = 'results player-menu';
      document.body.appendChild(d);
    }
    d.innerHTML =
      '<h2 class="display">' + esc(p.avatar + ' ' + p.name) + '</h2><div class="player-menu-acts">' +
      hooks.chipActions(p).map((a) => '<button class="btn" type="button" data-menu="' + esc(a.act) + '">' + esc(a.label) + '</button>').join('') +
      '<button class="btn danger" type="button" data-menu="kick">Remove from game</button>' +
      '<button class="btn ghost" type="button" data-menu="cancel">Cancel</button></div>';
    d.onclick = (e) => {
      const b = e.target.closest('[data-menu]');
      if (!b) return;
      d.close();
      const act = b.dataset.menu;
      if (G.players.get(p.pid) !== p || act === 'cancel') return;
      if (act === 'kick') {
        if (confirm('Remove ' + p.name + ' from the game?')) kick(p.pid);
      } else if (hooks.onChipAction) {
        hooks.onChipAction(act, p);
      }
    };
    d.showModal();
  }

  function toggleMute() {
    S.unlock();
    S.setMuted(!S.isMuted());
    updateTopbar();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  }

  $('#mute').addEventListener('click', toggleMute);
  $('#fs').addEventListener('click', toggleFullscreen);

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea, dialog')) return;
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('button, a')) return;
    if (e.key === 'm' || e.key === 'M') toggleMute();
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      if (G.phase === 'setup') return;
      e.preventDefault();
      primary();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (G.phase !== 'setup' && G.players.size) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  window.addEventListener('pagehide', () => {
    for (const p of G.players.values()) send(p.conn, { t: 'closed' });
    if (G.peer) G.peer.destroy();
  });

  // The editor saved quizzes in another tab.
  window.addEventListener('storage', (e) => {
    if (e.key === KB.QUIZ_KEY && G.phase === 'setup') renderSetup();
  });

  // What a mode can use (js/modes.js).
  const H = {
    G,
    stage,
    $,
    esc,
    S,
    pick,
    say,
    granny,
    send,
    broadcast,
    render,
    renderPlayers,
    toast,
    later,
    clearTimers,
    cur,
    list,
    contestants,
    viewFor,
    startAnswering,
    tilesHtml,
    imageHtml,
    safeImg,
    confetti,
    endActionsHtml,
  };

  renderSetup();
})();
