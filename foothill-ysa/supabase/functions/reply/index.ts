// POST { phone, body }  (admins only) -> texts one person from the Inbox and logs it there.
import { adminDb, json, normalizePhone, plainText, preflight, requireAdmin, sendSms } from "../_shared/util.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const adminId = await requireAdmin(req);
  if (!adminId) return json({ error: "Not allowed" }, 401);
  const { phone: rawPhone, body: rawBody } = await req.json().catch(() => ({}));
  const phone = normalizePhone(rawPhone), body = plainText(rawBody);
  if (!phone || !body) return json({ error: "Need a phone number and a message." }, 400);

  const r = await sendSms(phone, body);
  if (r.error) return json({ error: r.code === 21610 ? "They've opted out (texted STOP), so they can't get texts." : r.error }, 400);
  const db = adminDb();
  const { data: sub } = await db.from("subscribers").select("id").eq("phone", phone).maybeSingle();
  await db.from("inbox_messages").insert({ phone, subscriber_id: sub?.id ?? null, direction: "out", body, is_read: true, created_by: adminId });
  await db.from("inbox_messages").update({ is_read: true }).eq("phone", phone).eq("direction", "in");
  return json({ ok: true });
});
