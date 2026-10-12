# Foothill YSA (FYSAA)

Ward announcements by text, plus a public news and calendar site for the Foothill YSA ward.

- `index.html`: public site with **Announcements** (newest first), **Calendar**, and **Get texts** (sign-up)
- `admin/`: leader console with **Send** (now or scheduled), **Inbox** (replies), **Subscribers**
  (remove people from groups), **Groups**, **Calendar**, **Admins** (roles), and **Share** (QR poster)
- `u.html?t=…`: each subscriber's personal page to change groups or unsubscribe
- `supabase/`: database schema and edge functions (Twilio texting)

Setup: see [SETUP.md](SETUP.md). Until it's connected, every page runs on sample data.
