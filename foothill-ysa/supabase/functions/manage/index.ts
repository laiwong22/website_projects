// The personal "manage / unsubscribe" link (u.html?t=TOKEN) talks to this function.
// POST { action: "get" | "update" | "unsubscribe" | "resubscribe", token, groups? }
// POST { action: "send_link", phone }  -> texts the person their link (if they're subscribed)
import { adminDb, json, manageLink, normalizePhone, preflight, sendSms, WARD_NAME } from "../_shared/util.ts";
import { activeGroups, findSubscriber, joinGroups, leaveGroups, setStatus } from "../_shared/subscriptions.ts";

const THROTTLE_MS = 10 * 60 * 1000;
const mask = (p: string) => `(•••) •••-${p.slice(-4)}`;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const db = adminDb();

    if (body.action === "send_link") {
      const phone = normalizePhone(body.phone);
      if (!phone) return json({ error: "Please enter a 10-digit US cell number." }, 400);
      const sub = await findSubscriber(db, phone);
      const recent = sub?.last_confirm_sent_at && Date.now() - Date.parse(sub.last_confirm_sent_at) < THROTTLE_MS;
      if (sub && sub.status !== "unsubscribed" && !recent) {
        await sendSms(phone, `${WARD_NAME()}: manage your texts or unsubscribe here: ${manageLink(sub.token)}`);
        await db.from("subscribers").update({ last_confirm_sent_at: new Date().toISOString() }).eq("id", sub.id);
      }
      // Same answer either way, so the form can't be used to check who's subscribed.
      return json({ ok: true });
    }

    const token = String(body.token ?? "");
    if (!/^[0-9a-f]{18}$/.test(token)) return json({ error: "That link isn't valid." }, 400);
    const { data: sub } = await db.from("subscribers").select("*").eq("token", token).maybeSingle();
    if (!sub) return json({ error: "That link isn't valid anymore." }, 404);
    const groups = await activeGroups(db);

    if (body.action === "update") {
      const wanted = new Set<string>(Array.isArray(body.groups) ? body.groups : []);
      await joinGroups(db, sub.id, groups.filter((g) => wanted.has(g.slug)));
      await leaveGroups(db, sub.id, groups.filter((g) => !wanted.has(g.slug)).map((g) => g.id));
    } else if (body.action === "unsubscribe" && sub.status !== "unsubscribed") {
      await setStatus(db, sub.id, "unsubscribed");
      await sendSms(sub.phone, `${WARD_NAME()}: you're unsubscribed and won't get more texts. Changed your mind? ${manageLink(sub.token)}`);
    } else if (body.action === "resubscribe" && sub.status !== "active") {
      await setStatus(db, sub.id, "active");
    }

    const { data: fresh } = await db.from("subscribers").select("status, name").eq("id", sub.id).single();
    const { data: ms } = await db.from("memberships").select("group_id, status").eq("subscriber_id", sub.id);
    const byGroup = new Map((ms ?? []).map((m) => [m.group_id, m.status]));
    return json({
      name: fresh!.name,
      phone: mask(sub.phone),
      status: fresh!.status,
      groups: groups.map((g) => ({
        slug: g.slug, name: g.name, groupme_url: g.groupme_url,
        joined: byGroup.get(g.id) === "active",
        removed: byGroup.get(g.id) === "removed",
      })),
    });
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong. Please try again in a minute." }, 500);
  }
});
