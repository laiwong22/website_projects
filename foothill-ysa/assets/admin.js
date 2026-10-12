// FYSAA admin console: send texts, inbox, subscribers, groups, calendar, admins, share.
(() => {
  const F = window.FYSA, { esc } = F;
  const view = document.getElementById("view");
  const SITE = new URL("../", location.href).href; // public site address
  const S = { me: null, groups: [], messages: [], stats: {}, events: [], subscribers: [], memberships: [], inbox: [], profiles: [],
    draft: null, thread: null, filter: { q: "", status: "all", group: "all" } };

  // ---------------------------------------------------------------- data layer (Supabase, or in-memory demo)
  const api = F.configured ? {
    async all(table) {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await F.sb.from(table).select("*").range(from, from + 999);
        if (error) throw error;
        out.push(...data);
        if (data.length < 1000) return out;
      }
    },
    async insert(table, row) { const { data, error } = await F.sb.from(table).insert(row).select().single(); if (error) throw error; return data; },
    async update(table, match, patch) { let q = F.sb.from(table).update(patch); for (const [k, v] of Object.entries(match)) q = q.eq(k, v); const { error } = await q; if (error) throw error; },
    async remove(table, match) { let q = F.sb.from(table).delete(); for (const [k, v] of Object.entries(match)) q = q.eq(k, v); const { error } = await q; if (error) throw error; },
    fn: (name, body) => F.callFn(name, body),
  } : demoApi();

  function demoApi() {
    const db = F.demoData(); db.message_stats = [];
    const match = (row, m) => Object.entries(m).every(([k, v]) => row[k] === v);
    return {
      async all(t) { return structuredClone(db[t] || []); },
      async insert(t, row) { const r = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row }; db[t].push(r); return structuredClone(r); },
      async update(t, m, patch) { db[t].filter((r) => match(r, m)).forEach((r) => Object.assign(r, patch)); },
      async remove(t, m) { db[t] = db[t].filter((r) => !match(r, m)); },
      async fn(name, body) {
        if (name === "dispatch") {
          const msg = db.messages.find((m) => m.id === body.message_id);
          const n = recipients(msg.group_ids, db.subscribers, db.memberships).length;
          Object.assign(msg, { status: "sent", sent_at: new Date().toISOString(), recipient_count: n });
          return { processed: [{ id: msg.id, sent: n, failed: 0 }] };
        }
        if (name === "reply") { db.inbox_messages.push({ id: crypto.randomUUID(), phone: body.phone, direction: "out", body: body.body, is_read: true, created_at: new Date().toISOString() }); return { ok: true }; }
      },
    };
  }

  async function loadAll() {
    const [groups, messages, stats, events, subscribers, memberships, inbox, profiles] = await Promise.all(
      ["groups", "messages", "message_stats", "events", "subscribers", "memberships", "inbox_messages", "profiles"].map((t) => api.all(t)));
    Object.assign(S, { groups: groups.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)), messages, events, subscribers, memberships, inbox, profiles });
    S.stats = Object.fromEntries(stats.map((s) => [s.message_id, s]));
  }

  // ---------------------------------------------------------------- derived data
  function recipients(groupIds, subs = S.subscribers, mems = S.memberships) {
    const active = new Set(subs.filter((s) => s.status === "active").map((s) => s.id));
    return [...new Set(mems.filter((m) => m.status === "active" && groupIds.includes(m.group_id) && active.has(m.subscriber_id)).map((m) => m.subscriber_id))];
  }
  const group = (id) => S.groups.find((g) => g.id === id);
  const subByPhone = (p) => S.subscribers.find((s) => s.phone === p);
  const groupChips = (ids) => ids.map(group).filter(Boolean).map((g) => `<span class="chip">${esc(g.name)}</span>`).join(" ");
  const unreadThreads = () => new Set(S.inbox.filter((m) => m.direction === "in" && !m.is_read).map((m) => m.phone)).size;
  const unsubLinkSample = `\n\nUnsubscribe: ${SITE}u.html?t=${"x".repeat(18)}`;

  async function run(fn, okMsg) {
    try { const r = await fn(); if (okMsg) F.toast(okMsg); return r ?? true; }
    catch (e) { console.error(e); F.toast(e.message || String(e), true); return false; }
  }
  async function refresh() { await run(loadAll); route(); }

  // ---------------------------------------------------------------- auth
  async function start() {
    if (!F.configured) {
      document.getElementById("demo").hidden = false;
      S.me = { id: "u1", email: "you@example.com", role: "owner" };
      return boot();
    }
    if (!F.sb) { view.innerHTML = `<div class="card empty">Couldn't load the login library. Check your connection and refresh.</div>`; return; }
    let current = null;
    F.sb.auth.onAuthStateChange((_evt, session) => {
      const id = session?.user?.id ?? null;
      if (id === current) return;
      current = id;
      setTimeout(() => (session ? signedIn(session.user) : renderLogin()), 0);
    });
  }

  async function signedIn(user) {
    const { data: me, error } = await F.sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) { view.innerHTML = `<div class="card empty">${esc(error.message)}</div>`; return; }
    S.me = me ?? { id: user.id, email: user.email, role: "member" };
    const who = document.getElementById("who");
    who.hidden = false;
    who.innerHTML = `<span class="muted">${esc(S.me.email)}</span><button class="btn small" id="signout">Sign out</button>`;
    document.getElementById("signout").onclick = () => F.sb.auth.signOut();
    if (S.me.role === "member") {
      view.innerHTML = `<div class="card login stack"><img src="../assets/logo.svg" alt=""><h1>You're signed in</h1>
        <p class="muted">You don't have admin access yet. Ask an FYSAA admin to make you an admin on the <b>Admins</b> tab, then refresh this page.</p>
        <p><a class="btn" href="../">Go to the public site</a></p></div>`;
      return;
    }
    boot();
  }

  function renderLogin() {
    document.getElementById("tabs").hidden = true;
    document.getElementById("who").hidden = true;
    view.innerHTML = `<div class="card login stack"><img src="../assets/logo.svg" alt="">
      <h1>FYSAA Admin</h1><p class="muted">Sign in with your email. We'll send you a login link, no password needed.</p>
      <form id="login" class="stack"><input type="email" name="email" required placeholder="you@example.com" autocomplete="email"><button class="btn primary">Email me a login link</button></form>
      <p class="small muted">Just want the news? <a href="../">Go to the public site</a>.</p></div>`;
    document.getElementById("login").onsubmit = async (ev) => {
      ev.preventDefault();
      const email = ev.target.email.value.trim();
      const { error } = await F.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
      view.querySelector(".login").innerHTML = error
        ? `<h1>Hmm.</h1><p class="muted">${esc(error.message)}</p><button class="btn" onclick="location.reload()">Try again</button>`
        : `<img src="../assets/logo.svg" alt=""><h1>Check your email</h1><p class="muted">We sent a login link to <b>${esc(email)}</b>. Open it on this device.</p>`;
    };
  }

  async function boot() {
    document.getElementById("tabs").hidden = false;
    view.innerHTML = `<p class="muted">Loading…</p>`;
    if (await run(loadAll)) route();
  }

  // ---------------------------------------------------------------- routing
  const TABS = { send: renderSend, inbox: renderInbox, subscribers: renderSubscribers, groups: renderGroups, events: renderEvents, team: renderTeam, share: renderShare };
  function route() {
    if (!S.me || S.me.role === "member") return;
    let t = location.hash.slice(1).split("/")[0];
    if (!TABS[t]) t = "send";
    document.querySelectorAll("#tabs a").forEach((a) => {
      a.classList.toggle("on", a.dataset.tab === t);
      if (a.dataset.tab === "inbox") { const n = unreadThreads(); a.innerHTML = `Inbox${n ? ` <span class="badge">${n}</span>` : ""}`; }
    });
    TABS[t]();
  }
  window.addEventListener("hashchange", route);

  // ================================================================ SEND
  function newDraft(from = {}) {
    const main = S.groups.find((g) => g.is_default);
    return { id: null, title: "", body: "", group_ids: main ? [main.id] : [], is_public: true, include_unsub_link: false, when: "now", scheduled_at: "", ...from };
  }
  const toLocalInput = (iso) => { const t = new Date(iso); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 16); };

  function renderSend() {
    S.draft ??= newDraft();
    const d = S.draft;
    const queued = S.messages.filter((m) => ["draft", "scheduled", "sending", "failed"].includes(m.status))
      .sort((a, b) => new Date(a.scheduled_at || a.created_at) - new Date(b.scheduled_at || b.created_at));
    const sent = S.messages.filter((m) => m.status === "sent").sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
    const statusChip = { draft: "gray", scheduled: "", sending: "warn", failed: "bad" };

    view.innerHTML = `
      <div class="grid2">
        <section class="card">
          <h2 style="margin-bottom:12px">${d.id ? "Edit message" : "New message"}</h2>
          <form id="compose" class="stack">
            <label class="field"><span>Headline for the website <span class="muted">(optional, not texted)</span></span><input type="text" name="title" maxlength="120" value="${esc(d.title)}" placeholder="Ward Halloween party"></label>
            <label class="field"><span>Text message</span><textarea name="body" maxlength="1600" required placeholder="FYSA: Ward Halloween party this Fri 7pm in the cultural hall…">${esc(d.body)}</textarea>
              <div class="counter" id="counter"></div></label>
            <fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:600;font-size:13px;margin-bottom:6px">Send to</legend>
              <div class="stack">${S.groups.filter((g) => g.is_active).map((g) => `<label class="check"><input type="checkbox" name="groups" value="${g.id}" ${d.group_ids.includes(g.id) ? "checked" : ""}>
                <div><b>${esc(g.name)}</b><span class="small muted">${recipients([g.id]).length} active subscribers</span></div></label>`).join("")}</div></fieldset>
            <div class="stack">
              <label class="inline-check"><input type="checkbox" name="is_public" ${d.is_public ? "checked" : ""}> Also post on the website's Announcements page</label>
              <label class="inline-check"><input type="checkbox" name="include_unsub_link" ${d.include_unsub_link ? "checked" : ""}> Add each person's unsubscribe link <span class="muted small">(usually +1 text per person)</span></label>
            </div>
            <div class="row">
              <label class="inline-check"><input type="radio" name="when" value="now" ${d.when === "now" ? "checked" : ""}> Send now</label>
              <label class="inline-check"><input type="radio" name="when" value="later" ${d.when === "later" ? "checked" : ""}> Schedule</label>
              <input type="datetime-local" name="scheduled_at" value="${esc(d.scheduled_at)}" style="width:auto" ${d.when === "later" ? "" : "hidden"}>
            </div>
            <div class="row">
              <button class="btn primary" type="submit" id="go">Send</button>
              <button class="btn" type="button" data-act="save-draft">Save draft</button>
              ${d.id || d.body ? `<button class="btn" type="button" data-act="clear">Start over</button>` : ""}
            </div>
          </form>
        </section>
        <aside class="stack">
          <section class="card">
            <h2 style="margin-bottom:8px">Scheduled &amp; drafts</h2>
            ${queued.length ? queued.map((m) => `<div style="padding:10px 0;border-top:1px solid var(--line)">
              <div class="spread"><span class="chip ${statusChip[m.status]}">${m.status === "scheduled" ? esc(F.fmtDateTime(m.scheduled_at)) : m.status}</span>
                <span class="row">${m.status === "sending" ? "" : `<button class="btn small" data-act="edit-msg" data-id="${m.id}">Edit</button>`}
                ${m.status === "failed" ? `<button class="btn small" data-act="retry" data-id="${m.id}">Retry</button>` : ""}
                ${m.status === "sending" ? "" : `<button class="btn small danger" data-act="del-msg" data-id="${m.id}" aria-label="Delete">✕</button>`}</span></div>
              <p class="small" style="margin:6px 0 2px">${esc((m.title ? m.title + ": " : "") + m.body).slice(0, 120)}</p>
              <div>${groupChips(m.group_ids)}</div>${m.error ? `<p class="small" style="color:var(--bad)">${esc(m.error)}</p>` : ""}</div>`).join("") : `<p class="muted small">Nothing waiting.</p>`}
          </section>
          <section class="card small muted">
            <b style="color:var(--ink)">Tips</b>
            <p style="margin-top:4px">One text = 160 characters. Emoji and some symbols drop that to 70, so a short message with an emoji can cost twice as much.</p>
            <p>Links are fine. People can reply STOP to unsubscribe, and replies land in the Inbox.</p>
          </section>
        </aside>
      </div>
      <section class="card" style="margin-top:20px">
        <h2 style="margin-bottom:8px">Sent</h2>
        ${sent.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>When</th><th>Message</th><th>To</th><th>Delivered</th><th>Website</th><th></th></tr></thead><tbody>
          ${sent.map((m) => { const st = S.stats[m.id]; return `<tr>
            <td style="white-space:nowrap">${esc(F.fmtDateTime(m.sent_at))}</td>
            <td>${m.title ? `<b>${esc(m.title)}</b><br>` : ""}<span class="small">${esc(m.body.length > 160 ? m.body.slice(0, 160) + "…" : m.body)}</span></td>
            <td>${groupChips(m.group_ids)}</td>
            <td>${m.recipient_count ?? st?.sent ?? 0}${st?.failed ? ` <span class="chip bad">${st.failed} failed</span>` : ""}</td>
            <td><label class="inline-check small"><input type="checkbox" data-act="toggle-public" data-id="${m.id}" ${m.is_public ? "checked" : ""}> shown</label></td>
            <td><button class="btn small" data-act="copy-msg" data-id="${m.id}">Reuse</button></td></tr>`; }).join("")}
        </tbody></table></div>` : `<p class="muted">Nothing sent yet.</p>`}
      </section>`;

    const f = document.getElementById("compose");
    const readForm = () => Object.assign(S.draft, {
      title: f.elements.title.value.trim(), body: f.body.value, group_ids: [...f.querySelectorAll("[name=groups]:checked")].map((x) => x.value),
      is_public: f.is_public.checked, include_unsub_link: f.include_unsub_link.checked, when: f.when.value, scheduled_at: f.scheduled_at.value,
    });
    const update = () => {
      readForm();
      const info = F.smsInfo(d.body + (d.include_unsub_link ? unsubLinkSample : ""));
      const people = recipients(d.group_ids).length;
      const cost = people * info.segments * F.cfg.costPerText;
      document.getElementById("counter").innerHTML = `<span class="${info.segments > 1 ? "over" : ""}">${F.smsInfo(d.body).length} characters · ${info.segments} text${info.segments > 1 ? "s" : ""} per person${info.unicode ? " (emoji/symbols: 70-character texts)" : ""}</span>
        <span>${people} people · about ${F.money(cost)}</span>`;
      f.scheduled_at.hidden = d.when !== "later";
      document.getElementById("go").textContent = d.when === "later" ? "Schedule" : `Send to ${people}`;
    };
    f.addEventListener("input", update);
    update();
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      readForm();
      const body = F.plainText(d.body);
      if (!body) return F.toast("Write a message first.", true);
      if (!d.group_ids.length) return F.toast("Pick at least one group.", true);
      const people = recipients(d.group_ids).length;
      const row = { title: d.title || null, body, group_ids: d.group_ids, is_public: d.is_public, include_unsub_link: d.include_unsub_link, error: null };
      if (d.when === "later") {
        if (!d.scheduled_at || new Date(d.scheduled_at) <= new Date()) return F.toast("Pick a time in the future.", true);
        row.status = "scheduled"; row.scheduled_at = new Date(d.scheduled_at).toISOString();
        if (await run(() => saveMsg(row), `Scheduled for ${F.fmtDateTime(row.scheduled_at)}`)) { S.draft = null; await refresh(); }
        return;
      }
      const info = F.smsInfo(body + (d.include_unsub_link ? unsubLinkSample : ""));
      const ok = await F.confirmBox(`Send to ${people} people?`,
        `This texts everyone in ${esc(d.group_ids.map((id) => group(id)?.name).join(", "))} right now (${info.segments} text${info.segments > 1 ? "s" : ""} each, about ${F.money(people * info.segments * F.cfg.costPerText)}).<br><br><span style="white-space:pre-wrap;color:var(--ink)">${esc(body)}</span>`, "Send now");
      if (!ok) return;
      const btn = document.getElementById("go"); btn.disabled = true; btn.textContent = "Sending…";
      row.status = "scheduled"; row.scheduled_at = new Date().toISOString();
      const id = await run(() => saveMsg(row));
      if (id) {
        const r = await run(() => api.fn("dispatch", { message_id: id }));
        const res = r?.processed?.[0];
        if (res) F.toast(res.error ? `Problem: ${res.error}` : res.resumed_later ? "Big send: still going, it'll finish in a minute." : `Sent to ${res.sent} people${res.failed ? ` (${res.failed} failed)` : ""}.`, !!res.error);
        else if (r) F.toast("Queued. It'll go out within a minute.");
        S.draft = null;
      }
      await refresh();
    };
  }

  async function saveMsg(row) {
    if (S.draft.id) { await api.update("messages", { id: S.draft.id }, row); return S.draft.id; }
    const r = await api.insert("messages", { ...row, created_by: S.me.id });
    return r.id;
  }

  // ================================================================ INBOX
  function renderInbox() {
    const threads = new Map();
    for (const m of [...S.inbox].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
      const t = threads.get(m.phone) ?? { phone: m.phone, msgs: [], unread: false };
      t.msgs.push(m); if (m.direction === "in" && !m.is_read) t.unread = true;
      threads.set(m.phone, t);
    }
    const list = [...threads.values()].sort((a, b) => new Date(b.msgs.at(-1).created_at) - new Date(a.msgs.at(-1).created_at));
    const cur = threads.get(S.thread);
    const nameOf = (p) => subByPhone(p)?.name || F.fmtPhone(p);
    view.innerHTML = `
      <div class="section-head"><div><h1>Inbox</h1><p class="muted small" style="margin-top:4px">Texts people send to the ward number (besides JOIN, STOP and group keywords).</p></div></div>
      ${list.length ? `<div class="card inbox ${cur ? "open" : ""}">
        <div class="threads">${list.map((t) => `<button class="thread ${t.phone === S.thread ? "on" : ""}" data-act="thread" data-phone="${esc(t.phone)}">
          <div class="spread"><b>${esc(nameOf(t.phone))}</b><span class="small muted">${t.unread ? '<span class="badge">new</span> ' : ""}${esc(F.ago(t.msgs.at(-1).created_at))}</span></div>
          <p>${t.msgs.at(-1).direction === "out" ? "You: " : ""}${esc(t.msgs.at(-1).body)}</p></button>`).join("")}</div>
        <div class="convo">${cur ? `
          <div class="spread" style="padding:12px 16px;border-bottom:1px solid var(--line)"><div><button class="linkish small" data-act="thread" data-phone="" style="margin-right:8px">‹ Back</button><b>${esc(nameOf(cur.phone))}</b> <span class="muted small">${esc(F.fmtPhone(cur.phone))}</span></div>
            ${subByPhone(cur.phone) ? `<span class="chip ${subByPhone(cur.phone).status === "active" ? "green" : "gray"}">${esc(subByPhone(cur.phone).status)}</span>` : `<span class="chip gray">not subscribed</span>`}</div>
          <div class="msgs" id="msgs">${cur.msgs.map((m) => `<div class="bubble ${m.direction}">${F.linkify(m.body)}<small>${esc(F.fmtDateTime(m.created_at))}</small></div>`).join("")}</div>
          <form id="reply"><textarea name="body" required placeholder="Reply by text…" maxlength="640"></textarea><button class="btn primary">Send</button></form>`
          : `<div class="empty">Pick a conversation.</div>`}</div>
      </div>` : `<div class="card empty">No texts yet. When someone replies to an announcement, it shows up here.</div>`}`;
    const msgs = document.getElementById("msgs");
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    const form = document.getElementById("reply");
    if (form) form.onsubmit = async (ev) => {
      ev.preventDefault();
      const body = F.plainText(form.body.value);
      if (!body) return;
      form.querySelector("button").disabled = true;
      if (await run(() => api.fn("reply", { phone: cur.phone, body }), "Sent")) await refresh();
      else form.querySelector("button").disabled = false;
    };
    if (cur?.unread) {
      api.update("inbox_messages", { phone: cur.phone, direction: "in" }, { is_read: true })
        .then(() => { S.inbox.forEach((m) => { if (m.phone === cur.phone) m.is_read = true; }); route(); })
        .catch(console.error);
    }
  }

  // ================================================================ SUBSCRIBERS
  function renderSubscribers() {
    const fl = S.filter;
    const memsOf = (id) => S.memberships.filter((m) => m.subscriber_id === id);
    const count = (st) => S.subscribers.filter((s) => s.status === st).length;
    const q = fl.q.toLowerCase(), qd = fl.q.replace(/\D/g, "");
    const rows = S.subscribers.filter((s) =>
      (fl.status === "all" || s.status === fl.status) &&
      (fl.group === "all" || memsOf(s.id).some((m) => m.group_id === fl.group && m.status !== "left")) &&
      (!q || (s.name || "").toLowerCase().includes(q) || (qd && s.phone.includes(qd))))
      .sort((a, b) => (a.name || "~").localeCompare(b.name || "~"));
    const stChip = { active: "green", pending: "warn", unsubscribed: "gray" };

    view.innerHTML = `
      <div class="section-head"><h1>Subscribers</h1><button class="btn small" data-act="export">Download CSV</button></div>
      <div class="stats" style="margin-bottom:16px">
        <div class="card stat"><b>${count("active")}</b><span>Active</span></div>
        <div class="card stat"><b>${count("pending")}</b><span>Haven't replied JOIN yet</span></div>
        <div class="card stat"><b>${count("unsubscribed")}</b><span>Unsubscribed</span></div>
        ${S.groups.filter((g) => g.is_active).map((g) => `<div class="card stat"><b>${recipients([g.id]).length}</b><span>${esc(g.name)}</span></div>`).join("")}
      </div>
      <div class="card">
        <form class="row" id="filters" style="margin-bottom:10px">
          <input type="search" name="q" placeholder="Search name or number" value="${esc(fl.q)}" style="flex:2;min-width:180px">
          <select name="status" style="flex:1;min-width:130px">${["all", "active", "pending", "unsubscribed"].map((x) => `<option value="${x}" ${fl.status === x ? "selected" : ""}>${x === "all" ? "Any status" : x}</option>`).join("")}</select>
          <select name="group" style="flex:1;min-width:150px"><option value="all">Any group</option>${S.groups.map((g) => `<option value="${g.id}" ${fl.group === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>
        </form>
        <p class="small muted">${rows.length} shown. Click ✕ on a group to remove someone from it (they can't rejoin that group themselves until you restore them).</p>
        <div class="table-wrap"><table class="list"><thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Groups</th><th>Joined</th><th></th></tr></thead><tbody>
        ${rows.map((s) => `<tr>
          <td><b>${esc(s.name || "—")}</b>${s.source === "text" ? ` <span class="chip gray" title="Joined by texting">by text</span>` : ""}</td>
          <td style="white-space:nowrap">${esc(F.fmtPhone(s.phone))}</td>
          <td><span class="chip ${stChip[s.status]}">${s.status === "pending" ? "waiting for JOIN" : s.status}</span></td>
          <td>${memsOf(s.id).filter((m) => m.status !== "left").map((m) => { const g = group(m.group_id); if (!g) return "";
            return m.status === "removed"
              ? `<span class="chip bad" title="Removed by an admin">${esc(g.name)} (removed) <button data-act="restore" data-s="${s.id}" data-g="${g.id}" title="Restore" aria-label="Restore">↺</button></span>`
              : `<span class="chip">${esc(g.name)} <button data-act="kick" data-s="${s.id}" data-g="${g.id}" title="Remove from group" aria-label="Remove from ${esc(g.name)}">✕</button></span>`; }).join(" ")}</td>
          <td class="small muted" style="white-space:nowrap">${esc(F.fmtDate(s.created_at, { month: "short", day: "numeric", year: "numeric" }))}</td>
          <td style="white-space:nowrap"><button class="btn small" data-act="edit-sub" data-id="${s.id}">Edit</button></td></tr>`).join("") || `<tr><td colspan="6" class="empty">No one matches.</td></tr>`}
        </tbody></table></div>
      </div>`;
    const ff = document.getElementById("filters");
    ff.addEventListener("input", (e) => {
      Object.assign(S.filter, { q: ff.q.value, status: ff.status.value, group: ff.group.value });
      const typing = e.target.name === "q", pos = ff.q.selectionStart;
      renderSubscribers();
      if (typing) { const nq = document.querySelector("#filters [name=q]"); nq.focus(); nq.setSelectionRange(pos, pos); }
    });
    ff.onsubmit = (e) => e.preventDefault();
  }

  async function editSubscriber(id) {
    const s = S.subscribers.find((x) => x.id === id);
    const r = await F.modal(`<h2>${esc(s.name || F.fmtPhone(s.phone))}</h2>
      <p class="muted small" style="margin:4px 0 12px">${esc(F.fmtPhone(s.phone))} · ${esc(s.status)} · signed up ${esc(F.fmtDate(s.created_at, { month: "long", day: "numeric", year: "numeric" }))} by ${s.source === "text" ? "text" : "website"}</p>
      <label class="field"><span>Name</span><input type="text" name="name" value="${esc(s.name || "")}" maxlength="80"></label>
      <div class="dlg-actions" style="justify-content:space-between">
        <span class="row">${s.status !== "unsubscribed" ? `<button class="btn danger" value="unsub" formnovalidate>Unsubscribe</button>` : ""}<button class="btn danger" value="delete" formnovalidate>Delete number</button></span>
        <span class="row"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="save">Save</button></span></div>`);
    if (!r) return;
    if (r.value === "save") { if (await run(() => api.update("subscribers", { id }, { name: r.form.elements.name.value.trim() || null }), "Saved")) refresh(); }
    if (r.value === "unsub" && await F.confirmBox("Unsubscribe them?", `${esc(s.name || F.fmtPhone(s.phone))} will stop getting all texts. They can rejoin by texting JOIN.`, "Unsubscribe", true)) {
      if (await run(() => api.update("subscribers", { id }, { status: "unsubscribed", unsubscribed_at: new Date().toISOString() }), "Unsubscribed")) refresh();
    }
    if (r.value === "delete" && await F.confirmBox("Delete this number?", "This removes their number and history from the database. They can sign up again later.", "Delete", true)) {
      if (await run(() => api.remove("subscribers", { id }), "Deleted")) refresh();
    }
  }

  function exportCsv() {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["name", "phone", "status", "groups", "joined"].join(",")];
    for (const s of S.subscribers) {
      const gs = S.memberships.filter((m) => m.subscriber_id === s.id && m.status === "active").map((m) => group(m.group_id)?.name).filter(Boolean).join("; ");
      lines.push([s.name, s.phone, s.status, gs, s.created_at?.slice(0, 10)].map(q).join(","));
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `fysa-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  // ================================================================ GROUPS
  function renderGroups() {
    view.innerHTML = `
      <div class="section-head"><div><h1>Groups</h1><p class="muted small" style="margin-top:4px">Anyone can join a group on the website or by texting its keyword.</p></div><button class="btn primary" data-act="edit-group">+ New group</button></div>
      <div class="stats" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
        ${S.groups.map((g) => `<div class="card stack">
          <div class="spread"><h2>${esc(g.name)}</h2><button class="btn small" data-act="edit-group" data-id="${g.id}">Edit</button></div>
          <div class="row">${g.is_default ? '<span class="chip warn">Main list</span>' : ""}${g.keyword ? `<span class="chip">Text ${esc(g.keyword)}</span>` : ""}${g.is_active ? "" : '<span class="chip gray">Hidden</span>'}</div>
          <p class="small muted">${esc(g.description || "")}</p>
          <div class="spread small"><button class="linkish" data-act="group-members" data-id="${g.id}">${recipients([g.id]).length} active members</button>
          ${g.groupme_url ? `<a href="${esc(g.groupme_url)}" target="_blank" rel="noopener">GroupMe ↗</a>` : `<span class="muted">No GroupMe link</span>`}</div></div>`).join("")}
      </div>`;
  }

  async function editGroup(id) {
    const g = S.groups.find((x) => x.id === id) ?? { name: "", description: "", keyword: "", groupme_url: "", is_default: false, is_active: true, sort: 100 };
    const r = await F.modal(`<h2>${id ? "Edit group" : "New group"}</h2><div class="stack" style="margin-top:12px">
      <label class="field"><span>Name</span><input type="text" name="name" required maxlength="60" value="${esc(g.name)}" placeholder="Knitting Group"></label>
      <label class="field"><span>Description</span><input type="text" name="description" maxlength="200" value="${esc(g.description || "")}"></label>
      <label class="field"><span>Text keyword <span class="muted">(people text this word to join; letters/numbers, 2–15)</span></span><input type="text" name="keyword" maxlength="15" pattern="[A-Za-z0-9]{2,15}" value="${esc(g.keyword || "")}" placeholder="KNIT" style="text-transform:uppercase"></label>
      <label class="field"><span>GroupMe link <span class="muted">(optional)</span></span><input type="url" name="groupme_url" value="${esc(g.groupme_url || "")}" placeholder="https://groupme.com/join_group/…"></label>
      <label class="field"><span>Order on the page</span><input type="number" name="sort" value="${g.sort}"></label>
      <label class="inline-check"><input type="checkbox" name="is_default" ${g.is_default ? "checked" : ""}> Main ward list (pre-checked on the sign-up form, joined by texting JOIN)</label>
      <label class="inline-check"><input type="checkbox" name="is_active" ${g.is_active ? "checked" : ""}> Show on the website and allow joining</label>
      </div><div class="dlg-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="save">Save</button></div>`);
    if (!r) return;
    const f = r.form, kw = f.keyword.value.trim().toUpperCase();
    const reserved = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT", "START", "UNSTOP", "JOIN", "YES", "SUBSCRIBE", "HELP", "INFO", "NAME", "LEAVE"];
    if (reserved.includes(kw)) return F.toast(`${kw} is a reserved word. Pick another keyword.`, true);
    const row = { name: f.elements.name.value.trim(), description: f.description.value.trim() || null, keyword: kw || null, groupme_url: f.groupme_url.value.trim() || null,
      sort: +f.sort.value || 100, is_default: f.is_default.checked, is_active: f.is_active.checked };
    if (id) { if (await run(() => api.update("groups", { id }, row), "Saved")) refresh(); }
    else {
      let slug = row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "group";
      if (S.groups.some((x) => x.slug === slug)) slug += "-" + Date.now().toString(36).slice(-4);
      if (await run(() => api.insert("groups", { ...row, slug }), "Group created")) refresh();
    }
  }

  // ================================================================ CALENDAR
  function renderEvents() {
    const now = new Date();
    const up = S.events.filter((e) => new Date(e.ends_at || e.starts_at) >= now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const past = S.events.filter((e) => new Date(e.ends_at || e.starts_at) < now).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)).slice(0, 15);
    const item = (e) => `<div class="item" style="display:flex;gap:12px;padding:12px 0;border-top:1px solid var(--line)">
      <div class="datebox"><small>${esc(F.fmtDate(e.starts_at, { month: "short" }))}</small><b>${new Date(e.starts_at).getDate()}</b></div>
      <div style="flex:1"><b>${esc(e.title)}</b><div class="small muted">${esc(F.eventWhen(e))}${e.location ? ` · ${esc(e.location)}` : ""}</div></div>
      <div class="row" style="align-self:center"><button class="btn small" data-act="text-event" data-id="${e.id}" title="Write a text about this event">Text it</button><button class="btn small" data-act="edit-event" data-id="${e.id}">Edit</button></div></div>`;
    view.innerHTML = `
      <div class="section-head"><div><h1>Calendar</h1><p class="muted small" style="margin-top:4px">Events show on the website's calendar. Adding an event doesn't text anyone; use “Text it” if you want to.</p></div><button class="btn primary" data-act="edit-event">+ New event</button></div>
      <section class="card"><h2>Upcoming</h2>${up.map(item).join("") || `<p class="muted">Nothing scheduled.</p>`}</section>
      ${past.length ? `<section class="card" style="margin-top:20px"><h2>Recent</h2>${past.map(item).join("")}</section>` : ""}`;
  }

  async function editEvent(id) {
    const e = S.events.find((x) => x.id === id);
    const start = e ? new Date(e.starts_at) : null, end = e?.ends_at ? new Date(e.ends_at) : null;
    const ds = (t) => t ? toLocalInput(t.toISOString()).slice(0, 10) : "";
    const ts = (t) => t ? toLocalInput(t.toISOString()).slice(11, 16) : "";
    const r = await F.modal(`<h2>${e ? "Edit event" : "New event"}</h2><div class="stack" style="margin-top:12px">
      <label class="field"><span>Title</span><input type="text" name="title" required maxlength="120" value="${esc(e?.title || "")}"></label>
      <div class="row"><label class="field" style="flex:1"><span>Date</span><input type="date" name="date" required value="${ds(start)}"></label>
        <label class="field" style="flex:1"><span>Start</span><input type="time" name="start" value="${e && !e.all_day ? ts(start) : "19:00"}"></label>
        <label class="field" style="flex:1"><span>End</span><input type="time" name="end" value="${e && !e.all_day ? ts(end) : ""}"></label></div>
      <label class="inline-check"><input type="checkbox" name="all_day" ${e?.all_day ? "checked" : ""}> All day</label>
      <label class="field"><span>Location</span><input type="text" name="location" maxlength="160" value="${esc(e?.location || "")}"></label>
      <label class="field"><span>Details</span><textarea name="description" maxlength="2000">${esc(e?.description || "")}</textarea></label>
      </div><div class="dlg-actions" style="justify-content:space-between"><span>${e ? `<button class="btn danger" value="delete" formnovalidate>Delete</button>` : ""}</span>
      <span class="row"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="save">Save</button></span></div>`);
    if (!r) return;
    if (r.value === "delete") {
      if (await F.confirmBox("Delete event?", esc(e.title), "Delete", true) && await run(() => api.remove("events", { id }), "Deleted")) refresh();
      return;
    }
    const f = r.form, allDay = f.all_day.checked;
    const startAt = new Date(`${f.date.value}T${allDay ? "00:00" : f.start.value || "00:00"}`);
    let endAt = !allDay && f.end.value ? new Date(`${f.date.value}T${f.end.value}`) : null;
    if (endAt && endAt <= startAt) endAt.setDate(endAt.getDate() + 1); // ends after midnight
    const row = { title: f.elements.title.value.trim(), location: f.location.value.trim() || null, description: f.description.value.trim() || null,
      all_day: allDay, starts_at: startAt.toISOString(), ends_at: endAt ? endAt.toISOString() : null };
    if (id) { if (await run(() => api.update("events", { id }, row), "Saved")) refresh(); }
    else if (await run(() => api.insert("events", { ...row, created_by: S.me.id }), "Event added")) refresh();
  }

  // ================================================================ ADMINS
  function renderTeam() {
    const roleChip = { owner: "warn", admin: "", member: "gray" };
    view.innerHTML = `
      <div class="section-head"><div><h1>Admins</h1><p class="muted small" style="margin-top:4px">To add someone: send them <b>${esc(location.origin + location.pathname)}</b>. After they sign in with their email they show up here as a member. Switch them to Admin.</p></div></div>
      <div class="card table-wrap"><table class="list"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Since</th></tr></thead><tbody>
        ${S.profiles.sort((a, b) => ["owner", "admin", "member"].indexOf(a.role) - ["owner", "admin", "member"].indexOf(b.role)).map((p) => `<tr>
          <td><b>${esc(p.name || "—")}</b>${p.id === S.me.id ? ' <span class="chip gray">you</span>' : ""}</td><td>${esc(p.email || "")}</td>
          <td>${p.role === "owner" || p.id === S.me.id ? `<span class="chip ${roleChip[p.role]}">${p.role}</span>`
            : `<select data-act="role" data-id="${p.id}" style="width:auto">${["member", "admin"].map((r) => `<option ${p.role === r ? "selected" : ""}>${r}</option>`).join("")}</select>`}</td>
          <td class="small muted">${esc(F.fmtDate(p.created_at, { month: "short", day: "numeric", year: "numeric" }))}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="small muted" style="margin-top:12px">Admins can send texts, see phone numbers, and add or remove other admins. Members can sign in but can't see anything private.</p>`;
  }

  // ================================================================ SHARE
  function renderShare() {
    const num = F.cfg.textNumber ? F.fmtPhone(F.cfg.textNumber) : "(your Twilio number)";
    let qrSvg = `<p class="muted small">QR code library didn't load.</p>`;
    if (window.qrcode) { const qr = window.qrcode(0, "M"); qr.addData(SITE); qr.make(); qrSvg = qr.createSvgTag({ cellSize: 7, margin: 2, scalable: true }); }
    view.innerHTML = `
      <div class="section-head no-print"><div><h1>Share</h1><p class="muted small" style="margin-top:4px">Print the poster for the chapel or the foyer, or put the QR code on a slide.</p></div><button class="btn primary" onclick="print()">Print poster</button></div>
      <div class="grid2">
        <section class="card" style="text-align:center;padding:36px 20px">
          <img src="../assets/logo.svg" alt="" style="width:110px;height:110px;border-radius:24px">
          <h1 style="margin:14px 0 4px;font-size:34px">Get Foothill YSA texts</h1>
          <p class="muted" style="font-size:17px">Ward news, activities &amp; reminders</p>
          <div class="qr" style="width:260px;margin:18px auto">${qrSvg}</div>
          <p style="font-size:18px">Scan to sign up, or text <b>JOIN</b> to <b>${esc(num)}</b></p>
          <p class="muted small">${esc(SITE.replace(/^https?:\/\//, ""))}</p>
        </section>
        <aside class="stack no-print">
          <section class="card stack"><h2>Links</h2>
            <label class="field"><span>Public site (for everyone)</span><div class="row"><input type="text" readonly value="${esc(SITE)}" style="flex:1"><button class="btn small" data-act="copy" data-text="${esc(SITE)}">Copy</button></div></label>
            <label class="field"><span>Admin site (leaders only)</span><div class="row"><input type="text" readonly value="${esc(location.origin + location.pathname)}" style="flex:1"><button class="btn small" data-act="copy" data-text="${esc(location.origin + location.pathname)}">Copy</button></div></label>
          </section>
          <section class="card"><h2>Text keywords</h2><table class="list" style="margin-top:6px"><tbody>
            <tr><td><b>JOIN</b></td><td>Main ward list</td></tr>
            ${S.groups.filter((g) => g.keyword && !g.is_default && g.is_active).map((g) => `<tr><td><b>${esc(g.keyword)}</b></td><td>${esc(g.name)}</td></tr>`).join("")}
            <tr><td><b>LEAVE RUN</b></td><td>Leave one group</td></tr><tr><td><b>STOP</b></td><td>Stop everything</td></tr></tbody></table></section>
        </aside>
      </div>`;
  }

  // ---------------------------------------------------------------- clicks
  view.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el || el.tagName === "SELECT" || el.type === "checkbox") return;
    const { act, id } = el.dataset;
    const msg = S.messages.find((m) => m.id === id);
    switch (act) {
      case "clear": S.draft = newDraft(); return renderSend();
      case "save-draft": {
        const f = document.getElementById("compose");
        f.dispatchEvent(new Event("input"));
        if (!S.draft.body.trim()) return F.toast("Write something first.", true);
        const d = S.draft;
        if (await run(() => saveMsg({ title: d.title || null, body: d.body, group_ids: d.group_ids, is_public: d.is_public, include_unsub_link: d.include_unsub_link, status: "draft", scheduled_at: null }), "Draft saved")) { S.draft = null; refresh(); }
        return;
      }
      case "edit-msg":
        S.draft = newDraft({ id: msg.id, title: msg.title || "", body: msg.body, group_ids: [...msg.group_ids], is_public: msg.is_public, include_unsub_link: msg.include_unsub_link,
          when: msg.status === "scheduled" ? "later" : "now", scheduled_at: msg.scheduled_at ? toLocalInput(msg.scheduled_at) : "" });
        renderSend(); return window.scrollTo(0, 0);
      case "copy-msg":
        S.draft = newDraft({ title: msg.title || "", body: msg.body, group_ids: [...msg.group_ids] });
        renderSend(); return window.scrollTo(0, 0);
      case "del-msg":
        if (await F.confirmBox(msg.status === "scheduled" ? "Cancel this scheduled text?" : "Delete this draft?", esc(msg.body.slice(0, 140)), "Delete", true)
          && await run(() => api.remove("messages", { id }), "Deleted")) { if (S.draft?.id === id) S.draft = null; refresh(); }
        return;
      case "retry":
        if (await run(() => api.update("messages", { id }, { status: "scheduled", scheduled_at: new Date().toISOString(), error: null }))) {
          await run(() => api.fn("dispatch", { message_id: id }), "Retrying…"); refresh();
        }
        return;
      case "thread": S.thread = el.dataset.phone || null; return renderInbox();
      case "export": return exportCsv();
      case "edit-sub": return editSubscriber(id);
      case "kick": {
        const s = S.subscribers.find((x) => x.id === el.dataset.s), g = group(el.dataset.g);
        if (await F.confirmBox(`Remove from ${esc(g.name)}?`, `${esc(s.name || F.fmtPhone(s.phone))} will stop getting ${esc(g.name)} texts and can't rejoin it themselves. (Remove them from the GroupMe chat separately.)`, "Remove", true)
          && await run(() => api.update("memberships", { subscriber_id: s.id, group_id: g.id }, { status: "removed", updated_at: new Date().toISOString() }), "Removed")) refresh();
        return;
      }
      case "restore":
        if (await run(() => api.update("memberships", { subscriber_id: el.dataset.s, group_id: el.dataset.g }, { status: "active", updated_at: new Date().toISOString() }), "Restored")) refresh();
        return;
      case "edit-group": return editGroup(id);
      case "group-members": S.filter = { q: "", status: "active", group: id }; location.hash = "subscribers"; return;
      case "edit-event": return editEvent(id);
      case "text-event": {
        const e = S.events.find((x) => x.id === id);
        S.draft = newDraft({ title: e.title, body: `FYSA: ${e.title}, ${F.eventWhen(e).replace(" · ", ", ")}${e.location ? ` at ${e.location}` : ""}.${e.description ? " " + e.description : ""}` });
        location.hash = "send"; return;
      }
      case "copy": navigator.clipboard?.writeText(el.dataset.text).then(() => F.toast("Copied")); return;
    }
  });
  view.addEventListener("change", async (ev) => {
    const el = ev.target;
    if (el.dataset.act === "toggle-public") {
      if (await run(() => api.update("messages", { id: el.dataset.id }, { is_public: el.checked }), el.checked ? "Shown on the website" : "Hidden from the website")) {
        S.messages.find((m) => m.id === el.dataset.id).is_public = el.checked;
      }
    }
    if (el.dataset.act === "role") {
      const p = S.profiles.find((x) => x.id === el.dataset.id);
      const ok = await F.confirmBox(el.value === "admin" ? "Make admin?" : "Remove admin access?",
        el.value === "admin" ? `${esc(p.email)} will be able to send texts and see everyone's phone numbers.` : `${esc(p.email)} will no longer be able to use the admin site.`, "Yes");
      if (ok && await run(() => api.update("profiles", { id: p.id }, { role: el.value }), "Role updated")) refresh();
      else el.value = p.role;
    }
  });

  start();
})();
