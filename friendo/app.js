(() => {
  'use strict';

  const SRC = window.FC_DATA || {};
  const KINDS = ['friends', 'moments', 'journal'];
  const STORE_KEY = 'friendo.v1';
  const DAY = 86400000;

  const view = document.getElementById('view');
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  const pendingBtn = document.getElementById('pending');

  // ---------- small helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayISO = () => iso(new Date());
  const isoDaysAgo = n => iso(new Date(Date.now() - n * DAY));
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
  const fmtDate = s => parse(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const ago = s => {
    const n = daysBetween(s, todayISO());
    if (n < 0) return `in ${plural(-n, 'day')}`;
    if (n === 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 45) return `${n} days ago`;
    if (n < 365) return `${Math.round(n / 30)} months ago`;
    return `${plural(Math.round(n / 365), 'year')} ago`;
  };
  const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim()
    .replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 48) || 'item';
  const hash = s => { let x = 2166136261; for (const c of s) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };

  // ---------- data: repo files + local edits overlay ----------
  // Repo files (data/*.js) are the source of truth. Edits made in the browser
  // are kept in localStorage as an overlay until exported and committed.
  let overlay = {};
  try { overlay = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { overlay = {}; }
  const ov = k => (overlay[k] ||= { upserts: {}, deleted: [] });
  const persist = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(overlay)); } catch { /* storage unavailable */ } };
  const baseHas = (k, id) => (SRC[k] || []).some(x => x.id === id);

  const db = {};
  function rebuild() {
    for (const k of KINDS) {
      const o = ov(k), del = new Set(o.deleted), map = new Map();
      (SRC[k] || []).forEach(x => map.set(x.id, x));
      Object.values(o.upserts).forEach(x => map.set(x.id, x));
      db[k] = [...map.values()].filter(x => !del.has(x.id));
    }
    db.friends.sort((a, b) => a.name.localeCompare(b.name));
    db.moments.sort((a, b) => b.date.localeCompare(a.date));
    db.journal.sort((a, b) => b.date.localeCompare(a.date));
  }
  function save(k, obj) {
    const o = ov(k);
    o.upserts[obj.id] = obj;
    o.deleted = o.deleted.filter(i => i !== obj.id);
    persist(); rebuild(); render();
  }
  function drop(k, id) {
    const o = ov(k);
    delete o.upserts[id];
    if (baseHas(k, id) && !o.deleted.includes(id)) o.deleted.push(id);
    persist(); rebuild(); render();
  }
  const pendingCount = () => KINDS.reduce((n, k) => n + Object.keys(ov(k).upserts).length + ov(k).deleted.length, 0);
  function newId(k, base) {
    const ids = new Set(db[k].map(x => x.id)), root = slug(base);
    let id = root, i = 2;
    while (ids.has(id)) id = `${root}-${i++}`;
    return id;
  }

  // ---------- friend helpers ----------
  const friend = id => db.friends.find(f => f.id === id);
  const fname = id => friend(id)?.name ?? 'Someone';
  const first = f => f.nickname || f.name.split(' ')[0];
  const momentsOf = id => db.moments.filter(m => (m.friends || []).includes(id));
  const lastTogether = id => momentsOf(id).find(m => m.date <= todayISO() && m.outcome !== "couldn't go" && m.outcome !== 'declined');
  function counts(ms) {
    const c = { themInv: 0, meInv: 0, themKind: 0, meKind: 0 };
    for (const m of ms) {
      if (m.type === 'invite') m.from === 'them' ? c.themInv++ : c.meInv++;
      else m.from === 'them' ? c.themKind++ : c.meKind++;
    }
    return c;
  }
  function daysToBirthday(mmdd) {
    const m = /^(\d{2})-(\d{2})$/.exec(mmdd || '');
    if (!m) return null;
    const now = parse(todayISO());
    let next = new Date(now.getFullYear(), +m[1] - 1, +m[2]);
    if (next < now) next = new Date(now.getFullYear() + 1, +m[1] - 1, +m[2]);
    return Math.round((next - now) / DAY);
  }
  const fmtBirthday = mmdd => {
    const m = /^(\d{2})-(\d{2})$/.exec(mmdd || '');
    return m ? new Date(2000, +m[1] - 1, +m[2]).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : '';
  };
  const avatar = (f, size = '') =>
    `<span class="avatar ${size}" style="--hue:${hash(f.id) % 360}" aria-hidden="true">${esc(f.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span>`;
  const friendChips = ids => (ids || []).map(id => friend(id)
    ? `<a class="chip person" href="#history/${esc(id)}">${esc(fname(id))}</a>`
    : `<span class="chip person">${esc(id)}</span>`).join('');

  // ---------- markdown (small, safe subset) ----------
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function md(src) {
    const out = [];
    let para = [], list = null, quote = [];
    const flushPara = () => { if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); para = []; };
    const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; };
    const flushQuote = () => { if (quote.length) out.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`); quote = []; };
    const flushAll = () => { flushPara(); flushList(); flushQuote(); };
    for (const raw of String(src || '').replace(/\r/g, '').split('\n')) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { flushAll(); continue; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { flushAll(); const n = Math.min(m[1].length + 1, 5); out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
      if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushAll(); out.push('<hr>'); continue; }
      if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); flushList(); quote.push(m[1]); continue; }
      if ((m = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(line))) {
        flushPara(); flushQuote();
        const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push(m[2]); continue;
      }
      if (list && /^\s+/.test(raw)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
      flushList(); flushQuote(); para.push(line.trim());
    }
    flushAll();
    return out.join('\n');
  }
  const excerpt = (src, n = 180) => {
    const t = String(src || '').replace(/^#+\s.*$/gm, '').replace(/[*_`>#-]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n).replace(/\s\S*$/, '') + '…' : t;
  };

  // ---------- ideas engine ----------
  const IDEA_BANK = [
    [/coffee|caf[eé]|latte|matcha|chai|tea/, ['Take {n} on a {l} walk somewhere new', 'Drop off a {l} for {n} on a busy day', 'Find the best {l} in town together']],
    [/ramen|sushi|taco|pizza|dumpling|brunch|noodle|bbq|curry|pho|food|restaurant/, ['Take {n} to try a new {l} spot', 'Host a homemade {l} night for {n}', 'Plan a {l} crawl with {n}']],
    [/bak|cook|kitchen|recipe/, ['Ask {n} to teach you a favorite recipe', 'Bake something for {n} and drop it off', 'Plan a cook-together night with {n}']],
    [/dessert|cake|ice cream|boba|chocolate|sweet|pastr/, ['Surprise {n} with their favorite {l}', 'Go on a {l} hunt with {n}']],
    [/hik|trail|outdoor|nature|camp|walk|water|beach|park/, ['Plan a {l} day with {n}', 'Pack a picnic and invite {n} out for {l}']],
    [/concert|music|band|jazz|vinyl|festival|gig/, ['Get tickets for {n} to see {l}', 'Make {n} a playlist inspired by {l}', 'Go record shopping with {n}']],
    [/karaoke|danc|party/, ['Book a karaoke room and invite {n}', 'Plan a night out around {l} with {n}']],
    [/movie|film|cinema|show|tv|anime/, ['Host a {l} night for {n}', 'Catch a new release with {n}']],
    [/book|read|novel|sci-?fi|fantasy|poetry/, ['Gift {n} a book you think they\'d love ({l})', 'Start a two-person book club with {n}', 'Browse a used bookstore with {n}']],
    [/board game|game|puzzle|trivia|chess/, ['Host a {l} night for {n}', 'Find a trivia or game night to go to with {n}']],
    [/museum|art|gallery|paint|draw|pottery|ceramic|craft/, ['Go to a {l} exhibit or class with {n}', 'Make something by hand for {n}']],
    [/plant|garden|flower|cact/, ['Give {n} a new plant for their collection', 'Visit a nursery or botanical garden with {n}']],
    [/dog|cat|pet|corgi|pepper/, ['Bring a treat for {n}\'s pet next time', 'Plan an outing where {n}\'s pet can come too']],
    [/run|marathon|gym|yoga|climb|tennis|soccer|basketball|sport|bike|swim/, ['Join {n} for {l}', 'Cheer {n} on at their next {l} event', 'Gift {n} something useful for {l}']],
    [/travel|trip|road/, ['Plan a day trip with {n}', 'Send {n} a postcard or a little souvenir']],
    [/wine|beer|cocktail|whisk|sake/, ['Bring {n} a bottle to try together', 'Do a {l} tasting with {n}']]
  ];
  const GENERIC = ['Plan an afternoon around {l} with {n}', 'Send {n} something that reminded you of their love of {l}', 'Ask {n} what\'s new with {l}, and really listen'];
  const THANKS = ['Send {n} a handwritten thank-you note', 'Text {n} a specific thank-you, saying what it meant', 'Return the favor with something small and thoughtful', 'Treat {n} to a coffee as a thank-you'];
  const BIRTHDAY = ['A gift around {l}', 'An experience built around {l}', 'A card plus a small {l} surprise'];
  let seed = 0;
  const pick = (arr, key) => arr[hash(`${key}|${seed}`) % arr.length];
  const fill = (t, f, l = '') => t.replaceAll('{n}', first(f)).replaceAll('{l}', l);
  function activityFor(f, key) {
    const likes = f.likes || [];
    if (!likes.length) return { text: `Ask ${first(f)} what they've been wanting to try lately`, like: null };
    const like = pick(likes, f.id + key + 'like');
    const pool = IDEA_BANK.filter(([re]) => re.test(like.toLowerCase())).flatMap(([, t]) => t);
    return { text: fill(pick(pool.length ? pool : GENERIC, f.id + key + 'act'), f, like), like };
  }

  function suggestions() {
    const out = [], today = todayISO(), yearAgo = isoDaysAgo(365);
    for (const f of db.friends) {
      const n = first(f), ms = momentsOf(f.id), past = ms.filter(m => m.date <= today);

      const bd = daysToBirthday(f.birthday);
      if (bd !== null && bd <= 30) {
        const gift = (f.likes || []).length ? fill(pick(BIRTHDAY, f.id + 'bd'), f, pick(f.likes, f.id + 'gift')) : 'A heartfelt card';
        out.push({ f, kind: 'birthday', score: 100 - bd, title: bd === 0 ? `It's ${n}'s birthday today!` : `${n}'s birthday is in ${plural(bd, 'day')}`, idea: gift, why: fmtBirthday(f.birthday) });
      }

      const kind = past.find(m => m.from === 'them' && m.type === 'kindness' && daysBetween(m.date, today) <= 21);
      if (kind && !ms.some(m => m.from === 'me' && m.date >= kind.date)) {
        out.push({ f, kind: 'thanks', score: 80, title: `Thank ${n} for “${kind.title}”`, idea: fill(pick(THANKS, f.id + 'thx'), f), why: `${ago(kind.date)}, and you haven't done anything for them since.` });
      }

      const recent = ms.filter(m => m.type === 'invite' && m.date >= yearAgo);
      const them = recent.filter(m => m.from === 'them').length, me = recent.filter(m => m.from === 'me').length;
      if (them - me >= 2 || (them >= 1 && me === 0)) {
        out.push({ f, kind: 'reciprocate', score: 55 + 5 * (them - me), title: `Your turn to invite ${n}`, idea: activityFor(f, 'rec').text, why: `In the last year ${n} invited you ${them}× and you invited them ${me}×.` });
      }

      const last = past[0];
      const gap = last ? daysBetween(last.date, today) : null;
      if (gap === null || gap > 45) {
        out.push({ f, kind: 'reconnect', score: 30 + Math.min(30, (gap ?? 120) / 10), title: gap === null ? `Make a first memory with ${n}` : `It's been ${gap} days since your last moment with ${n}`, idea: activityFor(f, 'recon').text, why: last ? `Last: “${last.title}”` : 'Nothing logged yet.' });
      }

      if ((f.likes || []).length) {
        const a = activityFor(f, 'just');
        out.push({ f, kind: 'idea', score: 10, title: a.text, why: `Because ${n} loves ${a.like}.` });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  }
  const KIND_META = {
    birthday: { icon: '🎂', label: 'Birthday' },
    thanks: { icon: '💌', label: 'Say thanks' },
    reciprocate: { icon: '↩︎', label: 'Return the invite' },
    reconnect: { icon: '👋', label: 'Reconnect' },
    idea: { icon: '✨', label: 'Just because' }
  };

  // ---------- routing & view state ----------
  const state = { friendQuery: '', histScope: 'them', inviteDir: 'all', inviteFriend: '', ideaFriend: '', journalQuery: '', journalTag: '' };
  let lastIdeas = [];
  const route = () => {
    const [tab = 'friends', id = ''] = location.hash.slice(1).split('/').map(decodeURIComponent);
    return { tab: ['friends', 'history', 'invites', 'ideas', 'journal'].includes(tab) ? tab : 'friends', id };
  };

  function render() {
    const { tab, id } = route();
    document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
    const n = pendingCount();
    pendingBtn.hidden = n === 0;
    pendingBtn.textContent = `${plural(n, 'unsaved change')} · Save`;
    view.innerHTML = ({ friends: viewFriends, history: viewHistory, invites: viewInvites, ideas: viewIdeas, journal: viewJournal })[tab](id);
    if (tab === 'friends') renderFriendGrid();
    if (tab === 'journal' && !id) renderJournalList();
  }

  const head = (title, sub, actions = '') =>
    `<section class="head"><div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="head-actions">${actions}</div></section>`;
  const empty = (msg, action = '') => `<div class="empty"><p>${msg}</p>${action}</div>`;

  // ---------- Friends tab ----------
  function viewFriends() {
    return head('Friends', `${db.friends.length} ${db.friends.length === 1 ? 'person' : 'people'} in your circle`, `<button class="btn primary" data-act="add-friend">+ Add friend</button>`) +
      `<input class="search" id="friend-search" type="search" placeholder="Search names, likes, notes…" value="${esc(state.friendQuery)}">` +
      `<div class="grid" id="friend-grid"></div>`;
  }
  function renderFriendGrid() {
    const grid = document.getElementById('friend-grid');
    if (!db.friends.length) { grid.outerHTML = empty('No friends yet. Add your first one to start keeping track.', '<button class="btn primary" data-act="add-friend">+ Add friend</button>'); return; }
    const q = state.friendQuery.toLowerCase();
    const list = db.friends.filter(f => !q || [f.name, f.nickname, f.notes, f.met, ...(f.likes || []), ...(f.dislikes || [])].join(' ').toLowerCase().includes(q));
    grid.innerHTML = list.map(f => {
      const c = counts(momentsOf(f.id)), last = lastTogether(f.id), bd = daysToBirthday(f.birthday);
      return `<a class="card friend-card" href="#history/${esc(f.id)}">
        <div class="friend-top">${avatar(f)}<div><h3>${esc(f.name)}</h3><p class="muted small">${last ? `Last together ${esc(ago(last.date))}` : 'No moments logged yet'}</p></div>
        ${bd !== null && bd <= 30 ? `<span class="badge warn">🎂 ${bd === 0 ? 'today' : `in ${bd}d`}</span>` : ''}</div>
        <div class="tally"><span><b>${c.themInv}</b> invited you</span><span><b>${c.meInv}</b> you invited</span><span><b>${c.themKind}</b> kind acts</span></div>
        ${(f.likes || []).length ? `<div class="chips">${f.likes.slice(0, 4).map(l => `<span class="chip like">${esc(l)}</span>`).join('')}${f.likes.length > 4 ? `<span class="chip">+${f.likes.length - 4}</span>` : ''}</div>` : ''}
      </a>`;
    }).join('') || `<p class="muted">No one matches “${esc(state.friendQuery)}”.</p>`;
  }

  // ---------- History tab ----------
  function viewHistory(id) {
    if (!db.friends.length) return head('History') + empty('Add a friend first, then their history shows up here.', '<button class="btn primary" data-act="add-friend">+ Add friend</button>');
    const f = friend(id) || db.friends[0];
    const ms = momentsOf(f.id), c = counts(ms);
    const shown = state.histScope === 'them' ? ms.filter(m => m.from === 'them') : ms;
    const entries = db.journal.filter(e => (e.friends || []).includes(f.id));
    const bd = daysToBirthday(f.birthday);

    const picker = `<aside class="picker">
      <select class="picker-select" data-nav-friend aria-label="Choose friend">${db.friends.map(x => `<option value="${esc(x.id)}" ${x.id === f.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <ul class="picker-list">${db.friends.map(x => `<li><a href="#history/${esc(x.id)}" class="${x.id === f.id ? 'active' : ''}">${avatar(x, 'sm')}<span>${esc(x.name)}</span></a></li>`).join('')}</ul>
    </aside>`;

    const profile = `<div class="card profile">
      <div class="profile-top">${avatar(f, 'lg')}<div class="grow"><h1>${esc(f.name)}</h1>
        <p class="muted">${[f.nickname && f.nickname !== f.name.split(' ')[0] ? `“${esc(f.nickname)}”` : '', f.met ? esc(f.met) : '', f.birthday ? `🎂 ${esc(fmtBirthday(f.birthday))}${bd !== null && bd <= 30 ? ` <span class="badge warn">in ${bd}d</span>` : ''}` : ''].filter(Boolean).join(' · ')}</p></div>
        <button class="btn ghost" data-act="edit-friend" data-id="${esc(f.id)}">Edit</button></div>
      ${f.notes ? `<p class="notes">${esc(f.notes)}</p>` : ''}
    </div>`;

    const prefs = ['likes', 'dislikes'].map(key => `<div class="card prefs ${key}">
      <h3>${key === 'likes' ? '♥ Likes' : '✕ Dislikes'}</h3>
      <div class="chips">${(f[key] || []).map((l, i) => `<span class="chip ${key === 'likes' ? 'like' : 'dislike'}">${esc(l)}<button class="x" data-act="pref-remove" data-id="${esc(f.id)}" data-key="${key}" data-i="${i}" aria-label="Remove ${esc(l)}">×</button></span>`).join('') || '<span class="muted small">Nothing yet</span>'}</div>
      <form class="pref-add" data-pref="${key}" data-id="${esc(f.id)}"><input name="v" placeholder="Add a ${key === 'likes' ? 'like' : 'dislike'}…" aria-label="Add ${key}"><button class="btn sm">Add</button></form>
    </div>`).join('');

    const stats = `<div class="stats">
      <div class="stat"><b>${c.themInv}</b><span>times they invited you</span></div>
      <div class="stat"><b>${c.themKind}</b><span>kind things they did</span></div>
      <div class="stat"><b>${c.meInv}</b><span>times you invited them</span></div>
      <div class="stat"><b>${c.meKind}</b><span>kind things you did</span></div>
    </div>`;

    const timeline = `<section class="section">
      <div class="section-head"><h2>Timeline</h2>
        <div class="seg" role="group" aria-label="Show">
          <button data-act="hist-scope" data-v="them" class="${state.histScope === 'them' ? 'on' : ''}">What they did for me</button>
          <button data-act="hist-scope" data-v="all" class="${state.histScope === 'all' ? 'on' : ''}">Everything</button>
        </div>
        <button class="btn primary sm" data-act="add-moment" data-friend="${esc(f.id)}">+ Log moment</button></div>
      ${shown.length ? `<ol class="timeline">${shown.map(m => momentItem(m, f.id)).join('')}</ol>` : empty(state.histScope === 'them' ? `Nothing logged from ${esc(first(f))} yet.` : 'No moments yet.')}
    </section>`;

    const journal = entries.length ? `<section class="section"><h2>In your journal</h2><div class="entry-list">${entries.map(entryCard).join('')}</div></section>` : '';

    return `<div class="history">${picker}<div class="history-main">${profile}<div class="prefs-row">${prefs}</div>${stats}${timeline}${journal}</div></div>`;
  }

  function momentItem(m, perspective) {
    const others = (m.friends || []).filter(id => id !== perspective);
    const who = m.from === 'them' ? (perspective ? first(friend(perspective)) : (m.friends || []).map(fname).join(', ')) : 'You';
    const verb = m.type === 'invite' ? (m.from === 'them' ? 'invited you' : 'sent the invite') : (m.from === 'them' ? 'was there for you' : 'did something kind');
    const outcome = m.outcome ? `<span class="badge ${m.outcome === 'went' ? 'good' : m.outcome === 'upcoming' ? 'info' : ''}">${esc(m.outcome)}</span>` : '';
    return `<li class="moment ${m.from}">
      <div class="dot ${m.type}" aria-hidden="true">${m.type === 'invite' ? '✉' : '♥'}</div>
      <div class="moment-body">
        <div class="moment-meta"><time datetime="${esc(m.date)}">${esc(fmtDate(m.date))}</time><span class="muted">· ${esc(who)} ${esc(verb)}</span>${outcome}</div>
        <h4>${esc(m.title)}</h4>
        ${m.notes ? `<p>${esc(m.notes)}</p>` : ''}
        ${!perspective || others.length ? `<div class="chips">${friendChips(perspective ? others : m.friends)}</div>` : ''}
      </div>
      <div class="row-actions"><button class="icon" data-act="edit-moment" data-id="${esc(m.id)}" aria-label="Edit">✎</button></div>
    </li>`;
  }

  // ---------- Invites tab ----------
  function viewInvites() {
    const all = db.moments.filter(m => m.type === 'invite');
    const yearAgo = isoDaysAgo(365);
    const yr = all.filter(m => m.date >= yearAgo);
    let list = all;
    if (state.inviteDir !== 'all') list = list.filter(m => m.from === state.inviteDir);
    if (state.inviteFriend) list = list.filter(m => (m.friends || []).includes(state.inviteFriend));

    const balance = db.friends.map(f => {
      const ms = all.filter(m => (m.friends || []).includes(f.id));
      return { f, them: ms.filter(m => m.from === 'them').length, me: ms.filter(m => m.from === 'me').length };
    }).filter(b => b.them + b.me).sort((a, b) => (b.them - b.me) - (a.them - a.me));
    const max = Math.max(1, ...balance.map(b => Math.max(b.them, b.me)));

    return head('Invites', 'Every time you were invited, and every time you did the inviting.', `<button class="btn primary" data-act="add-moment" data-type="invite">+ Log invite</button>`) +
      `<div class="stats">
        <div class="stat"><b>${yr.filter(m => m.from === 'them').length}</b><span>invites received (12 mo)</span></div>
        <div class="stat"><b>${yr.filter(m => m.from === 'me').length}</b><span>invites you sent (12 mo)</span></div>
        <div class="stat"><b>${all.length}</b><span>invites all-time</span></div>
      </div>` +
      (balance.length ? `<section class="section card"><h2>Who's been inviting whom</h2><p class="muted small">Left: they invited you · Right: you invited them</p>
        <div class="balance">${balance.map(b => `<a class="bal-row" href="#history/${esc(b.f.id)}">
          <span class="bal-name">${esc(b.f.name)}</span>
          <span class="bal-bar left"><i style="width:${b.them / max * 100}%"></i><em>${b.them}</em></span>
          <span class="bal-bar right"><i style="width:${b.me / max * 100}%"></i><em>${b.me}</em></span>
        </a>`).join('')}</div></section>` : '') +
      `<section class="section"><div class="section-head"><h2>Log</h2>
        <div class="seg" role="group" aria-label="Direction">
          ${[['all', 'All'], ['them', 'To me'], ['me', 'From me']].map(([v, l]) => `<button data-act="invite-dir" data-v="${v}" class="${state.inviteDir === v ? 'on' : ''}">${l}</button>`).join('')}
        </div>
        <select data-invite-friend aria-label="Filter by friend"><option value="">Everyone</option>${db.friends.map(f => `<option value="${esc(f.id)}" ${state.inviteFriend === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
      </div>
      ${list.length ? `<ol class="timeline">${list.map(m => momentItem(m)).join('')}</ol>` : empty('No invites match.')}</section>`;
  }

  // ---------- Ideas tab ----------
  function viewIdeas() {
    if (!db.friends.length) return head('Ideas') + empty('Add friends (and what they like) to get ideas.');
    lastIdeas = suggestions().filter(s => !state.ideaFriend || s.f.id === state.ideaFriend);
    return head('Ideas', 'Ways to show up for the people who show up for you.',
      `<select data-idea-friend aria-label="Filter by friend"><option value="">Everyone</option>${db.friends.map(f => `<option value="${esc(f.id)}" ${state.ideaFriend === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
       <button class="btn" data-act="shuffle">↻ Shuffle ideas</button>`) +
      `<div class="ideas">${lastIdeas.map((s, i) => {
        const meta = KIND_META[s.kind];
        return `<article class="card idea ${s.kind}">
          <div class="idea-top"><span class="idea-icon" aria-hidden="true">${meta.icon}</span><span class="badge">${meta.label}</span>
            <a class="idea-who" href="#history/${esc(s.f.id)}">${avatar(s.f, 'sm')}${esc(s.f.name)}</a></div>
          <h3>${esc(s.title)}</h3>
          ${s.idea ? `<p class="idea-text">→ ${esc(s.idea)}</p>` : ''}
          ${s.why ? `<p class="muted small">${esc(s.why)}</p>` : ''}
          ${(s.f.dislikes || []).length ? `<p class="avoid small">Steer clear of: ${esc(s.f.dislikes.join(', '))}</p>` : ''}
          <div class="idea-actions"><button class="btn sm" data-act="log-idea" data-i="${i}">✓ I did this</button></div>
        </article>`;
      }).join('') || empty('No suggestions right now. You\'re doing great!')}</div>`;
  }

  // ---------- Journal tab ----------
  function entryCard(e) {
    return `<a class="card entry-card" href="#journal/${esc(e.id)}">
      <time class="muted small" datetime="${esc(e.date)}">${esc(fmtDate(e.date))}</time>
      <h3>${esc(e.title)}</h3>
      <p class="muted">${esc(excerpt(e.body))}</p>
      ${(e.tags || []).length ? `<div class="chips">${e.tags.map(t => `<span class="chip tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    </a>`;
  }
  function viewJournal(id) {
    if (id) {
      const e = db.journal.find(x => x.id === id);
      if (!e) return empty('That entry doesn\'t exist.', '<a class="btn" href="#journal">Back to journal</a>');
      return `<article class="post">
        <a class="back" href="#journal">← All entries</a>
        <time class="muted" datetime="${esc(e.date)}">${esc(fmtDate(e.date))}</time>
        <h1>${esc(e.title)}</h1>
        <div class="chips">${friendChips(e.friends)}${(e.tags || []).map(t => `<span class="chip tag">#${esc(t)}</span>`).join('')}</div>
        <div class="prose">${md(e.body)}</div>
        <div class="post-actions"><button class="btn ghost" data-act="edit-entry" data-id="${esc(e.id)}">Edit entry</button></div>
      </article>`;
    }
    const tags = [...new Set(db.journal.flatMap(e => e.tags || []))].sort();
    return head('Journal', `${db.journal.length} ${db.journal.length === 1 ? 'entry' : 'entries'}`, `<button class="btn primary" data-act="add-entry">+ New entry</button>`) +
      `<div class="toolbar"><input class="search" id="journal-search" type="search" placeholder="Search entries…" value="${esc(state.journalQuery)}">
        ${tags.length ? `<div class="chips">${['', ...tags].map(t => `<button class="chip tag ${state.journalTag === t ? 'on' : ''}" data-act="journal-tag" data-v="${esc(t)}">${t ? '#' + esc(t) : 'All'}</button>`).join('')}</div>` : ''}</div>
       <div class="entry-list" id="entry-list"></div>`;
  }
  function renderJournalList() {
    const el = document.getElementById('entry-list');
    if (!el) return;
    const q = state.journalQuery.toLowerCase();
    const list = db.journal.filter(e => (!state.journalTag || (e.tags || []).includes(state.journalTag)) &&
      (!q || [e.title, e.body, ...(e.tags || []), ...(e.friends || []).map(fname)].join(' ').toLowerCase().includes(q)));
    el.innerHTML = list.map(entryCard).join('') || (db.journal.length ? '<p class="muted">No entries match.</p>' : empty('Your journal is empty. Write something, or ask Claude to help you draft a post.'));
  }

  // ---------- forms ----------
  function field(f, v) {
    const id = `f-${f.name}`, req = f.required ? 'required' : '';
    const label = `<label for="${id}">${esc(f.label)}${f.hint ? ` <span class="hint">${esc(f.hint)}</span>` : ''}</label>`;
    switch (f.type) {
      case 'textarea': return `<div class="field">${label}<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}" ${req}>${esc(v ?? '')}</textarea></div>`;
      case 'list': return `<div class="field">${label}<textarea id="${id}" name="${f.name}" rows="2" placeholder="${esc(f.placeholder || '')}">${esc((v || []).join(', '))}</textarea></div>`;
      case 'select': return `<div class="field">${label}<select id="${id}" name="${f.name}">${f.options.map(([val, l]) => `<option value="${esc(val)}" ${val === (v ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
      case 'radio': return `<fieldset class="field"><legend>${esc(f.label)}</legend><div class="seg">${f.options.map(([val, l]) => `<label class="seg-opt"><input type="radio" name="${f.name}" value="${esc(val)}" ${val === v ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></fieldset>`;
      case 'friends': return `<fieldset class="field"><legend>${esc(f.label)}</legend><div class="pick">${db.friends.map(x => `<label class="pick-opt"><input type="checkbox" name="${f.name}" value="${esc(x.id)}" ${(v || []).includes(x.id) ? 'checked' : ''}>${avatar(x, 'xs')}<span>${esc(x.name)}</span></label>`).join('') || '<span class="muted small">Add friends first.</span>'}</div></fieldset>`;
      default: return `<div class="field">${label}<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v ?? '')}" placeholder="${esc(f.placeholder || '')}" ${f.pattern ? `pattern="${f.pattern}"` : ''} ${req}></div>`;
    }
  }
  function openForm({ title, fields, values = {}, onSubmit, onDelete }) {
    modalBody.innerHTML = `<form class="form" novalidate><h2>${esc(title)}</h2>${fields.map(f => field(f, values[f.name])).join('')}
      <p class="form-error" hidden></p>
      <div class="form-actions">${onDelete ? '<button type="button" class="btn ghost danger" data-delete>Delete</button>' : ''}<span class="spacer"></span>
      <button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" class="btn primary">Save</button></div></form>`;
    const form = modalBody.querySelector('form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form), out = {};
      for (const f of fields) {
        if (f.type === 'friends') out[f.name] = fd.getAll(f.name);
        else if (f.type === 'list') out[f.name] = String(fd.get(f.name) || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
        else out[f.name] = String(fd.get(f.name) ?? '').trim();
      }
      const err = fields.map(f => {
        if (f.required && (f.type === 'friends' ? !out[f.name].length : !out[f.name])) return `${f.label} is required.`;
        if (f.pattern && out[f.name] && !new RegExp(`^${f.pattern}$`).test(out[f.name])) return `${f.label}: use the format ${f.placeholder}.`;
        return null;
      }).find(Boolean);
      if (err) { const p = form.querySelector('.form-error'); p.textContent = err; p.hidden = false; return; }
      modal.close();
      onSubmit(out);
    });
    if (onDelete) form.querySelector('[data-delete]').addEventListener('click', () => { if (confirm('Delete this for good?')) { modal.close(); onDelete(); } });
    modal.showModal();
    form.querySelector('input:not([type=radio]):not([type=checkbox]), textarea')?.focus();
  }
  const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length)));

  function friendForm(f) {
    openForm({
      title: f ? `Edit ${f.name}` : 'Add a friend',
      values: f || {},
      fields: [
        { name: 'name', label: 'Name', required: true, placeholder: 'Full name' },
        { name: 'nickname', label: 'Nickname', placeholder: 'What you call them' },
        { name: 'birthday', label: 'Birthday', hint: 'MM-DD', placeholder: 'MM-DD', pattern: '\\d{2}-\\d{2}' },
        { name: 'met', label: 'How you met', placeholder: 'College roommate, 2018' },
        { name: 'likes', label: 'Likes', type: 'list', hint: 'comma separated', placeholder: 'spicy ramen, pottery, indie concerts' },
        { name: 'dislikes', label: 'Dislikes', type: 'list', hint: 'comma separated', placeholder: 'cilantro, loud bars' },
        { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'What\'s going on in their life?' }
      ],
      onSubmit: v => {
        const obj = clean({ id: f?.id || newId('friends', v.nickname || v.name.split(' ')[0]), ...v });
        save('friends', obj);
        if (!f) location.hash = `#history/${obj.id}`;
      },
      onDelete: f && (() => { drop('friends', f.id); location.hash = '#friends'; })
    });
  }
  function momentForm(m, preset = {}) {
    openForm({
      title: m ? 'Edit moment' : 'Log a moment',
      values: m || { date: todayISO(), from: 'them', type: 'invite', friends: [], ...preset },
      fields: [
        { name: 'from', label: 'Who did it?', type: 'radio', options: [['them', 'They did it (for me)'], ['me', 'I did it (for them)']] },
        { name: 'type', label: 'What kind?', type: 'radio', options: [['invite', '✉ Invite'], ['kindness', '♥ Kind gesture / help']] },
        { name: 'title', label: 'What happened', required: true, placeholder: 'Birthday dinner at the ramen place' },
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'friends', label: 'Who', type: 'friends', required: true },
        { name: 'outcome', label: 'Outcome', hint: 'for invites', type: 'select', options: [['', '-'], ['went', 'Went'], ['upcoming', 'Upcoming'], ["couldn't go", "Couldn't go"], ['declined', 'They declined']] },
        { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Anything worth remembering' }
      ],
      onSubmit: v => {
        if (v.type !== 'invite') v.outcome = '';
        save('moments', clean({ id: m?.id || newId('moments', `${v.date}-${v.title}`), date: v.date, type: v.type, from: v.from, friends: v.friends, title: v.title, outcome: v.outcome, notes: v.notes }));
      },
      onDelete: m && (() => drop('moments', m.id))
    });
  }
  function entryForm(e) {
    openForm({
      title: e ? 'Edit entry' : 'New journal entry',
      values: e || { date: todayISO() },
      fields: [
        { name: 'title', label: 'Title', required: true },
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'tags', label: 'Tags', type: 'list', hint: 'comma separated', placeholder: 'gratitude, reflections' },
        { name: 'friends', label: 'Friends mentioned', type: 'friends' },
        { name: 'body', label: 'Entry', type: 'textarea', rows: 14, hint: 'Markdown: **bold**, *italic*, ## heading, - list, > quote', required: true }
      ],
      onSubmit: v => {
        const obj = clean({ id: e?.id || newId('journal', `${v.date}-${v.title}`), date: v.date, title: v.title, tags: v.tags, friends: v.friends, body: v.body });
        save('journal', obj);
        location.hash = `#journal/${obj.id}`;
      },
      onDelete: e && (() => { drop('journal', e.id); location.hash = '#journal'; })
    });
  }

  // ---------- export / save ----------
  function serialize(k) {
    const header = `// Friendo data — ${k}. See CLAUDE.md at the repo root for the format.\nwindow.FC_DATA = window.FC_DATA || {};\nwindow.FC_DATA.${k} = `;
    if (k !== 'journal') return header + JSON.stringify(db[k], null, 2) + ';\n';
    const tpl = s => '`' + String(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
    const items = db.journal.map(({ body, ...rest }) => `${JSON.stringify(rest, null, 2).slice(0, -2)},\n  "body": ${tpl(body || '')}\n}`);
    return `${header}[\n${items.join(',\n')}\n];\n`;
  }
  function openExport() {
    modalBody.innerHTML = `<div class="form"><h2>Save your changes</h2>
      <p>Edits made on this page live only in <b>this browser</b>. To keep them for good, download the files below into <code>friendo/data/</code> and commit them, or just tell Claude what you added and it will update the files for you.</p>
      <div class="export">${KINDS.map(k => `<div class="export-row"><code>data/${k}.js</code><span class="muted small">${plural(Object.keys(ov(k).upserts).length + ov(k).deleted.length, 'change')}</span><span class="spacer"></span>
        <button class="btn sm" data-copy="${k}">Copy</button><button class="btn sm primary" data-dl="${k}">Download</button></div>`).join('')}</div>
      <div class="form-actions"><button class="btn ghost danger" data-discard>Discard local changes</button><span class="spacer"></span><button class="btn" data-close>Close</button></div></div>`;
    modalBody.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([serialize(b.dataset.dl)], { type: 'text/javascript' }));
      Object.assign(document.createElement('a'), { href: url, download: `${b.dataset.dl}.js` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
    modalBody.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(serialize(b.dataset.copy)); b.textContent = 'Copied!'; } catch { b.textContent = 'Copy failed'; }
      setTimeout(() => { b.textContent = 'Copy'; }, 1500);
    }));
    modalBody.querySelector('[data-discard]').addEventListener('click', () => {
      if (!confirm('Throw away every change made in this browser? The repo files stay as they are.')) return;
      overlay = {}; persist(); rebuild(); modal.close(); render();
    });
    modal.showModal();
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) { modal.close(); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const { act, id, v } = el.dataset;
    switch (act) {
      case 'add-friend': return friendForm();
      case 'edit-friend': return friendForm(friend(id));
      case 'add-moment': return momentForm(null, { ...(el.dataset.friend ? { friends: [el.dataset.friend] } : {}), ...(el.dataset.type ? { type: el.dataset.type } : {}) });
      case 'edit-moment': return momentForm(db.moments.find(m => m.id === id));
      case 'add-entry': return entryForm();
      case 'edit-entry': return entryForm(db.journal.find(x => x.id === id));
      case 'export': return openExport();
      case 'hist-scope': state.histScope = v; return render();
      case 'invite-dir': state.inviteDir = v; return render();
      case 'journal-tag': state.journalTag = v; return renderJournalList(), view.querySelectorAll('[data-act=journal-tag]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
      case 'shuffle': seed++; return render();
      case 'pref-remove': {
        const f = friend(id), key = el.dataset.key;
        return save('friends', { ...f, [key]: (f[key] || []).filter((_, i) => i !== +el.dataset.i) });
      }
      case 'log-idea': {
        const s = lastIdeas[+el.dataset.i];
        const type = s.kind === 'reciprocate' || s.kind === 'reconnect' ? 'invite' : 'kindness';
        return momentForm(null, { from: 'me', type, friends: [s.f.id], title: s.idea || s.title, outcome: type === 'invite' ? 'upcoming' : '' });
      }
    }
  });
  document.addEventListener('submit', e => {
    const form = e.target.closest('.pref-add');
    if (!form) return;
    e.preventDefault();
    const val = form.v.value.trim(), f = friend(form.dataset.id), key = form.dataset.pref;
    if (!val || !f) return;
    save('friends', { ...f, [key]: [...(f[key] || []), ...val.split(',').map(s => s.trim()).filter(Boolean)] });
    view.querySelector(`.pref-add[data-pref="${key}"] input`)?.focus();
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'friend-search') { state.friendQuery = e.target.value; renderFriendGrid(); }
    if (e.target.id === 'journal-search') { state.journalQuery = e.target.value; renderJournalList(); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-nav-friend]')) location.hash = `#history/${t.value}`;
    if (t.matches('[data-invite-friend]')) { state.inviteFriend = t.value; render(); }
    if (t.matches('[data-idea-friend]')) { state.ideaFriend = t.value; render(); }
  });
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  window.addEventListener('hashchange', () => { if (modal.open) modal.close(); render(); window.scrollTo(0, 0); });

  rebuild();
  render();
})();
