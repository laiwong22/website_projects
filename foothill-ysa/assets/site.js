// Public site: announcements, calendar, and the "get texts" sign-up form.
(() => {
  const F = window.FYSA, { esc } = F;
  const view = document.getElementById("view");
  const state = { groups: [], messages: [], events: [], month: startOfMonth(new Date()) };

  function startOfMonth(x) { const t = new Date(x); t.setDate(1); t.setHours(0, 0, 0, 0); return t; }

  async function load() {
    if (!F.configured) {
      document.getElementById("demo").hidden = false;
      const demo = F.demoData();
      state.groups = demo.groups;
      state.messages = demo.messages.filter((m) => m.status === "sent" && m.is_public);
      state.events = demo.events;
      return;
    }
    const since = new Date(); since.setMonth(since.getMonth() - 6);
    const [g, m, e] = await Promise.all([
      F.sb.from("groups").select("id, slug, name, description, keyword, groupme_url, is_default, sort").eq("is_active", true).order("sort"),
      F.sb.from("messages").select("id, title, body, group_ids, sent_at").eq("status", "sent").eq("is_public", true).order("sent_at", { ascending: false }).limit(150),
      F.sb.from("events").select("*").gte("starts_at", since.toISOString()).order("starts_at"),
    ]);
    for (const r of [g, m, e]) if (r.error) throw r.error;
    state.groups = g.data; state.messages = m.data; state.events = e.data;
  }

  const groupName = (id) => state.groups.find((g) => g.id === id);
  const upcoming = (n) => state.events.filter((e) => new Date(e.ends_at || e.starts_at) >= new Date()).slice(0, n);
  const dateBox = (x) => `<div class="datebox"><small>${F.fmtDate(x, { month: "short" })}</small><b>${new Date(x).getDate()}</b></div>`;

  // ---------------------------------------------------------------- announcements
  function renderAnnouncements() {
    const soon = upcoming(4);
    const posts = state.messages.map((m, i) => {
      const chips = m.group_ids.map(groupName).filter((g) => g && !g.is_default).map((g) => `<span class="chip">${esc(g.name)}</span>`).join("");
      return `<article class="card post ${i === 0 ? "latest" : ""}">
        <div class="meta">${i === 0 ? '<span class="chip warn">Latest</span>' : ""}<time datetime="${m.sent_at}" title="${esc(F.fmtDateTime(m.sent_at))}">${esc(F.fmtDate(m.sent_at, { weekday: "long", month: "long", day: "numeric" }))}</time>${chips}</div>
        ${m.title ? `<h3>${esc(m.title)}</h3>` : ""}
        <div class="body">${F.linkify(m.body)}</div>
      </article>`;
    }).join("");
    view.innerHTML = `
      <section class="hero">
        <div><h1>Welcome to Foothill YSA</h1><p>Ward news and what's coming up. Want these as texts?</p></div>
        <a class="btn" href="#join">Get texts</a>
      </section>
      <div class="grid2">
        <section class="stack" aria-label="Announcements">
          ${posts || `<div class="card empty">No announcements yet. Check back soon!</div>`}
        </section>
        <aside class="card upcoming">
          <div class="spread" style="margin-bottom:6px"><h2>Coming up</h2><a href="#calendar" class="small">Full calendar</a></div>
          ${soon.length ? `<ul>${soon.map((e) => `<li>${dateBox(e.starts_at)}<div><b>${esc(e.title)}</b><div class="small muted">${e.all_day ? "All day" : esc(F.fmtTime(e.starts_at))}${e.location ? ` · ${esc(e.location)}` : ""}</div></div></li>`).join("")}</ul>` : `<p class="muted small">Nothing on the calendar yet.</p>`}
        </aside>
      </div>`;
  }

  // ---------------------------------------------------------------- calendar
  function renderCalendar() {
    const m = state.month, today = new Date();
    const first = new Date(m); first.setDate(1 - m.getDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const day = new Date(first); day.setDate(first.getDate() + i);
      if (i === 35 && day.getMonth() !== m.getMonth()) break;
      const evs = state.events.filter((e) => F.sameDay(e.starts_at, day));
      cells.push(`<td class="${day.getMonth() !== m.getMonth() ? "out" : ""} ${F.sameDay(day, today) ? "today" : ""}">
        <div class="d">${day.getDate()}</div>${evs.map((e) => `<button class="ev" data-ev="${e.id}" title="${esc(e.title)}">${e.all_day ? "" : esc(F.fmtTime(e.starts_at).replace(":00", "")) + " "}${esc(e.title)}</button>`).join("")}</td>`);
    }
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
    const inMonth = state.events.filter((e) => { const t = new Date(e.starts_at); return t.getMonth() === m.getMonth() && t.getFullYear() === m.getFullYear(); });
    view.innerHTML = `
      <div class="section-head">
        <h1>${esc(m.toLocaleDateString(undefined, { month: "long", year: "numeric" }))}</h1>
        <div class="row"><button class="btn small" data-nav="-1" aria-label="Previous month">‹</button><button class="btn small" data-nav="0">Today</button><button class="btn small" data-nav="1" aria-label="Next month">›</button></div>
      </div>
      <div class="table-wrap"><table class="cal"><thead><tr>${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>
      <section class="card ev-list" style="margin-top:20px">
        <h2 style="margin-bottom:6px">Events this month</h2>
        ${inMonth.length ? inMonth.map((e) => `<div class="item">${dateBox(e.starts_at)}<div style="flex:1"><b>${esc(e.title)}</b>
          <div class="small muted">${esc(F.eventWhen(e))}${e.location ? ` · ${esc(e.location)}` : ""}</div>
          ${e.description ? `<div class="small" style="margin-top:4px;white-space:pre-wrap">${F.linkify(e.description)}</div>` : ""}</div>
          <button class="btn small" data-ics="${e.id}" title="Add to my calendar">+ Calendar</button></div>`).join("") : `<p class="muted">No events this month.</p>`}
      </section>`;
  }

  function showEvent(id) {
    const e = state.events.find((x) => x.id === id);
    if (!e) return;
    F.modal(`<h2>${esc(e.title)}</h2><p class="muted" style="margin:6px 0 10px">${esc(F.eventWhen(e))}${e.location ? `<br>${esc(e.location)}` : ""}</p>
      ${e.description ? `<p style="white-space:pre-wrap">${F.linkify(e.description)}</p>` : ""}
      <div class="dlg-actions"><button class="btn" value="ics">+ Add to my calendar</button><button class="btn primary" value="cancel">Close</button></div>`)
      .then((r) => r?.value === "ics" && F.icsFor(e));
  }

  // ---------------------------------------------------------------- sign-up
  function renderJoin() {
    const num = F.cfg.textNumber ? F.fmtPhone(F.cfg.textNumber) : "our number";
    const textable = state.groups.filter((g) => g.keyword);
    view.innerHTML = `
      <div class="grid2">
        <section class="card stack">
          <div><h1>Get Foothill YSA texts</h1><p class="muted" style="margin-top:6px">Ward news and reminders, about 2–3 texts a week. Pick the groups you want.</p></div>
          <form id="join" class="stack" novalidate>
            <label class="field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="80" placeholder="First and last name"></label>
            <label class="field"><span>Cell number</span><input type="tel" name="phone" autocomplete="tel" inputmode="tel" required placeholder="(801) 555-1234"></label>
            <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
            <fieldset style="border:0;padding:0;margin:0" class="stack">
              <legend style="font-weight:600;font-size:13px;margin-bottom:6px">Groups</legend>
              ${state.groups.map((g) => `<label class="check"><input type="checkbox" name="groups" value="${esc(g.slug)}" ${g.is_default ? "checked" : ""}>
                <div><b>${esc(g.name)}</b><span class="small muted">${esc(g.description || "")}</span></div></label>`).join("")}
            </fieldset>
            <p class="small muted">By signing up you agree to get recurring texts from Foothill YSA. Msg &amp; data rates may apply. Reply STOP to unsubscribe anytime, HELP for help. We never share your number.</p>
            <button class="btn primary" type="submit">Sign me up</button>
            <div id="join-msg" role="status"></div>
          </form>
        </section>
        <aside class="stack">
          <section class="card">
            <h2>Or just text us</h2>
            <p class="muted small" style="margin-top:6px">Text one of these words to <b>${esc(num)}</b>:</p>
            <table class="list"><tbody>
              <tr><td><b>JOIN</b></td><td>Ward announcements</td></tr>
              ${textable.filter((g) => !g.is_default).map((g) => `<tr><td><b>${esc(g.keyword)}</b></td><td>${esc(g.name)}</td></tr>`).join("")}
              <tr><td><b>STOP</b></td><td>Stop all texts</td></tr>
            </tbody></table>
          </section>
          ${state.groups.some((g) => g.groupme_url) ? `<section class="card"><h2>Group chats</h2><p class="muted small" style="margin-top:6px">The hobby groups chat in GroupMe:</p>
            ${state.groups.filter((g) => g.groupme_url).map((g) => `<p><a href="${esc(g.groupme_url)}" target="_blank" rel="noopener">${esc(g.name)} on GroupMe ↗</a></p>`).join("")}</section>` : ""}
          <section class="card">
            <h2>Unsubscribe or change groups</h2>
            <p class="muted small" style="margin-top:6px">Reply <b>STOP</b> to any of our texts, or use the link in your welcome text. Lost it? We'll text it to you again.</p>
            <form id="manage" class="row" novalidate><input type="tel" name="phone" inputmode="tel" placeholder="Your cell number" style="flex:1;min-width:160px" required><button class="btn" type="submit">Text me my link</button></form>
            <div id="manage-msg" class="small" role="status" style="margin-top:8px"></div>
          </section>
        </aside>
      </div>`;

    document.getElementById("join").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, out = document.getElementById("join-msg");
      const data = { name: f.elements.name.value.trim(), phone: f.phone.value, website: f.website.value, groups: [...f.querySelectorAll("[name=groups]:checked")].map((x) => x.value) };
      const problem = !data.name ? "Please enter your name." : !F.normalizePhone(data.phone) ? "Please enter a 10-digit US cell number." : !data.groups.length ? "Pick at least one group." : "";
      if (problem) { out.innerHTML = `<p class="chip bad">${esc(problem)}</p>`; return; }
      const btn = f.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Signing you up…";
      try {
        const r = F.configured ? await F.callFn("subscribe", data) : { status: "pending" };
        f.reset(); f.querySelectorAll("[name=groups]").forEach((c) => (c.checked = state.groups.find((g) => g.slug === c.value)?.is_default));
        out.innerHTML = r.status === "active"
          ? `<div class="card" style="background:var(--green-soft)"><b>You're all set!</b> You're already subscribed, so we added the new groups.</div>`
          : `<div class="card" style="background:var(--green-soft)"><b>Almost done!</b> We just texted you. Reply <b>JOIN</b> to confirm.${F.configured ? "" : " <em>(Demo: nothing was sent.)</em>"}</div>`;
      } catch (e) {
        out.innerHTML = `<p class="chip bad">${esc(e.message)}</p>`;
      } finally { btn.disabled = false; btn.textContent = "Sign me up"; }
    });

    document.getElementById("manage").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const out = document.getElementById("manage-msg");
      if (!F.normalizePhone(ev.target.phone.value)) { out.textContent = "Please enter a 10-digit US cell number."; return; }
      try {
        if (F.configured) await F.callFn("manage", { action: "send_link", phone: ev.target.phone.value });
        out.textContent = "If that number is subscribed, we just texted it a link.";
        ev.target.reset();
      } catch (e) { out.textContent = e.message; }
    });
  }

  // ---------------------------------------------------------------- routing
  function route() {
    const tab = (location.hash.slice(1) || "announcements").split("/")[0];
    const t = ["announcements", "calendar", "join"].includes(tab) ? tab : "announcements";
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === t));
    ({ announcements: renderAnnouncements, calendar: renderCalendar, join: renderJoin })[t]();
    window.scrollTo(0, 0);
  }

  view.addEventListener("click", (ev) => {
    const nav = ev.target.closest("[data-nav]");
    if (nav) {
      const n = +nav.dataset.nav;
      state.month = n === 0 ? startOfMonth(new Date()) : startOfMonth(new Date(state.month.getFullYear(), state.month.getMonth() + n, 1));
      return renderCalendar();
    }
    const evBtn = ev.target.closest("[data-ev]");
    if (evBtn) return showEvent(evBtn.dataset.ev);
    const ics = ev.target.closest("[data-ics]");
    if (ics) return F.icsFor(state.events.find((e) => e.id === ics.dataset.ics));
  });
  window.addEventListener("hashchange", route);

  view.innerHTML = `<p class="muted">Loading…</p>`;
  load().then(route).catch((e) => { console.error(e); view.innerHTML = `<div class="card empty">Couldn't load the latest news. Please refresh.<br><span class="small">${esc(e.message)}</span></div>`; });
})();
