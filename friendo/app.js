(() => {
  'use strict';

  const SRC = window.FC_DATA || {};
  const KINDS = ['friends', 'moments', 'journal'];
  const STORE_KEY = 'friendo.v1';
  const GH_KEY = 'friendo.github';
  const GH_DEFAULT = { owner: 'laiwong22', repo: 'website_projects', branch: '', dir: 'friendo', token: '' };
  const DAY = 86400000;
  const RECONNECT_DAYS = 30;

  const TYPES = {
    invite: { icon: '✉', label: 'Invite', plural: 'Invites' },
    gift: { icon: '🎁', label: 'Gift', plural: 'Gifts' },
    kindness: { icon: '♥', label: 'Kind act', plural: 'Kind acts' }
  };
  const SIZES = { small: { w: 1, label: 'Small' }, medium: { w: 2, label: 'Medium' }, big: { w: 3, label: 'Big' } };
  const CLOSENESS = [['acquaintance', 'Acquaintance'], ['friend', 'Friend'], ['close', 'Close friend']];
  const OUTCOME_LABEL = {
    them: { yes: 'I said yes', no: 'I turned it down', pending: 'Haven\'t answered' },
    me: { yes: 'They said yes', no: 'They said no', pending: 'Waiting to hear' }
  };

  const view = document.getElementById('view');
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  const pendingBtn = document.getElementById('pending');
  const tip = document.getElementById('tip');
  const toastEl = document.getElementById('toast');

  // ---------- small helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayISO = () => iso(new Date());
  const isoDaysAgo = n => iso(new Date(Date.now() - n * DAY));
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
  const fmtDate = s => parse(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const plural = (n, w, p = w + 's') => `${n} ${n === 1 ? w : p}`;
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
  const readJSON = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const writeJSON = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  let toastTimer;
  function toast(msg, bad = false) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('bad', bad);
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, bad ? 7000 : 3500);
  }

  // ---------- data: repo files + local edits overlay ----------
  // Repo files (data/*.js) are the source of truth. Edits made in the browser
  // are kept in localStorage as an overlay until saved to GitHub (or exported).
  let overlay = readJSON(STORE_KEY) || {};
  const ov = k => (overlay[k] ||= { upserts: {}, deleted: [] });
  const persist = () => writeJSON(STORE_KEY, overlay);
  const baseHas = (k, id) => (SRC[k] || []).some(x => x.id === id);
  // Key-order-insensitive comparison, so an edit that ends up where it started isn't "unsaved".
  const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',')}}` : JSON.stringify(v);
  const sameAsBase = (k, obj) => {
    const base = (SRC[k] || []).find(x => x.id === obj.id);
    return !!base && stable(k === 'moments' ? normMoment(base) : base) === stable(k === 'moments' ? normMoment(obj) : obj);
  };

  function normMoment(m) {
    const out = { ...m, friends: m.friends || [] };
    if (!TYPES[out.type]) out.type = 'kindness';
    if (!SIZES[out.size]) out.size = 'medium';
    if (out.type === 'invite') {
      out.outcome = { went: 'yes', "couldn't go": 'no', declined: 'no', upcoming: 'pending' }[out.outcome] || out.outcome || '';
    } else delete out.outcome;
    return out;
  }

  const db = {};
  function rebuild() {
    for (const k of KINDS) {
      const o = ov(k);
      for (const [id, x] of Object.entries(o.upserts)) if (sameAsBase(k, x)) delete o.upserts[id];
      const del = new Set(o.deleted), map = new Map();
      (SRC[k] || []).forEach(x => map.set(x.id, x));
      Object.values(o.upserts).forEach(x => map.set(x.id, x));
      db[k] = [...map.values()].filter(x => !del.has(x.id));
    }
    db.moments = db.moments.map(normMoment).sort((a, b) => b.date.localeCompare(a.date));
    db.journal.sort((a, b) => b.date.localeCompare(a.date));
    persist();
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
  const changesIn = k => Object.keys(ov(k).upserts).length + ov(k).deleted.length;
  const pendingCount = () => KINDS.reduce((n, k) => n + changesIn(k), 0);
  function newId(k, base) {
    const ids = new Set(db[k].map(x => x.id)), root = slug(base);
    let id = root, i = 2;
    while (ids.has(id)) id = `${root}-${i++}`;
    return id;
  }

  // ---------- AI priorities (written weekly to data/priorities.js) ----------
  const PRI = () => SRC.priorities || null;
  function rankOf(id) {
    const list = PRI()?.friends || [];
    const i = list.findIndex(p => p.id === id);
    return i < 0 ? null : { rank: i + 1, reason: list[i].reason };
  }

  // ---------- friend helpers ----------
  const friend = id => db.friends.find(f => f.id === id);
  const fname = id => friend(id)?.name ?? 'Someone';
  const first = f => f.nickname || f.name.split(' ')[0];
  const momentsOf = id => db.moments.filter(m => m.friends.includes(id));
  const happened = m => m.date <= todayISO() && !(m.type === 'invite' && (m.outcome === 'no' || m.outcome === 'pending'));
  const lastTogether = id => momentsOf(id).find(happened);
  function counts(ms) {
    const c = { them: { invite: 0, gift: 0, kindness: 0 }, me: { invite: 0, gift: 0, kindness: 0 }, saidYes: 0, saidNo: 0 };
    for (const m of ms) {
      c[m.from === 'me' ? 'me' : 'them'][m.type]++;
      if (m.type === 'invite' && m.from === 'them') { if (m.outcome === 'yes') c.saidYes++; if (m.outcome === 'no') c.saidNo++; }
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
  const closenessLabel = c => (CLOSENESS.find(([v]) => v === c) || [])[1] || '';
  const ghConf = () => ({ ...GH_DEFAULT, ...(readJSON(GH_KEY) || {}) });
  const rawUrl = path => { const g = ghConf(); return `https://raw.githubusercontent.com/${g.owner}/${g.repo}/${g.branch || 'HEAD'}/${g.dir}/${path}`; };
  function avatar(f, size = '') {
    const cls = `avatar ${size}`;
    if (f.photo) {
      // Freshly committed photos take a minute to reach the site; fall back to GitHub's raw copy.
      const fallback = f.photo.startsWith('data:') ? '' : ` data-fallback="${esc(rawUrl(f.photo))}"`;
      return `<img class="${cls}" src="${esc(f.photo)}"${fallback} alt="" loading="lazy">`;
    }
    return `<span class="${cls}" style="--hue:${hash(f.id) % 360}" aria-hidden="true">${esc(f.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span>`;
  }
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
    [/concert|music|band|jazz|vinyl|festival|gig/, ['Find a show for you and {n} to go to', 'Make {n} a playlist inspired by {l}', 'Go record shopping with {n}']],
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
      const r = rankOf(f.id), boost = r ? Math.max(0, 10 - 2 * (r.rank - 1)) : 0;
      const push = s => out.push({ f, ...s, score: s.score + boost });
      const mineSince = d => ms.some(m => m.from === 'me' && m.date >= d);

      const bd = daysToBirthday(f.birthday);
      if (bd !== null && bd <= 30) {
        const gift = (f.likes || []).length ? fill(pick(BIRTHDAY, f.id + 'bd'), f, pick(f.likes, f.id + 'gift')) : 'A heartfelt card';
        push({ kind: 'birthday', score: 100 - bd, title: bd === 0 ? `It's ${n}'s birthday today!` : `${n}'s birthday is in ${plural(bd, 'day')}`, idea: gift, why: fmtBirthday(f.birthday) });
      }

      const kind = past.find(m => m.from === 'them' && m.type !== 'invite' && daysBetween(m.date, today) <= 21);
      if (kind && !mineSince(kind.date)) {
        push({ kind: 'thanks', score: 80, title: `Thank ${n} for “${kind.title}”`, idea: fill(pick(THANKS, f.id + 'thx'), f), why: `${ago(kind.date)}, and you haven't done anything for them since.` });
      }

      const declined = past.find(m => m.type === 'invite' && m.from === 'them' && m.outcome === 'no' && daysBetween(m.date, today) <= 60);
      const recent = ms.filter(m => m.type === 'invite' && m.date >= yearAgo);
      const them = recent.filter(m => m.from === 'them').length, me = recent.filter(m => m.from === 'me').length;
      if (declined && !mineSince(declined.date)) {
        push({ kind: 'makeup', score: 75, title: `Make it up to ${n}`, idea: activityFor(f, 'mk').text, why: `You turned down “${declined.title}” ${ago(declined.date)}.` });
      } else if (them - me >= 2 || (them >= 1 && me === 0)) {
        push({ kind: 'reciprocate', score: 55 + 5 * (them - me), title: `Your turn to invite ${n}`, idea: activityFor(f, 'rec').text, why: `In the last year ${n} invited you ${them}× and you invited them ${me}×.` });
      }

      const last = past.find(happened);
      const upcoming = ms.some(m => m.date > today);
      const gap = last ? daysBetween(last.date, today) : null;
      if (!upcoming && (gap === null || gap > RECONNECT_DAYS)) {
        push({ kind: 'reconnect', score: 30 + Math.min(30, (gap ?? 120) / 10), title: gap === null ? `Make a first memory with ${n}` : `It's been ${gap} days since you saw ${n}`, idea: activityFor(f, 'recon').text, why: last ? `Last time: “${last.title}”` : 'Nothing logged yet.' });
      }

      if ((f.likes || []).length) {
        const a = activityFor(f, 'just');
        push({ kind: 'idea', score: 10, title: a.text, why: `Because ${n} loves ${a.like}.` });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  }
  const KIND_META = {
    birthday: { icon: '🎂', label: 'Birthday', log: 'gift' },
    thanks: { icon: '💌', label: 'Say thanks', log: 'kindness' },
    makeup: { icon: '🤝', label: 'Make it up', log: 'invite' },
    reciprocate: { icon: '↩︎', label: 'Return the invite', log: 'invite' },
    reconnect: { icon: '👋', label: 'Reconnect', log: 'invite' },
    idea: { icon: '✨', label: 'Just because', log: 'invite' }
  };

  // ---------- routing & view state ----------
  const state = {
    friendQuery: '', friendSort: PRI() ? 'ai' : 'added', friendClose: '', histScope: 'them', detailSort: 'ai',
    inviteDir: 'all', inviteOutcome: '', inviteFriend: '', ideaFriend: '', journalQuery: '', journalTag: '', yearType: ''
  };
  let lastIdeas = [];
  const TABS = ['friends', 'history', 'invites', 'calendar', 'ideas', 'journal'];
  const route = () => {
    const [tab = 'friends', id = ''] = location.hash.slice(1).split('/').map(decodeURIComponent);
    return { tab: TABS.includes(tab) ? tab : 'friends', id };
  };

  function render() {
    const { tab, id } = route();
    document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
    const n = pendingCount();
    pendingBtn.hidden = n === 0;
    pendingBtn.textContent = `${plural(n, 'unsaved change')} · ${ghConf().token ? 'Save to GitHub' : 'Save'}`;
    hideTip();
    view.innerHTML = ({ friends: viewFriends, history: viewHistory, invites: viewInvites, calendar: viewCalendar, ideas: viewIdeas, journal: viewJournal })[tab](id);
    if (tab === 'friends') renderFriendGrid();
    if (tab === 'journal' && !id) renderJournalList();
    if (tab === 'calendar' && id.startsWith('year')) renderTreemap();
  }

  const head = (title, sub, actions = '') =>
    `<section class="head"><div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="head-actions">${actions}</div></section>`;
  const empty = (msg, action = '') => `<div class="empty"><p>${msg}</p>${action}</div>`;
  const seg = (act, options, current, label) =>
    `<div class="seg" role="group" aria-label="${esc(label)}">${options.map(([v, l]) => `<button data-act="${act}" data-v="${esc(v)}" class="${current === v ? 'on' : ''}" aria-pressed="${current === v}">${l}</button>`).join('')}</div>`;

  // ---------- Friends tab ----------
  function viewFriends() {
    const pri = PRI();
    return head('Friends', `${plural(db.friends.length, 'person', 'people')} in your circle${pri ? ` · AI priorities updated ${esc(fmtDate(pri.updated))}` : ''}`, `<button class="btn primary" data-act="add-friend">+ Add friend</button>`) +
      (pri?.summary ? `<p class="focus"><b>This week:</b> ${esc(pri.summary)}</p>` : '') +
      `<input class="search" id="friend-search" type="search" placeholder="Search names, likes, details…" value="${esc(state.friendQuery)}">
       <div class="controls">
         ${seg('friend-sort', [['ai', 'AI priority'], ['added', 'Order added'], ['az', 'A–Z']], state.friendSort, 'Sort')}
         ${seg('friend-close', [['', 'Everyone'], ['close', 'Close'], ['friend', 'Friends'], ['acquaintance', 'Acquaintances']], state.friendClose, 'Closeness')}
       </div>
       <div class="grid" id="friend-grid"></div>`;
  }
  function sortedFriends() {
    const list = [...db.friends];
    if (state.friendSort === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
    if (state.friendSort === 'ai') list.sort((a, b) => (rankOf(a.id)?.rank ?? 1e9) - (rankOf(b.id)?.rank ?? 1e9));
    return list;
  }
  function renderFriendGrid() {
    const grid = document.getElementById('friend-grid');
    if (!db.friends.length) { grid.outerHTML = empty('No friends yet. Add your first one to start keeping track.', '<button class="btn primary" data-act="add-friend">+ Add friend</button>'); return; }
    const q = state.friendQuery.toLowerCase();
    const list = sortedFriends().filter(f => (!state.friendClose || f.closeness === state.friendClose) &&
      (!q || [f.name, f.nickname, f.met, ...(f.likes || []), ...(f.dislikes || []), ...(f.details || []).map(d => d.text)].join(' ').toLowerCase().includes(q)));
    grid.innerHTML = list.map(f => {
      const c = counts(momentsOf(f.id)), last = lastTogether(f.id), bd = daysToBirthday(f.birthday), r = rankOf(f.id);
      return `<a class="card friend-card" href="#history/${esc(f.id)}">
        <div class="friend-top">${avatar(f)}<div><h3>${esc(f.name)}</h3><p class="muted small">${f.closeness ? `${esc(closenessLabel(f.closeness))} · ` : ''}${last ? `Last together ${esc(ago(last.date))}` : 'No moments yet'}</p></div>
        ${bd !== null && bd <= 30 ? `<span class="badge warn">🎂 ${bd === 0 ? 'today' : `in ${bd}d`}</span>` : ''}</div>
        ${r && state.friendSort === 'ai' ? `<p class="ai-reason"><span class="rank">#${r.rank}</span> ${esc(r.reason)}</p>` : ''}
        <div class="tally"><span title="Invites from them / from you">✉ <b>${c.them.invite}</b>/${c.me.invite}</span><span title="Gifts from them / from you">🎁 <b>${c.them.gift}</b>/${c.me.gift}</span><span title="Kind acts from them / from you">♥ <b>${c.them.kindness}</b>/${c.me.kindness}</span><span class="muted">them/you</span></div>
        ${(f.likes || []).length ? `<div class="chips">${f.likes.slice(0, 4).map(l => `<span class="chip like">${esc(l)}</span>`).join('')}${f.likes.length > 4 ? `<span class="chip">+${f.likes.length - 4}</span>` : ''}</div>` : ''}
      </a>`;
    }).join('') || `<p class="muted">No one matches.</p>`;
  }

  // ---------- History tab ----------
  function orderedDetails(f) {
    const details = f.details || [];
    const ids = PRI()?.details?.[f.id];
    if (state.detailSort !== 'ai' || !ids) return details.map(d => ({ d, isNew: false }));
    const pos = new Map(ids.map((id, i) => [id, i]));
    const ranked = details.filter(d => pos.has(d.id)).sort((a, b) => pos.get(a.id) - pos.get(b.id));
    const fresh = details.filter(d => !pos.has(d.id));
    return [...fresh.map(d => ({ d, isNew: true })), ...ranked.map(d => ({ d, isNew: false }))];
  }
  function viewHistory(id) {
    if (!db.friends.length) return head('History') + empty('Add a friend first, then their history shows up here.', '<button class="btn primary" data-act="add-friend">+ Add friend</button>');
    const f = friend(id) || sortedFriends()[0];
    const ms = momentsOf(f.id), c = counts(ms), r = rankOf(f.id);
    const shown = state.histScope === 'them' ? ms.filter(m => m.from === 'them') : ms;
    const entries = db.journal.filter(e => (e.friends || []).includes(f.id));
    const bd = daysToBirthday(f.birthday);

    const picker = `<aside class="picker">
      <select class="picker-select" data-nav-friend aria-label="Choose friend">${sortedFriends().map(x => `<option value="${esc(x.id)}" ${x.id === f.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <ul class="picker-list">${sortedFriends().map(x => `<li><a href="#history/${esc(x.id)}" class="${x.id === f.id ? 'active' : ''}">${avatar(x, 'sm')}<span>${esc(x.name)}</span></a></li>`).join('')}</ul>
    </aside>`;

    const profile = `<div class="card profile">
      <div class="profile-top">${avatar(f, 'lg')}<div class="grow"><h1>${esc(f.name)}</h1>
        <p class="muted">${[f.nickname && f.nickname !== f.name.split(' ')[0] ? `“${esc(f.nickname)}”` : '', f.met ? esc(f.met) : '', f.birthday ? `🎂 ${esc(fmtBirthday(f.birthday))}${bd !== null && bd <= 30 ? ` <span class="badge warn">in ${bd}d</span>` : ''}` : ''].filter(Boolean).join(' · ')}</p></div>
        <button class="btn ghost" data-act="edit-friend" data-id="${esc(f.id)}">Edit</button></div>
      <div class="closeness">${seg('set-close', CLOSENESS, f.closeness || '', 'Closeness').replace(/data-act="set-close"/g, `data-act="set-close" data-id="${esc(f.id)}"`)}</div>
      ${r ? `<p class="ai-reason"><span class="rank">#${r.rank} this week</span> ${esc(r.reason)}</p>` : ''}
    </div>`;

    const prefs = ['likes', 'dislikes'].map(key => `<div class="card prefs ${key}">
      <h3>${key === 'likes' ? '♥ Likes' : '✕ Dislikes'}</h3>
      <div class="chips">${(f[key] || []).map((l, i) => `<span class="chip ${key === 'likes' ? 'like' : 'dislike'}">${esc(l)}<button class="x" data-act="pref-remove" data-id="${esc(f.id)}" data-key="${key}" data-i="${i}" aria-label="Remove ${esc(l)}">×</button></span>`).join('') || '<span class="muted small">Nothing yet</span>'}</div>
      <form class="inline-add" data-add="${key}" data-id="${esc(f.id)}"><input name="v" placeholder="Add a ${key === 'likes' ? 'like' : 'dislike'}…" aria-label="Add ${key}"><button class="btn sm">Add</button></form>
    </div>`).join('');

    const details = orderedDetails(f);
    const hasAiOrder = !!PRI()?.details?.[f.id];
    const detailsCard = `<div class="card details">
      <div class="section-head"><h3>Everything to remember</h3>${hasAiOrder ? seg('detail-sort', [['ai', 'AI priority'], ['added', 'Order added']], state.detailSort, 'Sort details') : ''}</div>
      ${details.length ? `<ol class="detail-list">${details.map(({ d, isNew }) => `<li><span class="detail-text">${esc(d.text)}</span><span class="muted small">${d.date ? esc(fmtDate(d.date)) : ''}${isNew ? ' · <span class="badge info">new</span>' : ''}</span>
        <button class="x" data-act="detail-remove" data-id="${esc(f.id)}" data-d="${esc(d.id)}" aria-label="Remove detail">×</button></li>`).join('')}</ol>` : '<p class="muted small">Partner\'s name, allergies, what they\'re going through, sizes, inside jokes… anything worth remembering.</p>'}
      <form class="inline-add" data-add="details" data-id="${esc(f.id)}"><input name="v" placeholder="Add a detail…" aria-label="Add a detail"><button class="btn sm">Add</button></form>
    </div>`;

    const stats = `<div class="stats">
      ${Object.entries(TYPES).map(([t, meta]) => `<div class="stat"><span class="stat-label">${meta.icon} ${meta.plural}</span><b>${c.them[t]} <small>from them</small></b><b>${c.me[t]} <small>from you</small></b></div>`).join('')}
      <div class="stat"><span class="stat-label">Their invites</span><b>${c.saidYes} <small>you said yes</small></b><b>${c.saidNo} <small>you turned down</small></b></div>
    </div>`;

    const timeline = `<section class="section">
      <div class="section-head"><h2>Timeline</h2>
        ${seg('hist-scope', [['them', 'What they did for me'], ['all', 'Everything']], state.histScope, 'Show')}
        <button class="btn primary sm" data-act="add-moment" data-friend="${esc(f.id)}">+ Log moment</button></div>
      ${shown.length ? `<ol class="timeline">${shown.map(m => momentItem(m, f.id)).join('')}</ol>` : empty(state.histScope === 'them' ? `Nothing logged from ${esc(first(f))} yet.` : 'No moments yet.')}
    </section>`;

    const journal = entries.length ? `<section class="section"><h2>In your journal</h2><div class="entry-list">${entries.map(entryCard).join('')}</div></section>` : '';

    return `<div class="history">${picker}<div class="history-main">${profile}${detailsCard}<div class="prefs-row">${prefs}</div>${stats}${timeline}${journal}</div></div>`;
  }

  function momentItem(m, perspective) {
    const others = m.friends.filter(id => id !== perspective);
    const who = m.from === 'them' ? (perspective ? first(friend(perspective)) : m.friends.map(fname).join(', ')) : 'You';
    const verb = m.type === 'invite' ? (m.from === 'them' ? 'invited you' : 'sent the invite')
      : m.type === 'gift' ? (m.from === 'them' ? 'gave you a gift' : 'gave a gift')
        : (m.from === 'them' ? 'was there for you' : 'did something kind');
    const oc = m.type === 'invite' && m.outcome
      ? `<span class="badge ${m.outcome === 'yes' ? 'good' : m.outcome === 'pending' ? 'info' : 'bad'}">${esc(OUTCOME_LABEL[m.from === 'me' ? 'me' : 'them'][m.outcome] || m.outcome)}</span>` : '';
    const size = m.size !== 'medium' ? `<span class="badge">${SIZES[m.size].label}</span>` : '';
    return `<li class="moment ${m.from === 'me' ? 'me' : 'them'}">
      <div class="dot ${m.type}" aria-hidden="true">${TYPES[m.type].icon}</div>
      <div class="moment-body">
        <div class="moment-meta"><time datetime="${esc(m.date)}">${esc(fmtDate(m.date))}</time><span class="muted">· ${esc(who)} ${esc(verb)}</span>${oc}${size}</div>
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
    const yr = all.filter(m => m.date >= isoDaysAgo(365));
    const recv = yr.filter(m => m.from === 'them'), sent = yr.filter(m => m.from === 'me');
    let list = all;
    if (state.inviteDir !== 'all') list = list.filter(m => m.from === state.inviteDir);
    if (state.inviteOutcome) list = list.filter(m => m.outcome === state.inviteOutcome);
    if (state.inviteFriend) list = list.filter(m => m.friends.includes(state.inviteFriend));

    const balance = db.friends.map(f => {
      const ms = all.filter(m => m.friends.includes(f.id));
      return { f, them: ms.filter(m => m.from === 'them').length, me: ms.filter(m => m.from === 'me').length };
    }).filter(b => b.them + b.me).sort((a, b) => (b.them - b.me) - (a.them - a.me));
    const max = Math.max(1, ...balance.map(b => Math.max(b.them, b.me)));

    return head('Invites', 'Every invite in both directions, and how each one was answered.', `<button class="btn primary" data-act="add-moment" data-type="invite">+ Log invite</button>`) +
      `<div class="stats">
        <div class="stat"><span class="stat-label">Invites you got (12 mo)</span><b>${recv.length}</b><span class="muted small">${recv.filter(m => m.outcome === 'yes').length} said yes · ${recv.filter(m => m.outcome === 'no').length} turned down</span></div>
        <div class="stat"><span class="stat-label">Invites you sent (12 mo)</span><b>${sent.length}</b><span class="muted small">${sent.filter(m => m.outcome === 'yes').length} said yes · ${sent.filter(m => m.outcome === 'no').length} said no</span></div>
        <div class="stat"><span class="stat-label">Waiting on an answer</span><b>${all.filter(m => m.outcome === 'pending').length}</b><span class="muted small">invites still open</span></div>
      </div>` +
      (balance.length ? `<section class="section card"><h2>Who's been inviting whom</h2>
        <div class="legend"><span><i class="sw them"></i>They invited you</span><span><i class="sw me"></i>You invited them</span></div>
        <div class="balance">${balance.map(b => `<a class="bal-row" href="#history/${esc(b.f.id)}" aria-label="${esc(b.f.name)}: invited you ${b.them}, you invited ${b.me}">
          <span class="bal-name">${esc(b.f.name)}</span>
          <span class="bal-bar left"><i style="width:${b.them / max * 100}%"></i><em>${b.them}</em></span>
          <span class="bal-bar right"><i style="width:${b.me / max * 100}%"></i><em>${b.me}</em></span>
        </a>`).join('')}</div></section>` : '') +
      `<section class="section"><div class="section-head"><h2>Log</h2>
        ${seg('invite-dir', [['all', 'All'], ['them', 'To me'], ['me', 'From me']], state.inviteDir, 'Direction')}
        ${seg('invite-outcome', [['', 'Any answer'], ['yes', 'Yes'], ['no', 'No'], ['pending', 'Pending']], state.inviteOutcome, 'Answer')}
        <select data-invite-friend aria-label="Filter by friend"><option value="">Everyone</option>${db.friends.map(f => `<option value="${esc(f.id)}" ${state.inviteFriend === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
      </div>
      ${list.length ? `<ol class="timeline">${list.map(m => momentItem(m)).join('')}</ol>` : empty('No invites match.')}</section>`;
  }

  // ---------- Calendar tab: month grid + year map ----------
  function viewCalendar(id) {
    const now = new Date();
    if (id.startsWith('year')) {
      const year = +(id.split('-')[1] || now.getFullYear());
      return calHead(seg('cal-mode', [['month', 'Month'], ['year', 'Year map']], 'year', 'View'),
        `<div class="cal-nav"><a class="btn sm" href="#calendar/year-${year - 1}" aria-label="Previous year">‹</a><h2>${year}</h2><a class="btn sm" href="#calendar/year-${year + 1}" aria-label="Next year">›</a></div>`) +
        yearMap(year);
    }
    const ym = /^\d{4}-\d{2}$/.test(id) ? id : iso(now).slice(0, 7);
    const d0 = parse(ym + '-01'), y = d0.getFullYear(), mo = d0.getMonth();
    const prev = iso(new Date(y, mo - 1, 1)).slice(0, 7), next = iso(new Date(y, mo + 1, 1)).slice(0, 7);
    const monthMs = db.moments.filter(m => m.date.startsWith(ym));
    const byDay = {};
    monthMs.forEach(m => (byDay[m.date] ||= []).push(m));
    const start = new Date(y, mo, 1 - d0.getDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), key = iso(d);
      if (i >= 35 && d.getMonth() !== mo) break;
      const items = (byDay[key] || []).slice().reverse();
      cells.push(`<div class="day ${d.getMonth() !== mo ? 'out' : ''} ${key === todayISO() ? 'today' : ''}">
        <span class="day-n">${d.getDate()}</span>
        ${items.slice(0, 3).map(m => `<button class="pill ${m.from === 'me' ? 'me' : 'them'}" data-act="edit-moment" data-id="${esc(m.id)}" data-tip="${esc(tipText(m))}" aria-label="${esc(tipText(m))}"><span aria-hidden="true">${TYPES[m.type].icon}</span><span class="pill-t">${esc(m.friends.map(id => first(friend(id) || { name: id })).join(', '))}</span></button>`).join('')}
        ${items.length > 3 ? `<span class="more">+${items.length - 3} more</span>` : ''}
      </div>`);
    }
    const title = d0.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return calHead(seg('cal-mode', [['month', 'Month'], ['year', 'Year map']], 'month', 'View'),
      `<div class="cal-nav"><a class="btn sm" href="#calendar/${prev}" aria-label="Previous month">‹</a><h2>${esc(title)}</h2><a class="btn sm" href="#calendar/${next}" aria-label="Next month">›</a>
        ${ym !== iso(now).slice(0, 7) ? '<a class="btn sm ghost" href="#calendar">Today</a>' : ''}</div>`) +
      `<div class="legend"><span><i class="sw them"></i>They did for you</span><span><i class="sw me"></i>You did for them</span><span>✉ invite · 🎁 gift · ♥ kind act</span></div>
       <div class="cal card"><div class="dow">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<span>${d}</span>`).join('')}</div><div class="days">${cells.join('')}</div></div>
       <section class="section"><div class="section-head"><h2>This month</h2><button class="btn primary sm" data-act="add-moment">+ Log moment</button></div>
       ${monthMs.length ? `<ol class="timeline">${monthMs.map(m => momentItem(m)).join('')}</ol>` : empty('Nothing logged this month.')}</section>`;
  }
  const calHead = (modeSeg, nav) => `<section class="head"><div><h1>Calendar</h1></div><div class="head-actions">${modeSeg}</div></section>${nav}`;
  const tipText = m => `${fmtDate(m.date)} · ${TYPES[m.type].label}${m.from === 'me' ? ' from you' : ' from ' + m.friends.map(fname).join(', ')} · ${m.title}${m.size !== 'medium' ? ` (${SIZES[m.size].label.toLowerCase()})` : ''}`;

  function yearData(year) {
    const ms = db.moments.filter(m => m.date.startsWith(String(year)) && (!state.yearType || m.type === state.yearType));
    const groups = db.friends.map(f => {
      const items = ms.filter(m => m.friends.includes(f.id)).map(m => ({ m, value: SIZES[m.size].w }));
      return { f, items, value: items.reduce((s, i) => s + i.value, 0) };
    }).filter(g => g.value).sort((a, b) => b.value - a.value);
    return { ms, groups };
  }
  function yearMap(year) {
    const { ms, groups } = yearData(year);
    const them = ms.filter(m => m.from === 'them').length, me = ms.length - them;
    return `<div class="stats">
        <div class="stat"><span class="stat-label">Moments in ${year}</span><b>${ms.length}</b></div>
        <div class="stat"><span class="stat-label">From friends to you</span><b>${them}</b></div>
        <div class="stat"><span class="stat-label">From you to friends</span><b>${me}</b></div>
        <div class="stat"><span class="stat-label">Biggest year with</span><b class="stat-name">${groups[0] ? esc(groups[0].f.name) : '–'}</b></div>
      </div>
      <section class="section card year-card">
        <div class="section-head"><h2>Your year with everyone</h2>
          ${seg('year-type', [['', 'Everything'], ['invite', '✉ Invites'], ['gift', '🎁 Gifts'], ['kindness', '♥ Kind acts']], state.yearType, 'Type')}</div>
        <p class="muted small">Each block is a friend. The more moments you shared and the bigger they were (small = 1, medium = 2, big = 3), the more room they take up.</p>
        <div class="legend"><span><i class="sw them"></i>They did for you</span><span><i class="sw me"></i>You did for them</span></div>
        ${groups.length ? `<div class="treemap" id="treemap" data-year="${year}"></div>` : empty(`Nothing logged for ${year} yet.`)}
      </section>
      ${groups.length ? `<section class="section card"><h2>By friend</h2><div class="table-wrap"><table class="table">
        <thead><tr><th>Friend</th><th>From them</th><th>From you</th><th>Moments</th><th>Size points</th></tr></thead>
        <tbody>${groups.map(g => `<tr><td><a href="#history/${esc(g.f.id)}">${esc(g.f.name)}</a></td><td>${g.items.filter(i => i.m.from === 'them').length}</td><td>${g.items.filter(i => i.m.from === 'me').length}</td><td>${g.items.length}</td><td>${g.value}</td></tr>`).join('')}</tbody>
      </table></div></section>` : ''}`;
  }

  // Squarified treemap: lays out items (with .value) in the rect, keeping tiles close to square.
  function squarify(items, x, y, w, h) {
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total || w <= 0 || h <= 0) return [];
    const scale = (w * h) / total, out = [];
    let rect = { x, y, w, h }, row = [];
    const worst = (r, side) => {
      const s = r.reduce((a, n) => a + n.area, 0), mx = Math.max(...r.map(n => n.area)), mn = Math.min(...r.map(n => n.area));
      return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
    };
    const place = r => {
      const s = r.reduce((a, n) => a + n.area, 0);
      if (rect.w >= rect.h) {
        const cw = s / rect.h; let cy = rect.y;
        r.forEach(n => { const nh = n.area / cw; out.push({ item: n.item, x: rect.x, y: cy, w: cw, h: nh }); cy += nh; });
        rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
      } else {
        const rh = s / rect.w; let cx = rect.x;
        r.forEach(n => { const nw = n.area / rh; out.push({ item: n.item, x: cx, y: rect.y, w: nw, h: rh }); cx += nw; });
        rect = { x: rect.x, y: rect.y + rh, w: rect.w, h: rect.h - rh };
      }
    };
    for (const n of items.map(item => ({ item, area: item.value * scale }))) {
      const side = Math.min(rect.w, rect.h);
      if (!row.length || worst([...row, n], side) <= worst(row, side)) row.push(n);
      else { place(row); row = [n]; }
    }
    if (row.length) place(row);
    return out;
  }
  function renderTreemap() {
    const el = document.getElementById('treemap');
    if (!el) return;
    const { groups } = yearData(+el.dataset.year);
    const W = el.clientWidth, H = Math.round(Math.min(620, Math.max(340, W * 0.62)));
    el.style.height = `${H}px`;
    const GAP = 4, PAD = 2, LABEL = 26;
    el.innerHTML = squarify(groups, 0, 0, W, H).map(({ item: g, x, y, w, h }) => {
      const ix = x + GAP / 2, iy = y + GAP / 2, iw = Math.max(0, w - GAP), ih = Math.max(0, h - GAP);
      const showLabel = iw > 70 && ih > 50;
      const top = showLabel ? LABEL : 0;
      const items = [...g.items].sort((a, b) => b.value - a.value);
      const tiles = squarify(items, PAD, top + PAD, iw - PAD * 2, ih - top - PAD * 2).map(({ item: { m }, x: tx, y: ty, w: tw, h: th }) => {
        const t = tipText(m), roomy = tw > 90 && th > 44;
        return `<button class="tile ${m.from === 'me' ? 'me' : 'them'}" style="left:${tx + 1}px;top:${ty + 1}px;width:${Math.max(0, tw - 2)}px;height:${Math.max(0, th - 2)}px" data-act="edit-moment" data-id="${esc(m.id)}" data-tip="${esc(t)}" aria-label="${esc(t)}">
          ${tw > 22 && th > 22 ? `<span class="tile-icon" aria-hidden="true">${TYPES[m.type].icon}</span>` : ''}${roomy ? `<span class="tile-t">${esc(m.title)}</span>` : ''}</button>`;
      }).join('');
      return `<div class="group" style="left:${ix}px;top:${iy}px;width:${iw}px;height:${ih}px">
        ${showLabel ? `<a class="group-label" href="#history/${esc(g.f.id)}">${esc(g.f.name)} <span>${g.items.length} · ${g.value} pts</span></a>` : ''}${tiles}</div>`;
    }).join('');
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
            <a class="idea-who" href="#history/${esc(s.f.id)}">${avatar(s.f, 'xs')}${esc(s.f.name)}</a></div>
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
    return head('Journal', plural(db.journal.length, 'entry', 'entries'), `<button class="btn primary" data-act="add-entry">+ New entry</button>`) +
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
      case 'textarea': return `<div class="field" data-field="${f.name}">${label}<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}" ${req}>${esc(v ?? '')}</textarea></div>`;
      case 'list': return `<div class="field" data-field="${f.name}">${label}<textarea id="${id}" name="${f.name}" rows="2" placeholder="${esc(f.placeholder || '')}">${esc((v || []).join(', '))}</textarea></div>`;
      case 'select': return `<div class="field" data-field="${f.name}">${label}<select id="${id}" name="${f.name}">${f.options.map(([val, l]) => `<option value="${esc(val)}" ${val === (v ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
      case 'radio': return `<fieldset class="field" data-field="${f.name}"><legend>${esc(f.label)}</legend><div class="seg">${f.options.map(([val, l]) => `<label class="seg-opt"><input type="radio" name="${f.name}" value="${esc(val)}" ${val === v ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></fieldset>`;
      case 'friends': return `<fieldset class="field" data-field="${f.name}"><legend>${esc(f.label)}</legend><div class="pick">${db.friends.map(x => `<label class="pick-opt"><input type="checkbox" name="${f.name}" value="${esc(x.id)}" ${(v || []).includes(x.id) ? 'checked' : ''}>${avatar(x, 'xs')}<span>${esc(x.name)}</span></label>`).join('') || '<span class="muted small">Add friends first.</span>'}</div></fieldset>`;
      case 'photo': return `<div class="field photo-field" data-field="${f.name}"><span class="label">${esc(f.label)}</span>
        <div class="photo-row"><span class="photo-preview">${v ? `<img class="avatar lg" src="${esc(v)}" alt="">` : '<span class="avatar lg placeholder" aria-hidden="true">+</span>'}</span>
        <label class="btn sm"><input type="file" accept="image/*" hidden data-photo-input>Choose photo</label>
        <button type="button" class="btn sm ghost" data-photo-clear ${v ? '' : 'hidden'}>Remove</button>
        <input type="hidden" name="${f.name}" value="${esc(v ?? '')}"></div></div>`;
      default: return `<div class="field" data-field="${f.name}">${label}<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v ?? '')}" placeholder="${esc(f.placeholder || '')}" ${f.pattern ? `pattern="${f.pattern}"` : ''} ${req}></div>`;
    }
  }
  function openForm({ title, fields, values = {}, onSubmit, onDelete, onRender }) {
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
    const photoInput = form.querySelector('[data-photo-input]');
    if (photoInput) {
      const hidden = form.querySelector('.photo-field input[type=hidden]'), preview = form.querySelector('.photo-preview'), clear = form.querySelector('[data-photo-clear]');
      photoInput.addEventListener('change', async () => {
        const file = photoInput.files[0];
        if (!file) return;
        try {
          hidden.value = await resizePhoto(file);
          preview.innerHTML = `<img class="avatar lg" src="${hidden.value}" alt="">`;
          clear.hidden = false;
        } catch { toast('Couldn\'t read that image. Try a JPG or PNG.', true); }
      });
      clear.addEventListener('click', () => { hidden.value = ''; preview.innerHTML = '<span class="avatar lg placeholder" aria-hidden="true">+</span>'; clear.hidden = true; });
    }
    onRender?.(form);
    modal.showModal();
    form.querySelector('input:not([type=radio]):not([type=checkbox]):not([type=hidden]):not([type=file]), textarea')?.focus();
  }
  // Square-crops and shrinks a photo so it stays small (~30 KB) in the repo.
  function resizePhoto(file, size = 360) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(img.width, img.height), c = document.createElement('canvas');
        c.width = c.height = size;
        c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }
  const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)));

  function friendForm(f) {
    openForm({
      title: f ? `Edit ${f.name}` : 'Add a friend',
      values: f || { closeness: 'friend' },
      fields: [
        { name: 'photo', label: 'Photo', type: 'photo' },
        { name: 'name', label: 'Name', required: true, placeholder: 'Full name' },
        { name: 'nickname', label: 'Nickname', placeholder: 'What you call them' },
        { name: 'closeness', label: 'How close are you?', type: 'radio', options: CLOSENESS },
        { name: 'birthday', label: 'Birthday', hint: 'MM-DD', placeholder: 'MM-DD', pattern: '\\d{2}-\\d{2}' },
        { name: 'met', label: 'How you met', placeholder: 'College roommate, 2018' },
        { name: 'likes', label: 'Likes', type: 'list', hint: 'comma separated', placeholder: 'spicy ramen, pottery, indie concerts' },
        { name: 'dislikes', label: 'Dislikes', type: 'list', hint: 'comma separated', placeholder: 'cilantro, loud bars' }
      ],
      onSubmit: v => {
        const id = f?.id || newId('friends', v.nickname || v.name.split(' ')[0]);
        const obj = clean({ id, name: v.name, nickname: v.nickname, closeness: v.closeness, photo: v.photo, birthday: v.birthday, met: v.met, likes: v.likes, dislikes: v.dislikes, details: f?.details });
        save('friends', { ...Object.fromEntries(Object.entries(f || {}).filter(([k]) => !(k in v))), ...obj });
        if (!f) location.hash = `#history/${id}`;
      },
      onDelete: f && (() => { drop('friends', f.id); location.hash = '#friends'; })
    });
  }
  function momentForm(m, preset = {}) {
    openForm({
      title: m ? 'Edit moment' : 'Log a moment',
      values: m || { date: todayISO(), from: 'them', type: 'invite', size: 'medium', friends: [], ...preset },
      fields: [
        { name: 'from', label: 'Who did it?', type: 'radio', options: [['them', 'They did it (for me)'], ['me', 'I did it (for them)']] },
        { name: 'type', label: 'What kind?', type: 'radio', options: Object.entries(TYPES).map(([k, t]) => [k, `${t.icon} ${t.label}`]) },
        { name: 'size', label: 'How big?', type: 'radio', options: [['small', 'Small (coffee, a text)'], ['medium', 'Medium (dinner)'], ['big', 'Big (trip, party)']] },
        { name: 'title', label: 'What happened', required: true, placeholder: 'Birthday dinner at the ramen place' },
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'friends', label: 'Who', type: 'friends', required: true },
        { name: 'outcome', label: 'Answer', type: 'select', options: [['', '–'], ['yes', 'Said yes'], ['no', 'Said no / turned it down'], ['pending', 'No answer yet']] },
        { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Anything worth remembering' }
      ],
      onRender: form => {
        const sync = () => { form.querySelector('[data-field=outcome]').hidden = form.type.value !== 'invite'; };
        form.querySelectorAll('[name=type]').forEach(r => r.addEventListener('change', sync));
        sync();
      },
      onSubmit: v => {
        save('moments', clean({ id: m?.id || newId('moments', `${v.date}-${v.title}`), date: v.date, type: v.type, from: v.from, friends: v.friends, title: v.title, size: v.size, outcome: v.type === 'invite' ? v.outcome : '', notes: v.notes }));
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

  // ---------- serialization ----------
  function serialize(k) {
    const header = `// Friendo data — ${k}. See CLAUDE.md at the repo root for the format.\nwindow.FC_DATA = window.FC_DATA || {};\nwindow.FC_DATA.${k} = `;
    if (k !== 'journal') return header + JSON.stringify(db[k], null, 2) + ';\n';
    const tpl = s => '`' + String(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
    const items = db.journal.map(({ body, ...rest }) => `${JSON.stringify(rest, null, 2).slice(0, -2)},\n  "body": ${tpl(body || '')}\n}`);
    return `${header}[\n${items.join(',\n')}\n];\n`;
  }
  // Runs a data file's source and returns what it assigned to window.FC_DATA.
  function evalData(text) {
    const prev = window.FC_DATA;
    window.FC_DATA = {};
    try { new Function(text)(); return window.FC_DATA; } finally { window.FC_DATA = prev; }
  }

  // ---------- GitHub saving ----------
  const b64encode = str => {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64decode = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
  async function gh(path, opts = {}, conf = ghConf()) {
    const r = await fetch(`https://api.github.com/repos/${conf.owner}/${conf.repo}${path ? '/' + path : ''}`, {
      ...opts,
      headers: { Authorization: `Bearer ${conf.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }
    });
    if (!r.ok) {
      const msg = (await r.json().catch(() => ({}))).message || r.statusText;
      throw new Error(r.status === 401 ? 'GitHub rejected the token (401). Check it hasn\'t expired.' : r.status === 404 ? 'GitHub couldn\'t find that repo or file (404). Check the token has access to this repo.' : `GitHub ${r.status}: ${msg}`);
    }
    return r.json();
  }
  async function ghGetFile(rel, conf = ghConf()) {
    const j = await gh(`contents/${conf.dir}/${rel}?ref=${encodeURIComponent(conf.branch)}`, {}, conf);
    return { sha: j.sha, text: b64decode(j.content) };
  }
  const ghPutFile = (rel, contentB64, sha, message, conf = ghConf()) =>
    gh(`contents/${conf.dir}/${rel}`, { method: 'PUT', body: JSON.stringify({ message, content: contentB64, branch: conf.branch, ...(sha ? { sha } : {}) }) }, conf);

  // When connected, read the data straight from GitHub so edits show up
  // immediately, without waiting for the public site to redeploy.
  async function loadFromGitHub() {
    const conf = ghConf();
    if (!conf.token || !conf.branch) return;
    try {
      const files = await Promise.all([...KINDS, 'priorities'].map(k => ghGetFile(`data/${k}.js`, conf).then(r => evalData(r.text)).catch(e => (k === 'priorities' ? {} : Promise.reject(e)))));
      files.forEach(d => Object.assign(SRC, d));
      rebuild(); render();
    } catch (e) { toast(`Showing the published copy. ${e.message}`, true); }
  }

  let saving = false;
  async function saveToGitHub() {
    if (saving) return;
    const conf = ghConf();
    saving = true;
    pendingBtn.disabled = true;
    pendingBtn.textContent = 'Saving…';
    try {
      // Upload new photos first so the friend records point at real files.
      const fo = ov('friends');
      for (const f of Object.values(fo.upserts)) {
        if (f.photo?.startsWith('data:')) {
          const path = `photos/${f.id}-${Date.now().toString(36)}.jpg`;
          await ghPutFile(path, f.photo.split(',')[1], null, `Friendo: photo for ${f.name}`, conf);
          f.photo = path;
          persist();
        }
      }
      for (const k of KINDS) {
        if (!changesIn(k)) continue;
        // Re-read the latest file and re-apply local edits on top, so changes
        // Claude made in the meantime aren't overwritten.
        const remote = await ghGetFile(`data/${k}.js`, conf);
        SRC[k] = evalData(remote.text)[k] || [];
        rebuild();
        const n = changesIn(k);
        await ghPutFile(`data/${k}.js`, b64encode(serialize(k)), remote.sha, `Friendo: ${plural(n, 'change')} to ${k} from the site`, conf);
        SRC[k] = db[k].map(x => ({ ...x }));
        overlay[k] = { upserts: {}, deleted: [] };
        persist();
      }
      rebuild();
      toast('Saved to GitHub. The public site updates in about a minute.');
    } catch (e) {
      toast(`Couldn't save: ${e.message}`, true);
    } finally {
      saving = false;
      pendingBtn.disabled = false;
      render();
    }
  }

  function openSettings() {
    const conf = ghConf();
    modalBody.innerHTML = `<form class="form" id="gh-form" novalidate><h2>Saving &amp; settings</h2>
      <p>Changes you make on the site are kept in this browser until you save them. Connect GitHub once on each device (laptop, phone) and the <b>Save</b> button writes them straight to your repo, so they show up everywhere.</p>
      <details class="howto"><summary>How to get a token (2 minutes)</summary><ol>
        <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → New fine-grained token</a>.</li>
        <li>Name it “Friendo”, pick an expiration, and under <b>Repository access</b> choose <b>Only select repositories</b> → <code>${esc(conf.owner)}/${esc(conf.repo)}</code>.</li>
        <li>Under <b>Permissions → Repository permissions</b>, set <b>Contents</b> to <b>Read and write</b>.</li>
        <li>Generate, copy, and paste it below. It's stored only in this browser.</li></ol></details>
      <div class="field"><label for="gh-token">GitHub token</label><input id="gh-token" name="token" type="password" autocomplete="off" placeholder="github_pat_…" value="${esc(conf.token)}"></div>
      <div class="field-row">
        <div class="field"><label for="gh-owner">Owner</label><input id="gh-owner" name="owner" value="${esc(conf.owner)}"></div>
        <div class="field"><label for="gh-repo">Repository</label><input id="gh-repo" name="repo" value="${esc(conf.repo)}"></div>
        <div class="field"><label for="gh-branch">Branch <span class="hint">blank = default</span></label><input id="gh-branch" name="branch" value="${esc(conf.branch)}"></div>
      </div>
      <p class="form-error" hidden></p>
      <div class="form-actions">${conf.token ? '<button type="button" class="btn ghost danger" data-disconnect>Disconnect</button>' : ''}<span class="spacer"></span>
        <button type="submit" class="btn primary">${conf.token ? 'Update' : 'Connect'}</button></div>
      <hr>
      <h3>Without GitHub</h3>
      <p class="small">Download the data files and give them to Claude to commit, or discard what's changed in this browser.</p>
      <div class="export">${KINDS.map(k => `<div class="export-row"><code>data/${k}.js</code><span class="muted small">${plural(changesIn(k), 'change')}</span><span class="spacer"></span>
        <button type="button" class="btn sm" data-copy="${k}">Copy</button><button type="button" class="btn sm" data-dl="${k}">Download</button></div>`).join('')}</div>
      <div class="form-actions"><button type="button" class="btn ghost danger" data-discard ${pendingCount() ? '' : 'disabled'}>Discard local changes</button><span class="spacer"></span><button type="button" class="btn" data-close>Close</button></div>
    </form>`;
    const form = modalBody.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const next = { ...GH_DEFAULT, owner: form.owner.value.trim(), repo: form.repo.value.trim(), branch: form.branch.value.trim(), token: form.token.value.trim() };
      const err = form.querySelector('.form-error');
      if (!next.token) { err.textContent = 'Paste a token first.'; err.hidden = false; return; }
      try {
        const repo = await gh('', {}, next);
        if (!next.branch) next.branch = repo.default_branch;
        if (!repo.permissions?.push) throw new Error('This token can read the repo but not write to it. Give it Contents: Read and write.');
        await ghGetFile('data/friends.js', next);
        writeJSON(GH_KEY, next);
        modal.close();
        toast(`Connected to ${next.owner}/${next.repo} (${next.branch}).`);
        await loadFromGitHub();
        render();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
    form.querySelector('[data-disconnect]')?.addEventListener('click', () => { writeJSON(GH_KEY, null); modal.close(); toast('Disconnected from GitHub.'); render(); });
    form.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([serialize(b.dataset.dl)], { type: 'text/javascript' }));
      Object.assign(document.createElement('a'), { href: url, download: `${b.dataset.dl}.js` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
    form.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(serialize(b.dataset.copy)); b.textContent = 'Copied!'; } catch { b.textContent = 'Copy failed'; }
      setTimeout(() => { b.textContent = 'Copy'; }, 1500);
    }));
    form.querySelector('[data-discard]').addEventListener('click', () => {
      if (!confirm('Throw away every change made in this browser? Your saved data stays as it is.')) return;
      overlay = {}; persist(); rebuild(); modal.close(); render();
    });
    modal.showModal();
  }

  // ---------- tooltip ----------
  function hideTip() { tip.hidden = true; }
  document.addEventListener('pointerover', e => {
    const t = e.target.closest('[data-tip]');
    if (!t || e.pointerType === 'touch') return;
    tip.textContent = t.dataset.tip;
    tip.hidden = false;
  });
  document.addEventListener('pointermove', e => {
    if (tip.hidden) return;
    const pad = 14, r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(e.clientX + pad, innerWidth - r.width - 8)}px`;
    tip.style.top = `${e.clientY + pad + r.height > innerHeight ? e.clientY - r.height - pad : e.clientY + pad}px`;
  });
  document.addEventListener('pointerout', e => { if (e.target.closest('[data-tip]') && !e.relatedTarget?.closest?.('[data-tip]')) hideTip(); });

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
      case 'settings': return openSettings();
      case 'save': return ghConf().token ? saveToGitHub() : openSettings();
      case 'friend-sort': state.friendSort = v; return render();
      case 'friend-close': state.friendClose = v; return render();
      case 'detail-sort': state.detailSort = v; return render();
      case 'hist-scope': state.histScope = v; return render();
      case 'invite-dir': state.inviteDir = v; return render();
      case 'invite-outcome': state.inviteOutcome = v; return render();
      case 'year-type': state.yearType = v; return render();
      case 'cal-mode': location.hash = v === 'year' ? `#calendar/year-${new Date().getFullYear()}` : '#calendar'; return;
      case 'set-close': { const f = friend(id); if (f.closeness !== v) save('friends', { ...f, closeness: v }); return; }
      case 'journal-tag':
        state.journalTag = v;
        renderJournalList();
        view.querySelectorAll('[data-act=journal-tag]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
        return;
      case 'shuffle': seed++; return render();
      case 'pref-remove': {
        const f = friend(id), key = el.dataset.key;
        return save('friends', { ...f, [key]: (f[key] || []).filter((_, i) => i !== +el.dataset.i) });
      }
      case 'detail-remove': {
        const f = friend(id);
        if (!confirm('Remove this detail?')) return;
        return save('friends', { ...f, details: (f.details || []).filter(d => d.id !== el.dataset.d) });
      }
      case 'log-idea': {
        const s = lastIdeas[+el.dataset.i], type = KIND_META[s.kind].log;
        return momentForm(null, { from: 'me', type, size: 'medium', friends: [s.f.id], title: s.idea || s.title, outcome: type === 'invite' ? 'pending' : '' });
      }
    }
  });
  document.addEventListener('submit', e => {
    const form = e.target.closest('.inline-add');
    if (!form) return;
    e.preventDefault();
    const val = form.v.value.trim(), f = friend(form.dataset.id), key = form.dataset.add;
    if (!val || !f) return;
    if (key === 'details') {
      const d = { id: `d-${f.id}-${Date.now().toString(36)}`, date: todayISO(), text: val };
      save('friends', { ...f, details: [...(f.details || []), d] });
    } else {
      save('friends', { ...f, [key]: [...(f[key] || []), ...val.split(',').map(s => s.trim()).filter(Boolean)] });
    }
    view.querySelector(`.inline-add[data-add="${key}"] input`)?.focus();
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
  // Photos that were just committed may not be on the public site yet.
  document.addEventListener('error', e => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.dataset.fallback && img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
  }, true);
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  window.addEventListener('hashchange', () => { if (modal.open) modal.close(); render(); window.scrollTo(0, 0); });
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderTreemap, 120); });

  rebuild();
  render();
  loadFromGitHub();
})();
