# Foothill YSA texting: setup checklist

Until steps 1–3 are done, the site runs in **demo mode** with sample data.

- Public site: https://laiwong22.github.io/website_projects/foothill-ysa/
- Admin site: https://laiwong22.github.io/website_projects/foothill-ysa/admin/

```
 Phone ──text──▶ Twilio ──webhook──▶ Supabase functions ──▶ Supabase database
                   ▲                         │                     ▲
                   └──────── sends texts ────┘                     │
 Public site & admin site (GitHub Pages) ──── read/write ──────────┘
```

Never paste secret keys into chat, GitHub, or `config.js`. Secrets go only into the
Supabase dashboard (step 5) or your Claude environment settings.

---

## 1. Supabase (database + logins), about 15 min

1. Sign up at https://supabase.com (free plan) and create a project named `foothill-ysa`.
   Pick a **US West** region and save the database password somewhere safe.
2. Go to **SQL Editor → New query**, paste all of
   `supabase/migrations/20261012000000_init.sql`, and click **Run**.
3. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key.
   Put them in `foothill-ysa/config.js`, or send them to Claude. Both are safe to make public.
   Do **not** use the `service_role` key here.
4. Go to **Authentication → URL Configuration**:
   - Site URL: `https://laiwong22.github.io/website_projects/foothill-ysa/admin/`
   - Redirect URLs: add the same address.

## 2. Make yourself the owner

1. Open the admin site and sign in with your email (you'll get a login link).
2. In the Supabase **SQL Editor**, run:
   ```sql
   update public.profiles set role = 'owner' where email = 'laiwong22@gmail.com';
   ```
3. Refresh the admin site. To add more admins, have them sign in once, then switch them to
   **Admin** on the **Admins** tab.

## 3. Twilio (texting), about 30 min, then **1–3 weeks of carrier approval**

Start this now: carrier approval is the slowest part of the three-week timeline.

1. Sign up at https://twilio.com, then upgrade the account (add a card; $20 to start is plenty).
2. **Buy a number.** A **toll-free** number (about $2/month) is the simplest path for a church
   group: it needs no business tax ID and sends faster. A local (10DLC) number
   (about $1.15/month) also works but needs "A2P 10DLC" registration (Sole Proprietor type).
3. **Create a Messaging Service** (Messaging → Services → Create):
   - Name: `Foothill YSA`. Use case: *Notify my users*.
   - Sender pool: add your number.
   - Integration → **Send a webhook**, Request URL:
     `https://YOUR-PROJECT-REF.supabase.co/functions/v1/twilio-inbound` (HTTP POST).
   - Opt-Out Management: leave Advanced Opt-Out **on** so STOP/HELP work automatically. In
     the opt-in keywords, remove **YES** so people who reply YES to confirm don't get two replies.
   - Copy the **Messaging Service SID** (starts with `MG`).
4. **Submit verification** (toll-free: Phone Numbers → Regulatory → Toll-free verification).
   Use these answers:
   - Business/organization: Foothill YSA (young single adult congregation), a volunteer
     church group. Website: `https://laiwong22.github.io/website_projects/foothill-ysa/`
   - Use case: *Group announcements / community notifications*. Volume: under 10,000/month.
   - Description: "Announcements and event reminders for members of the Foothill YSA church
     congregation who sign up. About 2–3 messages per week."
   - How people opt in: "Users enter their name and number on
     https://laiwong22.github.io/website_projects/foothill-ysa/#join, check the groups they
     want and agree to the disclosure, then confirm by replying JOIN to our confirmation text.
     Users can also text JOIN to the number. Reply STOP to opt out."
   - Opt-in proof: a screenshot of the Get texts page.
   - Sample messages:
     1. `FYSA: Ward Halloween party this Fri 7pm in the cultural hall. Costumes encouraged! Reply STOP to opt out.`
     2. `Foothill YSA: reply JOIN to confirm you want our texts (about 2-3/wk). Msg&data rates may apply. Reply STOP to opt out.`
5. Copy your **Account SID** and **Auth Token** from the Twilio console home page. You'll paste
   them into Supabase in step 5. Don't send them to Claude.

You can test before approval: Twilio trial or unverified accounts can text numbers you've
verified in Twilio, so you can try everything on your own phone.

## 4. Deploy the backend functions

The five functions live in `foothill-ysa/supabase/functions/`.

- **Easiest (Claude does it):** create a Supabase access token at
  https://supabase.com/dashboard/account/tokens. In the Claude Code environment settings
  (the cloud environment menu in the session's title bar → Edit), add it as an environment
  variable named `SUPABASE_ACCESS_TOKEN`. Then start a new session and say "deploy the
  Foothill YSA functions". Claude runs:
  ```bash
  cd foothill-ysa
  npx supabase link --project-ref YOUR-PROJECT-REF
  npx supabase functions deploy
  ```
- **Yourself:** run the same commands on any computer with Node installed, after
  `npx supabase login`.

## 5. Secrets (Supabase → Edge Functions → Secrets)

| Name | Value |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | from Twilio (starts `AC`) |
| `TWILIO_AUTH_TOKEN` | from Twilio |
| `TWILIO_MESSAGING_SERVICE_SID` | from step 3 (starts `MG`) |
| `SITE_URL` | `https://laiwong22.github.io/website_projects/foothill-ysa` |
| `CRON_SECRET` | any long random password you make up (also used in step 6) |
| `WARD_NAME` | `Foothill YSA` (optional) |
| `DRY_RUN` | `true` to test without sending real texts; delete it to go live |
| `RESEND_API_KEY`, `NOTIFY_EMAIL` | optional: email you when someone texts in (free account at resend.com) |

## 6. Scheduled sending

Open `supabase/cron.sql`, replace `YOUR-PROJECT-REF` and `YOUR-CRON-SECRET`, and run it in
the SQL Editor. Don't commit the filled-in copy. After this, scheduled messages go out
within a minute of their time.

## 7. Last bits and a test

1. Put the Twilio number in `config.js` → `textNumber` (Claude can do this).
2. Sign up your own number on the public site and reply **JOIN**. Then try `RUN`,
   `LEAVE RUN`, a normal reply (it should land in the Inbox), and `STOP` / `START`.
3. Send yourself a test from the admin **Send** tab (select only a group you're alone in,
   or create a "Test" group).
4. Print the poster from the admin **Share** tab.

---

## Costs (US, rough)

| | Monthly |
| --- | --- |
| Supabase free plan | $0 (see note) |
| GitHub Pages | $0 |
| Twilio number | about $1–2 |
| Texts: about 1.2¢ each (Twilio about 0.83¢ + carrier fees) | 200 people × 1/week ≈ **$10**<br>200 people × 2–3/week ≈ **$25–30**<br>400 people × 2–3/week ≈ **$50–60** |

- A text longer than 160 characters, or one with an emoji, counts as 2+ texts. The Send page
  shows the count and cost before you send.
- Turning on "add each person's unsubscribe link" usually doubles the cost of a message.
  Replying STOP always works, and everyone gets their link in the welcome text.
- Supabase free projects **pause after about a week with no activity**. Weekly sends and site
  visits normally keep it awake. If it ever pauses, click **Restore** in the dashboard.
- Prices change. Check twilio.com/en-us/sms/pricing/us.
