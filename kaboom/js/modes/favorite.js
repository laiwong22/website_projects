/* Grandma's Favorite (host side).

   One player is Grandma: she doesn't answer. Before each question she picks a Favorite during a short
   "Pick Me" window; a correct Favorite scores FAVORITE_MULTIPLIER×. Grandma wins if her Favorites' hit
   rate beats the room's correct rate. Rules and config: favorite-rules.js. Phone screens: favorite-phone.js.

   Phases this mode adds:  pick (window) → pickwait (window over, waiting for Grandma) → crown (announcement)
   → Classic answering and reveal → Favorite Spotlight (overlay) → board … podium → verdict → recap. */
(function () {
  'use strict';

  const R = window.KBFavRules;
  const C = R.CONFIG;

  KB.registerMode({
    id: 'favorite',
    name: 'Grandma’s Favorite',
    icon: '👑',
    tagline:
      'One player is Grandma and doesn’t answer. Each round she picks a Favorite, who scores ' + C.FAVORITE_MULTIPLIER +
      '× for a right answer. Grandma wins if her Favorites beat the room.',
    create,
  });

  function create(H) {
    const { G, esc, S } = H;
    const F = {
      maxPicks: 0,
      playersAtStart: 0,
      last: null, // the player picked last round (object, so it survives a rejoin under a new id)
      picks: [], // { q, player, pid: tag, name, status: hit|miss|void, by: grandma|host|random }
      room: { correct: 0, opportunities: 0 },
      sel: null, // who Grandma has selected this round
      fav: null, // { player, by, relaxed } once the pick is locked
      windowEnd: 0,
      ticker: 0,
      lastTick: null,
      snapshot: [], // contestants when answering opened (for the room rate)
      outcome: '',
      hostPicking: false,
      spot: null,
      podiumAt: 0,
    };

    const grandma = () => H.list().find((p) => p.role === 'grandma') || null;
    const gLabel = () => {
      const g = grandma();
      return g ? 'Grandma (' + g.name + ')' : 'Grandma';
    };
    const isFav = (p) => !!(F.fav && F.fav.player === p);
    const inGame = (p) => H.G.players.get(p.pid) === p;
    const present = (p) => inGame(p) && p.online && !!p.conn;
    const byTag = (tag) => H.contestants().find((p) => p.tag === tag) || null;
    const stats = () => R.stats(F.picks, F.room);
    const thisQ = (p) => (p.last && p.last.q === G.qi ? p.last : null);

    function elig() {
      const cs = H.contestants();
      const counts = {};
      cs.forEach((p) => (counts[p.tag] = p.favPicks || 0));
      return R.eligibility(
        cs.map((p) => ({ pid: p.tag, name: p.name, online: !!p.online })),
        { lastPid: F.last ? F.last.tag : null, counts, max: F.maxPicks }
      );
    }

    function sendGrandma() {
      const g = grandma();
      if (g && g.conn) H.send(g.conn, { t: 'view', view: H.viewFor(g) });
    }

    function verdictText() {
      return R.grandmaWins(stats()) ? 'GRANDMA KNOWS WHO KNOWS HER BEST 👵💖' : 'THE ROOM KNOWS GRANDMA BETTER 😤';
    }

    // ---------- lobby ----------
    function canStart() {
      if (!grandma()) return 'Choose a Grandma first: click a player and pick “Make Grandma”.';
      const n = H.contestants().length;
      if (n < 2) return 'Grandma’s Favorite needs at least 2 players besides Grandma (' + n + ' so far).';
      return '';
    }

    function lobbyNote() {
      const warn = canStart();
      if (warn) return { html: '⚠️ ' + esc(warn), ok: false };
      return { html: '👵 ' + esc(gLabel()) + ' · ' + H.contestants().length + ' players · ' + G.questions.length + ' questions', ok: true };
    }

    function onChipAction(act, p) {
      if (act === 'grandma') {
        H.list().forEach((o) => {
          if (o.role === 'grandma') o.role = null;
        });
        p.role = 'grandma';
        H.say(p.name + ' is Grandma today!', 'shout');
        G.quietUntil = Date.now() + 5000;
      } else if (act === 'ungrandma') {
        p.role = null;
      }
      H.renderPlayers();
      H.broadcast();
    }

    function onStart() {
      F.playersAtStart = H.contestants().length;
      F.maxPicks = R.maxPicks(G.questions.length, F.playersAtStart);
      F.picks = [];
      F.room = { correct: 0, opportunities: 0 };
      F.last = null;
      H.list().forEach((p) => (p.favPicks = 0));
    }

    // ---------- pick window ----------
    function beginQuestion() {
      clearInterval(F.ticker);
      F.fav = null;
      F.sel = null;
      F.outcome = '';
      F.hostPicking = false;
      F.lastTick = null;
      F.windowEnd = Date.now() + C.LOBBY_SECONDS * 1000;
      G.phase = 'pick';
      S.stopMusic();
      S.whoosh();
      S.music('lobby');
      H.render();
      H.broadcast();
      F.ticker = setInterval(tick, 200);
      return true;
    }

    function tick() {
      if (G.phase !== 'pick') return clearInterval(F.ticker);
      const left = F.windowEnd - Date.now();
      const secs = Math.max(0, Math.ceil(left / 1000));
      const el = document.getElementById('fav-count');
      if (el) el.textContent = secs;
      if (secs !== F.lastTick) {
        if (F.lastTick !== null && secs > 0 && secs <= 3) S.tick(true);
        F.lastTick = secs;
      }
      if (left <= 0) {
        clearInterval(F.ticker);
        endWindow();
      }
    }

    function endWindow() {
      if (G.phase !== 'pick') return;
      if (F.sel && R.isEligible(elig(), F.sel.tag)) return lock(F.sel, 'grandma');
      G.phase = 'pickwait';
      S.stopMusic(0.4);
      const g = grandma();
      H.render();
      H.broadcast();
      if (!g || !g.online) H.toast(g ? 'Grandma is offline: use Random pick or Pick for Grandma.' : 'No Grandma: use Random pick or Pick for Grandma.');
    }

    function lock(p, by) {
      if (G.phase !== 'pick' && G.phase !== 'pickwait') return false;
      const e = elig();
      if (!p || !R.isEligible(e, p.tag)) {
        refreshPick();
        return false;
      }
      clearInterval(F.ticker);
      p.favPicks = (p.favPicks || 0) + 1;
      F.last = p;
      F.fav = { player: p, by, relaxed: e.relaxed };
      F.hostPicking = false;
      G.phase = 'crown';
      S.stopMusic(0.1);
      S.crown();
      H.render();
      H.broadcast();
      H.later(() => {
        if (G.phase === 'crown') H.startAnswering(true);
      }, C.ANNOUNCE_MS);
      return true;
    }

    // Nobody can be picked (everyone offline): play the question with no Favorite.
    function noFavorite() {
      if (G.phase !== 'pick' && G.phase !== 'pickwait') return;
      clearInterval(F.ticker);
      F.fav = null;
      S.stopMusic(0.1);
      H.startAnswering(true);
    }

    function randomPick() {
      const ok = elig().list.filter((x) => x.eligible);
      if (!ok.length) return H.toast('Nobody can be picked right now.');
      lock(byTag(ok[Math.floor(Math.random() * ok.length)].pid), 'random');
    }

    function refreshPick() {
      if (F.sel && !R.isEligible(elig(), F.sel.tag)) F.sel = null;
      sendGrandma();
      const panel = document.getElementById('fav-panel');
      if (panel && (G.phase === 'pick' || G.phase === 'pickwait')) panel.innerHTML = panelHtml();
    }

    function onMessage(p, msg) {
      if (msg.t !== 'fav-pick' && msg.t !== 'fav-lock') return;
      if (p.role !== 'grandma' || (G.phase !== 'pick' && G.phase !== 'pickwait')) return;
      const target = byTag(String(msg.tag || ''));
      if (!target || !R.isEligible(elig(), target.tag)) return refreshPick();
      F.sel = target;
      if (msg.t === 'fav-lock') return lock(target, 'grandma');
      refreshPick();
    }

    // ---------- answering, scoring ----------
    function onAnswerStart() {
      F.snapshot = H.contestants().slice();
      sendGrandma();
    }

    function onAnswer(p) {
      if (!isFav(p)) return;
      sendGrandma();
      const b = document.getElementById('fav-badge');
      if (b) {
        b.classList.add('locked-in');
        b.querySelector('small').textContent = '✔ locked in';
      }
    }

    // A pick only counts (and only earns the bonus) if the Favorite is still connected when time's up.
    function adjustPoints(p, points) {
      return isFav(p) && present(p) ? R.favoritePoints(points, true, true) : points;
    }

    function afterScore() {
      const results = F.snapshot.map((p) => {
        const l = thisQ(p);
        return { answered: !!(l && l.answered), correct: !!(l && l.correct) };
      });
      const rq = R.roomQuestion(results);
      F.room.correct += rq.correct;
      F.room.opportunities += rq.opportunities;
      if (!F.fav) {
        F.outcome = '';
        return;
      }
      const p = F.fav.player;
      const l = thisQ(p);
      F.outcome = R.pickOutcome({ present: present(p), answered: !!(l && l.answered), correct: !!(l && l.correct) });
      F.picks.push({ q: G.qi, player: p, pid: p.tag, name: p.name, avatar: p.avatar, status: F.outcome, by: F.fav.by });
      if (l) l.favorite = F.outcome;
      sendGrandma();
    }

    // ---------- Favorite Spotlight (after the Classic reveal) ----------
    function afterReveal() {
      if (!F.fav) return;
      if (F.outcome === 'void') {
        H.toast(F.fav.player.name + ' disconnected, so this pick doesn’t count.');
        return;
      }
      runSpotlight();
    }

    // A little rain cloud for a Favorite who let Grandma down.
    const CLOUD =
      '<svg viewBox="0 0 140 80" aria-hidden="true"><g fill="#d5d9e6" stroke="#1b1233" stroke-width="9">' +
      '<circle cx="42" cy="46" r="24"/><circle cx="70" cy="34" r="30"/><circle cx="100" cy="46" r="24"/><rect x="34" y="44" width="72" height="26" rx="13"/></g>' +
      '<g fill="#d5d9e6"><circle cx="42" cy="46" r="24"/><circle cx="70" cy="34" r="30"/><circle cx="100" cy="46" r="24"/><rect x="34" y="44" width="72" height="26" rx="13"/></g>' +
      '<path d="M52,30 q8,-10 20,-8" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/></svg>';

    // Words from the crowd floating up at the sides of the screen.
    function crowdWords(el, words, kind, spanMs) {
      const box = el.querySelector('.spot-crowd');
      const n = Math.max(6, Math.round(spanMs / 240));
      for (let i = 0; i < n; i++) {
        F.spot.timers.push(
          setTimeout(() => {
            if (!box.isConnected) return;
            const w = document.createElement('b');
            w.className = 'crowd-word ' + kind;
            w.textContent = KBFx.pick(words);
            const left = Math.random() < 0.5;
            w.style.left = (left ? 4 + Math.random() * 20 : 76 + Math.random() * 20).toFixed(1) + '%';
            w.style.top = (10 + Math.random() * 48).toFixed(1) + '%';
            w.style.setProperty('--rot', (Math.random() * 30 - 15).toFixed(0) + 'deg');
            w.style.fontSize = 'clamp(26px, ' + (2.6 + Math.random() * 2.2).toFixed(1) + 'vw, 84px)';
            box.appendChild(w);
            setTimeout(() => w.remove(), 1800);
          }, Math.round(i * (spanMs / n)))
        );
      }
    }

    function runSpotlight() {
      const p = F.fav.player;
      const hit = F.outcome === 'hit';
      const after = stats();
      const before = R.stats(F.picks.slice(0, -1), F.room);
      const showAt = C.SPOTLIGHT_BUILDUP_MS;
      const hold = Math.max(1000, C.SPOTLIGHT_MS - showAt); // the cheer or the shame
      G.revealReady = false;
      const el = document.createElement('div');
      el.className = 'fav-spot';
      el.innerHTML =
        '<div class="spot-dim"></div>' +
        '<div class="spot-crowd"></div>' +
        '<div class="spot-card">' +
        '<span class="spot-top"><span class="crown bounce">👑</span><span class="spot-cloud">' + CLOUD +
        '<i style="left:30%;animation-delay:0s"></i><i style="left:45%;animation-delay:.25s"></i><i style="left:60%;animation-delay:.1s"></i>' +
        '<i style="left:72%;animation-delay:.35s"></i><i style="left:38%;animation-delay:.5s"></i></span></span>' +
        '<span class="spot-av">' + esc(p.avatar) + '</span>' +
        '<span class="spot-name">' + esc(p.name) + '</span>' +
        '<span class="spot-score"><b>' + KB.num(p.score) + '</b><i class="spot-pop">+' + C.FAVORITE_MULTIPLIER + '×</i></span>' +
        '<span class="spot-msg"></span>' +
        '<span class="spot-tally">👵 ' + before.hits + '/' + before.validPicks + '</span>' +
        '</div>' +
        KBFx.granny({ mood: 'shock', say: 'Well, sweetie?', cls: 'spot-granny bubble-top' }) +
        '<button class="btn ghost small spot-skip" type="button">Skip ▸</button>';
      document.body.appendChild(el);
      el.querySelector('.spot-skip').addEventListener('click', endSpot);
      F.spot = { el, timers: [], stopSound: null };
      S.drumroll(showAt / 1000);
      const at = (ms, fn) => F.spot.timers.push(setTimeout(fn, ms));
      const card = el.querySelector('.spot-card');
      const g = el.querySelector('.granny');
      const name = el.querySelector('.spot-name');

      // Right answer: the crowd goes wild.
      function cheer() {
        el.classList.add('hit');
        g.classList.add('cheer');
        el.querySelector('.spot-tally').textContent = '👵 ' + after.hits + '/' + after.validPicks + ' ✓';
        el.querySelector('.spot-msg').textContent = 'GRANDMA’S FAVORITE! 💖';
        KBFx.say(g, 'That’s my Favorite!', 'happy');
        S.sparkle();
        F.spot.stopSound = S.cheer(hold / 1000) || null;
        H.confetti();
        const spread = Math.min(window.innerWidth, 900) * 0.45;
        [0, 1100, 2200].forEach((ms) => at(showAt + ms, () => KBFx.hearts(KBFx.center(card), { count: ms ? 12 : 20, spread })));
        [350, 1300, 2300].forEach((ms, i) =>
          at(showAt + ms, () => {
            const from = KBFx.muzzle(g);
            if (!from) return;
            KBFx.fire(g);
            S.launch();
            const to = { x: window.innerWidth * (0.25 + Math.random() * 0.5), y: window.innerHeight * (0.08 + Math.random() * 0.18) };
            KBFx.rocket(from, to, { size: 56, duration: 600, arc: 0.3 }).then(() => {
              if (!F.spot) return;
              S.smallBoom();
              KBFx.explode(to, { size: Math.min(200, window.innerWidth * 0.15), colors: ['#ff5f9e', '#ffd23f', '#ffffff'], word: ['YAY!', 'WOO!', 'BRAVO!'][i] });
            });
          })
        );
        at(showAt + 1700, () => KBFx.say(g, 'Clever cookie!', 'happy'));
        crowdWords(el, ['YAY!', 'WOO!', '👏', 'BRAVO!', 'YES!', '🎉', 'WOOHOO!'], 'cheer', hold - 600);
      }

      // Wrong answer: a playful boo, never mean.
      function shame() {
        el.classList.add('miss');
        el.querySelector('.spot-tally').textContent = '👵 ' + after.hits + '/' + after.validPicks + ' ✗';
        el.querySelector('.spot-msg').textContent = 'Grandma’s disappointed 😤';
        KBFx.say(g, 'Oh, sweetie…', 'shock');
        g.classList.add('headshake');
        S.sigh();
        F.spot.stopSound = S.boo(hold / 1000) || null;
        KBFx.puff(KBFx.center(name), { size: Math.max(120, name.offsetWidth * 1.1) });
        at(showAt + 1600, () => KBFx.puff(KBFx.center(name), { size: Math.max(110, name.offsetWidth) }));
        at(showAt + 1900, () => KBFx.say(g, 'I still love you, dear.', 'happy'));
        crowdWords(el, ['BOO!', 'AWW!', 'BOOO!', '👎', 'OOF!', 'TSK TSK!'], 'boo', hold - 600);
      }

      at(showAt, hit ? cheer : shame);
      at(showAt + hold, () => el.classList.add('out'));
      at(showAt + hold + 380, endSpot);
    }

    function endSpot() {
      if (!F.spot) return;
      const spot = F.spot;
      F.spot = null;
      spot.timers.forEach(clearTimeout);
      if (spot.stopSound) spot.stopSound();
      spot.el.remove();
      G.revealReady = true;
    }

    // ---------- final screens ----------
    function showVerdict() {
      if (G.phase !== 'podium' && G.phase !== 'recap') return;
      H.clearTimers();
      G.phase = 'verdict';
      H.render();
      H.broadcast();
      const win = R.grandmaWins(stats());
      S.drumroll(1.2);
      H.later(() => {
        const head = document.querySelector('.verdict-head');
        if (head) head.classList.add('show');
        const g = H.granny();
        if (win) {
          S.fanfare();
          KBFx.say(g, 'I knew it, dearies!', 'happy');
          KBFx.hearts(head ? KBFx.center(head) : { x: innerWidth / 2, y: innerHeight / 2 }, { count: 26, spread: innerWidth * 0.4 });
        } else {
          S.sigh();
          KBFx.say(g, 'Hmph. You got me.', 'shock');
          if (g) g.classList.add('headshake');
        }
      }, 1300);
    }

    function showRecap() {
      if (G.phase !== 'verdict') return;
      H.clearTimers();
      G.phase = 'recap';
      H.render();
      H.broadcast();
      S.whoosh();
    }

    // ---------- host rendering ----------
    function panelHtml() {
      const g = grandma();
      const e = elig();
      let status;
      if (!g) status = '⚠️ No Grandma in the game';
      else if (!g.online) status = '⚠️ ' + esc(gLabel()) + ' is offline';
      else status = F.sel ? '👵 ' + esc(g.name) + ' has someone in mind…' : '👵 ' + esc(g.name) + ' is choosing…';
      let html = '<div class="fav-status">' + status + '</div>';
      if (F.hostPicking) {
        html +=
          '<div class="fav-choose">' +
          e.list
            .map(
              (x) =>
                '<button class="chip" type="button" data-act="fav-choose" data-tag="' + esc(x.pid) + '"' +
                (x.eligible ? '' : ' disabled title="' + esc(x.reason) + '"') + '>' + esc(x.name) + '</button>'
            )
            .join('') +
          '</div><p><button class="btn ghost small" type="button" data-act="fav-cancelpick">Cancel</button></p>';
      } else if (e.none) {
        html += '<p class="fav-small">Nobody can be picked right now.</p><p><button class="btn ghost small" type="button" data-act="fav-none">Play without a Favorite</button></p>';
      } else {
        html +=
          '<p><button class="btn ghost small" type="button" data-act="fav-random">🎲 Random pick</button></p>' +
          '<p><button class="btn ghost small" type="button" data-act="fav-hostpick">Pick for Grandma</button></p>';
      }
      return html;
    }

    function renderPick() {
      const q = H.cur();
      const waiting = G.phase === 'pickwait';
      const secs = Math.max(0, Math.ceil((F.windowEnd - Date.now()) / 1000));
      H.stage.innerHTML =
        '<div class="fav-banner' + (waiting ? ' waiting' : '') + '"><span class="crown bounce">👑</span> ' +
        (waiting ? 'Waiting for ' + esc(gLabel()) + ' to pick…' : 'Who’s Grandma’s Favorite? <b class="fav-count" id="fav-count">' + secs + '</b>') +
        '</div>' +
        '<div class="q-text">' + esc(q.text) + '</div>' +
        '<div class="q-mid">' +
        '<div class="side granny-side">' +
        KBFx.granny({ mood: waiting ? 'happy' : 'shout', say: waiting ? 'Hmm, let me think…' : 'Convince me, sweeties!', cls: 'q-granny' }) +
        '</div>' +
        (H.safeImg(q.image)
          ? '<div class="q-image">' + H.imageHtml(q) + '</div>'
          : '<div class="q-image"><div class="fav-lobbying">🗣️ Players: convince ' + esc(gLabel()) + ' to pick you!</div></div>') +
        '<div class="side" id="fav-panel">' + panelHtml() + '</div>' +
        '</div>' +
        '<div class="tiles-locked">' + H.tilesHtml(q, false) + '<div class="lock-note">🔒 Answers open after Grandma picks</div></div>';
    }

    function renderCrown() {
      const p = F.fav.player;
      const how = F.fav.by === 'random' ? ' · random pick' : F.fav.by === 'host' ? ' · picked by the host' : '';
      H.stage.innerHTML =
        '<div class="fav-crown-screen">' +
        KBFx.granny({ mood: 'happy', say: 'I choose… you!', cls: 'side-granny bubble-top' }) +
        '<div class="crown-card"><span class="crown bounce">👑</span><span class="crown-av">' + esc(p.avatar) + '</span>' +
        '<span class="crown-name">' + esc(p.name) + '</span><span class="crown-sub">is Grandma’s Favorite!</span>' +
        '<span class="crown-note">Right answer = ' + C.FAVORITE_MULTIPLIER + '× points' + how + '</span></div>' +
        '</div>';
    }

    function sideExtras() {
      if (G.phase !== 'question' && G.phase !== 'reveal') return '';
      if (!F.fav) return '<div class="fav-badge none" id="fav-badge"><b>No Favorite</b><small>this round</small></div>';
      const p = F.fav.player;
      let state = G.answers.has(p.pid) ? '✔ locked in' : 'answering…';
      let cls = G.answers.has(p.pid) ? ' locked-in' : '';
      if (G.phase === 'reveal') {
        state = { hit: '✓ got it!', miss: '✗ missed it', void: 'disconnected: pick void' }[F.outcome] || '';
        cls = ' ' + F.outcome;
      }
      return (
        '<div class="fav-badge' + cls + '" id="fav-badge"><span class="crown bounce">👑</span>' +
        '<span class="fav-who"><span class="av">' + esc(p.avatar) + '</span><b>' + esc(p.name) + '</b></span><small>' + state + '</small></div>'
      );
    }

    function boardExtras() {
      return '<div class="fav-tally">👵 ' + esc(R.tallyText(stats())) + '</div>';
    }

    function podiumActions() {
      F.podiumAt = Date.now();
      return '<button class="btn" type="button" data-act="fav-verdict">Grandma’s Verdict ▸</button>';
    }

    function renderVerdict() {
      const s = stats();
      const win = R.grandmaWins(s);
      H.stage.innerHTML =
        '<div class="verdict">' +
        '<h2>Grandma’s Verdict</h2>' +
        '<div class="verdict-row">' +
        '<div class="vstat"><b>' + R.pct(s.favoriteHitRate) + '</b><span>' + esc(gLabel()) + '’s picks<br>' + s.hits + ' of ' + s.validPicks + ' right</span></div>' +
        '<div class="vs">vs.</div>' +
        '<div class="vstat"><b>' + R.pct(s.roomCorrectRate) + '</b><span>Room<br>' + s.roomCorrect + ' of ' + s.roomOpportunities + ' right</span></div>' +
        '</div>' +
        '<div class="verdict-head ' + (win ? 'win' : 'lose') + '">' + esc(verdictText()) + '</div>' +
        '</div>' +
        '<div class="verdict-foot">' +
        KBFx.granny({ mood: 'shock', say: 'Let’s see…', cls: 'side-granny bubble-top' }) +
        '<div class="end-actions"><button class="btn big" type="button" data-act="fav-recap">Favorites recap ▸</button></div>' +
        '</div>';
    }

    function renderRecap() {
      const rows = G.questions
        .map((q, i) => {
          const pk = F.picks.find((x) => x.q === i);
          const mark = !pk ? '–' : { hit: '✓', miss: '✗', void: '⚪' }[pk.status];
          const who = pk ? '👑 ' + esc(pk.avatar || '') + ' ' + esc(pk.name) : '<span class="muted">no Favorite</span>';
          const text = q.text.length > 70 ? q.text.slice(0, 68) + '…' : q.text;
          return (
            '<div class="recap-row ' + (pk ? pk.status : 'none') + '"><span class="rq">Q' + (i + 1) + '</span><span class="rt">' + esc(text) + '</span>' +
            '<span class="rw">' + who + '</span><span class="rm">' + mark + '</span></div>'
          );
        })
        .join('');
      const top = R.mostTrusted(F.picks);
      const trusted = top.length
        ? '🏅 Most trusted: <b>' + top.map((t) => esc(t.name)).join(' & ') + '</b> (' + top[0].hits + ' correct pick' + (top[0].hits === 1 ? '' : 's') + ')'
        : 'No Favorite got one right this time. Grandma’s still proud of you all.';
      H.stage.innerHTML =
        '<div class="recap"><h2>Favorites recap</h2><div class="recap-list">' + rows + '</div>' +
        '<div class="recap-trusted">' + trusted + '</div><div class="fav-tally">👵 ' + esc(R.tallyText(stats())) + '</div></div>' +
        H.endActionsHtml('');
    }

    function render(phase) {
      if (F.spot) endSpot();
      if (phase === 'pick' || phase === 'pickwait') return renderPick();
      if (phase === 'crown') return renderCrown();
      if (phase === 'verdict') return renderVerdict();
      if (phase === 'recap') return renderRecap();
    }

    // ---------- host controls ----------
    function onPrimary() {
      if (F.spot) {
        endSpot();
        return true;
      }
      if (G.phase === 'podium') {
        if (Date.now() - F.podiumAt > 4300) showVerdict();
        return true;
      }
      if (G.phase === 'verdict') {
        showRecap();
        return true;
      }
      return ['pick', 'pickwait', 'crown', 'recap'].includes(G.phase);
    }

    function onAct(act, el) {
      if (act === 'fav-random') randomPick();
      else if (act === 'fav-hostpick') {
        F.hostPicking = true;
        refreshPick();
      } else if (act === 'fav-cancelpick') {
        F.hostPicking = false;
        refreshPick();
      } else if (act === 'fav-choose') lock(byTag(el.dataset.tag), 'host');
      else if (act === 'fav-none') noFavorite();
      else if (act === 'fav-verdict') showVerdict();
      else if (act === 'fav-recap') showRecap();
    }

    function onRoster() {
      if (G.phase === 'pick' || G.phase === 'pickwait') refreshPick();
    }

    // ---------- what each phone shows ----------
    function grandmaView(p) {
      const s = stats();
      const tallyText = s.validPicks || s.voids ? R.tallyText(s) : 'Your first pick of the game!';
      const base = { name: p.name, avatar: p.avatar, barRight: '👵 Grandma', tallyText, q: G.qi, total: G.questions.length };
      const ph = G.phase;
      if (ph === 'pick' || ph === 'pickwait') {
        const e = elig();
        return Object.assign(base, {
          screen: 'gm-pick',
          text: H.cur().text,
          endsIn: ph === 'pick' ? Math.max(0, F.windowEnd - Date.now()) : 0,
          waiting: ph === 'pickwait',
          sel: F.sel ? F.sel.tag : null,
          maxPicks: F.maxPicks,
          relaxed: e.relaxed,
          none: e.none,
          players: e.list.map((x) => {
            const pl = byTag(x.pid);
            return { tag: x.pid, name: x.name, avatar: pl ? pl.avatar : '', used: x.used, eligible: x.eligible, reason: x.reason };
          }),
        });
      }
      const fav = F.fav ? F.fav.player : null;
      if (ph === 'crown' || ph === 'question' || ph === 'boom') {
        return Object.assign(base, { screen: 'gm-wait', fav: fav ? fav.name : '', favAvatar: fav ? fav.avatar : '', answered: !!(fav && G.answers.has(fav.pid)) });
      }
      if (ph === 'reveal' || ph === 'board') {
        return Object.assign(base, { screen: 'gm-result', fav: fav ? fav.name : '', status: F.outcome });
      }
      if (ph === 'podium' || ph === 'verdict' || ph === 'recap') {
        return Object.assign(base, { screen: 'gm-end', revealed: ph !== 'podium', wins: R.grandmaWins(s), verdict: verdictText() });
      }
      return Object.assign(base, { screen: 'gm-lobby' });
    }

    function view(p, v) {
      if (p.role === 'grandma') return grandmaView(p);
      const ph = G.phase;
      if (ph === 'pick' || ph === 'pickwait') {
        return Object.assign(v, { screen: 'fav-pickme', waiting: ph === 'pickwait', endsIn: ph === 'pick' ? Math.max(0, F.windowEnd - Date.now()) : 0, q: G.qi, total: G.questions.length });
      }
      if (ph === 'crown') {
        return isFav(p)
          ? Object.assign(v, { screen: 'fav-crowned', mult: C.FAVORITE_MULTIPLIER })
          : Object.assign(v, { screen: 'fav-picked', fav: F.fav ? F.fav.player.name : '' });
      }
      if (ph === 'question' && v.screen === 'question' && isFav(p)) v.crown = true;
      if (ph === 'verdict' || ph === 'recap') return Object.assign(v, { screen: 'end', correct: p.correctCount, total: G.questions.length, verdict: verdictText() });
      return v;
    }

    return {
      isContestant: (p) => p.role !== 'grandma',
      lobbyHint: 'Click a name to make them Grandma or remove them.',
      lobbyNote,
      canStart,
      chipBadge: (p) => (p.role === 'grandma' ? '<span class="role-tag">👵 Grandma</span>' : ''),
      chipActions: (p) => (p.role === 'grandma' ? [{ act: 'ungrandma', label: 'Remove the Grandma role' }] : [{ act: 'grandma', label: '👵 Make Grandma' }]),
      onChipAction,
      onStart,
      beginQuestion,
      onAnswerStart,
      onAnswer,
      adjustPoints,
      afterScore,
      afterReveal,
      sideExtras,
      boardExtras,
      podiumActions,
      onPrimary,
      onAct,
      onMessage,
      onRoster,
      render,
      view,
      _state: F, // for tests and debugging
    };
  }
})();
