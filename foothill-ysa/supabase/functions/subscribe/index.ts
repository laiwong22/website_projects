// POST { name, phone, groups: ["ward", "running"], website: "" }
// The public sign-up form. New numbers get a "reply JOIN to confirm" text (double opt-in,
// which carriers want and which stops people signing up someone else's number).
import { adminDb, cleanName, json, manageLink, normalizePhone, preflight, sendSms, WARD_NAME } from "../_shared/util.ts";
import { activeGroups, confirmText, findSubscriber, joinGroups } from "../_shared/subscriptions.ts";

const THROTTLE_MS = 10 * 60 * 1000;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    if (body.website) return json({ status: "pending" }); // honeypot field: bots fill it, people don't
    const phone = normalizePhone(body.phone);
    const name = cleanName(body.name);
    if (!phone) return json({ error: "Please enter a 10-digit US cell number." }, 400);
    if (!name) return json({ error: "Please enter your name." }, 400);

    const db = adminDb();
    const wanted = new Set<string>(Array.isArray(body.groups) ? body.groups : []);
    const groups = (await activeGroups(db)).filter((g) => wanted.has(g.slug));
    if (!groups.length) return json({ error: "Pick at least one group." }, 400);

    let sub = await findSubscriber(db, phone);
    if (!sub) {
      const { data, error } = await db.from("subscribers").insert({ phone, name, source: "web" }).select().single();
      if (error) throw error;
      sub = data;
    } else if (name !== sub.name) {
      await db.from("subscribers").update({ name }).eq("id", sub.id);
    }
    const joined = await joinGroups(db, sub!.id, groups);

    const recentlyTexted = sub!.last_confirm_sent_at && Date.now() - Date.parse(sub!.last_confirm_sent_at) < THROTTLE_MS;
    const active = sub!.status === "active";
    if (!active && sub!.status !== "pending") await db.from("subscribers").update({ status: "pending" }).eq("id", sub!.id);

    if (!recentlyTexted) {
      const text = active
        ? `${WARD_NAME()}: you're now in ${joined.map((g) => g.name).join(", ") || "your groups"}. Manage: ${manageLink(sub!.token)}`
        : confirmText();
      const sent = await sendSms(phone, text);
      if (sent.code === 21610) {
        return json({ status: "blocked", error: "This number texted STOP to us before. Text START to our number to turn texts back on, then try again." }, 409);
      }
      if (sent.error) throw new Error(sent.error);
      await db.from("subscribers").update({ last_confirm_sent_at: new Date().toISOString() }).eq("id", sub!.id);
    }
    return json({ status: active ? "active" : "pending", groups: joined.map((g) => g.slug) });
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong. Please try again in a minute." }, 500);
  }
});
