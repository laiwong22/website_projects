// Shared helpers for the public site, the admin site and the manage-subscription page.
window.FYSA = (() => {
  const cfg = Object.assign({ wardName: "Foothill YSA", costPerText: 0.012 }, window.FYSA_CONFIG || {});
  const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const sb = configured && window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  // ---------------------------------------------------------------- formatting
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /** Escapes text and turns URLs into links (newlines are kept by CSS white-space). */
  const linkify = (s) => esc(s).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
  const d = (x) => (x instanceof Date ? x : new Date(x));
  const fmtDate = (x, opts = { weekday: "short", month: "short", day: "numeric" }) => d(x).toLocaleDateString(undefined, opts);
  const fmtTime = (x) => d(x).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const fmtDateTime = (x) => `${fmtDate(x)}, ${fmtTime(x)}`;
  const sameDay = (a, b) => d(a).toDateString() === d(b).toDateString();
  function ago(x) {
    const s = (Date.now() - d(x)) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
    return fmtDate(x, { month: "short", day: "numeric", year: d(x).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  }
  function normalizePhone(input) {
    let n = String(input ?? "").replace(/\D/g, "");
    if (n.length === 11 && n.startsWith("1")) n = n.slice(1);
    return n.length === 10 && /^[2-9]/.test(n) ? "+1" + n : null;
  }
  const fmtPhone = (p) => {
    const m = String(p ?? "").match(/^\+1(\d{3})(\d{3})(\d{4})$/);
    return m ? `(${m[1]}) ${m[2]}-${m[3]}` : String(p ?? "");
  };
  const eventWhen = (e) => {
    if (e.all_day) return fmtDate(e.starts_at, { weekday: "long", month: "long", day: "numeric" });
    let s = `${fmtDate(e.starts_at, { weekday: "long", month: "long", day: "numeric" })} · ${fmtTime(e.starts_at)}`;
    if (e.ends_at) s += sameDay(e.starts_at, e.ends_at) ? `–${fmtTime(e.ends_at)}` : ` – ${fmtDateTime(e.ends_at)}`;
    return s;
  };

  // ---------------------------------------------------------------- SMS length & cost
  const plainText = (s) => String(s ?? "")
    .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, "-").replace(/…/g, "...").replace(/ ?[·•] ?/g, " - ").replace(/ /g, " ").replace(/\r\n/g, "\n").trim();
  const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
  const GSM_EXT = "^{}\\[~]|€";
  /** How many billable texts ("segments") a message is. Emoji switch to a 70-character limit. */
  function smsInfo(text) {
    const t = plainText(text);
    const chars = [...t];
    const gsm = chars.every((c) => GSM.includes(c) || GSM_EXT.includes(c));
    if (gsm) {
      const len = chars.reduce((n, c) => n + (GSM_EXT.includes(c) ? 2 : 1), 0);
      return { length: len, unicode: false, segments: len <= 160 ? 1 : Math.ceil(len / 153), limit: len <= 160 ? 160 : 153 };
    }
    const len = [...t].reduce((n, c) => n + (c.codePointAt(0) > 0xffff ? 2 : 1), 0);
    return { length: len, unicode: true, segments: len <= 70 ? 1 : Math.ceil(len / 67), limit: len <= 70 ? 70 : 67 };
  }
  const money = (n) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

  // ---------------------------------------------------------------- calendar file
  function icsFor(e) {
    const z = (x) => d(x).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const day = (x) => { const t = d(x); return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}${String(t.getDate()).padStart(2, "0")}`; };
    const escI = (s) => String(s ?? "").replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
    const end = e.ends_at || new Date(d(e.starts_at).getTime() + 3600e3);
    const nextDay = new Date(d(e.starts_at)); nextDay.setDate(nextDay.getDate() + 1);
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Foothill YSA//EN", "BEGIN:VEVENT",
      `UID:${e.id}@foothill-ysa`, `DTSTAMP:${z(new Date())}`,
      ...(e.all_day ? [`DTSTART;VALUE=DATE:${day(e.starts_at)}`, `DTEND;VALUE=DATE:${day(nextDay)}`] : [`DTSTART:${z(e.starts_at)}`, `DTEND:${z(end)}`]),
      `SUMMARY:${escI(e.title)}`, e.location ? `LOCATION:${escI(e.location)}` : "", e.description ? `DESCRIPTION:${escI(e.description)}` : "",
      "END:VEVENT", "END:VCALENDAR"].filter(Boolean);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
    a.download = `${e.title.replace(/[^\w]+/g, "-").toLowerCase()}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------------------------------------------------------- UI bits
  let toastTimer;
  function toast(msg, bad = false) {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.append(el); }
    el.textContent = msg; el.classList.toggle("bad", bad); el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), bad ? 6000 : 3200);
  }
  /** Opens a dialog with the given HTML; resolves with the clicked button's value (or null). */
  function modal(html, { onOpen } = {}) {
    return new Promise((resolve) => {
      const dlg = document.createElement("dialog");
      dlg.innerHTML = `<form method="dialog" class="dlg">${html}</form>`;
      document.body.append(dlg);
      dlg.addEventListener("close", () => { resolve(dlg.returnValue && dlg.returnValue !== "cancel" ? { value: dlg.returnValue, form: dlg.querySelector("form") } : null); dlg.remove(); });
      dlg.querySelector("form").addEventListener("submit", (ev) => {
        const v = ev.submitter?.value;
        if (v && v !== "cancel" && !ev.target.reportValidity()) ev.preventDefault();
      });
      dlg.showModal();
      onOpen?.(dlg);
    });
  }
  const confirmBox = async (title, text, ok = "OK", danger = false) =>
    !!(await modal(`<h2>${esc(title)}</h2><p class="muted" style="margin-top:8px">${text}</p>
      <div class="dlg-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn ${danger ? "danger" : "primary"}" value="ok">${esc(ok)}</button></div>`));

  /** Calls an edge function. Sends the signed-in user's token when there is one. */
  async function callFn(name, body) {
    if (!configured) throw new Error("Demo mode: connect Supabase in config.js first.");
    const { data } = sb ? await sb.auth.getSession() : { data: {} };
    const res = await fetch(`${cfg.supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${data?.session?.access_token ?? cfg.supabaseAnonKey}` },
      body: JSON.stringify(body ?? {}),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || `Request failed (${res.status})`);
    return out;
  }

  // ---------------------------------------------------------------- demo data (used until Supabase is connected)
  function demoData() {
    const now = new Date();
    const at = (days, h = 19, m = 0) => { const t = new Date(now); t.setDate(t.getDate() + days); t.setHours(h, m, 0, 0); return t.toISOString(); };
    const groups = [
      { id: "g1", slug: "ward", name: "Foothill YSA Announcements", description: "Ward news, activities and reminders for everyone.", keyword: "WARD", groupme_url: null, is_default: true, is_active: true, sort: 1 },
      { id: "g2", slug: "running", name: "Running Group", description: "Group runs and races. Chat happens in GroupMe.", keyword: "RUN", groupme_url: "https://groupme.com/join_group/example", is_default: false, is_active: true, sort: 10 },
      { id: "g3", slug: "reading", name: "Reading Group", description: "Book club picks and meetups. Chat happens in GroupMe.", keyword: "READ", groupme_url: "https://groupme.com/join_group/example", is_default: false, is_active: true, sort: 20 },
      { id: "g4", slug: "scripture", name: "Scripture Group", description: "Scripture study nights. Chat happens in GroupMe.", keyword: "SCRIPTURE", groupme_url: null, is_default: false, is_active: true, sort: 30 },
    ];
    const messages = [
      { id: "m1", title: "Ward Halloween party!", body: "FYSA: Ward Halloween party this Fri 7pm in the cultural hall. Costumes encouraged, chili cook-off, bring a friend! Details: https://example.com", group_ids: ["g1"], status: "sent", is_public: true, include_unsub_link: false, sent_at: at(-1, 18, 30), created_at: at(-1, 18, 0), recipient_count: 182 },
      { id: "m2", title: "Saturday 5K", body: "Running group: easy 5K Sat 8am at the park trailhead. All paces welcome!", group_ids: ["g2"], status: "sent", is_public: true, include_unsub_link: false, sent_at: at(-3, 12), created_at: at(-3, 12), recipient_count: 24 },
      { id: "m3", title: "Ministering interviews", body: "Reminder: ministering interviews are this Sunday after church. Sign up on the sheet outside the bishop's office.", group_ids: ["g1"], status: "sent", is_public: true, include_unsub_link: false, sent_at: at(-6, 10), created_at: at(-6, 10), recipient_count: 180 },
      { id: "m4", title: "Temple trip", body: "Temple trip next Thursday! Carpool leaves the church at 6pm. Reply if you need a ride.", group_ids: ["g1"], status: "sent", is_public: true, include_unsub_link: false, sent_at: at(-10, 17), created_at: at(-10, 17), recipient_count: 176 },
      { id: "m5", title: "", body: "Reading group picks this month's book Sunday night. Vote in the GroupMe!", group_ids: ["g3"], status: "scheduled", is_public: true, include_unsub_link: false, scheduled_at: at(2, 9), created_at: at(0, 9) },
      { id: "m6", title: "Thanksgiving dinner", body: "Ward Thanksgiving dinner sign-ups are open...", group_ids: ["g1"], status: "draft", is_public: true, include_unsub_link: false, created_at: at(0, 8) },
    ];
    const events = [
      { id: "e1", title: "Ward Halloween party", description: "Costumes, chili cook-off and games. Bring a friend!", location: "Church cultural hall", starts_at: at(4, 19), ends_at: at(4, 21), all_day: false },
      { id: "e2", title: "Running group 5K", description: "Easy pace, all welcome.", location: "Park trailhead", starts_at: at(5, 8), ends_at: at(5, 9), all_day: false },
      { id: "e3", title: "Temple trip", description: "Carpool leaves the church at 6pm.", location: "Temple", starts_at: at(9, 18), ends_at: at(9, 21), all_day: false },
      { id: "e4", title: "Scripture study night", description: "Come Follow Me discussion + treats.", location: "Institute building", starts_at: at(11, 19, 30), ends_at: at(11, 20, 30), all_day: false },
      { id: "e5", title: "Service project", description: "Food bank sorting.", location: "Community food bank", starts_at: at(16, 9), ends_at: at(16, 12), all_day: false },
      { id: "e6", title: "Fast Sunday", description: "", location: "", starts_at: at(20, 0), ends_at: null, all_day: true },
    ];
    const names = ["Sam Lee", "Hannah Park", "Josh Miller", "Emma Brown", "Tyler Nguyen", "Abby Smith", "Caleb Jones", "Lily Garcia", "Ethan Kim", "Grace Wilson", "Noah Davis", "Mia Lopez"];
    const subscribers = names.map((n, i) => ({
      id: `s${i + 1}`, name: n, phone: `+1801555${String(1000 + i * 37).padStart(4, "0")}`,
      status: i === 10 ? "unsubscribed" : i === 11 ? "pending" : "active", source: i % 4 === 0 ? "text" : "web",
      token: `demo${i}`, created_at: at(-40 + i * 3, 12), confirmed_at: at(-40 + i * 3, 12),
    }));
    const memberships = [];
    subscribers.forEach((s, i) => {
      memberships.push({ subscriber_id: s.id, group_id: "g1", status: "active" });
      if (i % 3 === 0) memberships.push({ subscriber_id: s.id, group_id: "g2", status: i === 9 ? "removed" : "active" });
      if (i % 4 === 1) memberships.push({ subscriber_id: s.id, group_id: "g3", status: "active" });
      if (i % 5 === 2) memberships.push({ subscriber_id: s.id, group_id: "g4", status: "active" });
    });
    const inbox_messages = [
      { id: "i1", phone: subscribers[1].phone, subscriber_id: "s2", direction: "in", body: "Can I bring my roommate to the Halloween party?", is_read: false, created_at: at(-1, 19, 2) },
      { id: "i2", phone: subscribers[4].phone, subscriber_id: "s5", direction: "in", body: "I need a ride to the temple trip!", is_read: true, created_at: at(-9, 20) },
      { id: "i3", phone: subscribers[4].phone, subscriber_id: "s5", direction: "out", body: "You got it, Abby's driving from the church at 6. See you there!", is_read: true, created_at: at(-9, 20, 30) },
    ];
    const profiles = [
      { id: "u1", email: "you@example.com", name: "You", role: "owner", created_at: at(-30) },
      { id: "u2", email: "activities@example.com", name: "Activities chair", role: "admin", created_at: at(-20) },
      { id: "u3", email: "member@example.com", name: "A ward member", role: "member", created_at: at(-2) },
    ];
    return { groups, messages, events, subscribers, memberships, inbox_messages, profiles };
  }

  return { cfg, configured, sb, esc, linkify, fmtDate, fmtTime, fmtDateTime, ago, sameDay, eventWhen, normalizePhone, fmtPhone, plainText, smsInfo, money, icsFor, toast, modal, confirmBox, callFn, demoData };
})();
