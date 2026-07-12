# TransitOps — Real Backend Setup (Supabase + EmailJS)

This turns the three "simulated" pieces into the real thing:
- **Persistence** → real Postgres database (Supabase), synced across devices
- **Document uploads** → real cloud file storage (Supabase Storage)
- **License reminders** → real emails sent to drivers (EmailJS)

If you skip this whole guide, the app still runs fine — it just falls back to
browser-only storage and in-app-only reminders. Nothing breaks either way.

---

## Part A — Install the two new packages

In your project folder (the one with `package.json`), run:

```
npm install @supabase/supabase-js @emailjs/browser
```

---

## Part B — Set up Supabase (real database + file storage)

1. Go to https://supabase.com → sign up (free) → **New project**.
2. Give it any name, set a database password (you won't need to remember it — the app doesn't use it directly), pick any region, and wait ~2 minutes for it to finish provisioning.
3. In the left sidebar, go to **SQL Editor** → **New query**.
4. Open the `supabase_schema.sql` file I generated alongside this guide, copy its entire contents, paste into the query editor, and click **Run**.
   - This creates the `fleet_data` table (where your whole fleet dataset lives) and a `vehicle-documents` storage bucket (where uploaded files live).
5. Go to **Settings → API** in the sidebar. Copy two values:
   - **Project URL** → this is `VITE_SUPABASE_URL`
   - **anon public** key (under "Project API keys") → this is `VITE_SUPABASE_ANON_KEY`

---

## Part C — Set up EmailJS (real email sending)

EmailJS is the one legitimate way to send real emails straight from browser
JavaScript with no backend server. (SendGrid, by contrast, requires a secret
API key that must never be exposed in browser code — that's why it needs a
backend, which is out of scope for a client-only app.)

1. Go to https://www.emailjs.com → sign up (free tier: 200 emails/month).
2. **Email Services** → **Add New Service** → connect your Gmail/Outlook/etc. account. Note the **Service ID** it generates.
3. **Email Templates** → **Create New Template**. Use these variable names in your template body so they match what the app sends:
   ```
   To: {{to_email}}
   Subject: License Renewal Reminder — {{driver_name}}

   Hi {{driver_name}},

   Our records show your driving license ({{license_number}}) expires on
   {{license_expiry}} — that's {{days_left}} day(s) from now.

   Please renew and upload your updated license as soon as possible.

   — TransitOps Fleet Operations
   ```
   Save it and note the **Template ID**.
4. **Account → General** → copy your **Public Key**.

---

## Part D — Add your credentials

1. In your project folder, copy `.env.example` to a new file named exactly `.env`.
2. Fill in all five values you collected above.
3. Add `.env` to your `.gitignore` if you plan to push this to GitHub (so you never commit real credentials).
4. Stop and restart `npm run dev` (Vite only reads `.env` at startup).

---

## Part E — Verify it's actually working

- Open the app. In the top-right corner you should now see a green **"Synced to Supabase"** badge instead of the amber "Local mode" one.
- Make any change (add a vehicle, edit a driver) — then open the Supabase dashboard → **Table Editor → fleet_data** and refresh. You should see your change reflected in the `payload` column. That's real cross-device sync: open the app on a different device/browser and you'll see the same data.
- On a vehicle's Documents panel, attach a real PDF/image. Check Supabase → **Storage → vehicle-documents** — the actual file should be sitting there, and the "View" link in the app opens the real hosted file, not a local blob.
- On the Dashboard, next to a driver whose license is expiring soon, click **Send reminder**. If everything's wired correctly, a real email lands in that driver's inbox within a few seconds, and the toast says "Real email sent to …" instead of the fallback message.

---

## Notes and honest limitations

- The `fleet_data` table stores the whole dataset as a single JSON blob rather than normalized relational tables. This was a deliberate trade-off to keep the migration simple and low-risk for a hackathon — a production system would split this into proper `vehicles`, `drivers`, `trips`, etc. tables with foreign keys.
- The Supabase RLS policy in the schema is permissive (anyone with the anon key can read/write) so the demo works immediately. A real production deployment should tie this to authenticated users instead.
- EmailJS's free tier caps at 200 emails/month — fine for a demo, not for production volume.
- If Supabase or EmailJS credentials are missing or wrong, the app **automatically falls back** to local-only mode rather than crashing — check the browser console for the specific error if something isn't syncing.
