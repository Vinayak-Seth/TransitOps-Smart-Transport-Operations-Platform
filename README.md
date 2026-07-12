# TransitOps — Smart Transport Operations Platform

A hackathon project digitizing vehicle, driver, dispatch, maintenance, and
expense management for logistics fleets: RBAC auth, trip lifecycle with
business-rule validation, maintenance workflow, fuel/expense tracking,
dashboard KPIs, charts, CSV/PDF export, real cloud persistence, real file
uploads, and real email reminders.

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`). Log in with any
demo account shown on the login screen (password `demo123` for all of them).

Out of the box, with no further setup, the app runs in **local mode**:
data is saved in your browser's localStorage, document uploads are stored as
base64 in that same local data, and license reminders are logged in-app only.
Nothing crashes without a backend — you just don't get real cross-device sync,
real file hosting, or real emails until you configure one.

## Turning on the real backend (optional but recommended for judging)

See **SETUP_REAL_BACKEND.md** for full step-by-step instructions to connect:
- **Supabase** — real Postgres persistence + real file storage for vehicle documents
- **EmailJS** — real email delivery for license expiry reminders

Once configured, the top-right badge in the app switches from
"Local mode" to "Synced to Supabase," confirming it's live.

## Project structure

```
transitops/
├── index.html              Vite entry HTML
├── package.json
├── vite.config.js
├── .env.example            Copy to .env and fill in your credentials
├── .gitignore
├── supabase_schema.sql     Run this in Supabase's SQL editor once
├── SETUP_REAL_BACKEND.md   Full setup walkthrough
└── src/
    ├── main.jsx             App entry point
    ├── App.jsx               The entire application
    └── storagePolyfill.js    localStorage shim for window.storage (local-mode fallback)
```

## Build for deployment

```bash
npm run build
```

Produces a `dist/` folder of static files — deployable to Netlify, Vercel,
GitHub Pages, or any static host. Remember to set your environment variables
(the same ones from `.env`) in your hosting provider's dashboard too, since
`.env` itself is gitignored and won't be deployed with your code.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Fleet Manager | fleetmgr@transitops.com | demo123 |
| Driver | driver@transitops.com | demo123 |
| Safety Officer | safety@transitops.com | demo123 |
| Financial Analyst | finance@transitops.com | demo123 |
| Admin | admin@transitops.com | demo123 |
