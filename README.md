# Site Attendance — real-estate / construction sites

Geofenced site attendance with **offline punch**, supervisor **labour muster**, and **project-wise labour cost**.
White-label (company name, logo, colour, app name from Settings). Default branding: JNT Fire Engineers
(vector logo in `public/brand/`, brand orange `#C84508` for buttons so white text stays readable).

Built as one module of the JNT ERP; the labour-cost report is the input for order/project profit analysis.

## Features

**Site app (phone, installable PWA — `/w`)**
- Punch IN/OUT with **selfie** (live camera, watermark with name/site/time/GPS) and **GPS geofence** per site
- Nearest site auto-selected; tower / floor / zone picker; plan / work-done note
- **Works offline**: punch is saved on the phone and sent automatically when network returns
  (service worker + IndexedDB outbox + Background Sync on Android)
- Multi-site day (IN at Tower A, OUT, IN at Tower B), history with late / OT, monthly summary
- Missed-punch (regularization) and leave requests
- **Supervisor labour sheet**: contractor-wise P / Half / A + OT for labour without phones,
  extra headcount by trade, PPE check, toolbox talk, geo-tagged group photo, yesterday's sheet allowed

**Anti-fraud (server side)**
- Geofence check with GPS-accuracy tolerance (block or flag mode)
- Phone clock wrong → corrected using server time; clock changed → flagged
  (last-sync check, per-device sequence, wall-clock vs monotonic clock in a session)
- Late offline sync, reused selfie, impossible travel speed, site not assigned, weak GPS
- Flagged records go to the **Review queue**; approved/rejected with a note; full audit log

**Admin panel (`/admin`)**
- Live dashboard: present / on site / late / absent, map, site-wise staff & labour, 7-day trend
- Daily register with selfies, distance, flags, manual punch (audited)
- Monthly muster (P / HD / MO / SH / A / L / H / WO, late, OT, worked & paid days)
- Labour sheets + daily labour report (site × date), trade totals
- **Project labour cost**: staff cost split by time on each site + contractor wages → per project / site
- Excel export for muster, daily register, labour, project cost
- Masters: projects (builder, RERA), sites (map geofence editor, shift, floors), users & site access,
  contractors & labour (bulk paste), holidays, rules (grace, full/half day, OT, weekly off), photo retention

**Roles:** Admin · Project Manager (reports + approvals) · Site Supervisor (punch + labour) · Site Staff (punch)

## Tech

Next.js 16 (App Router) · React 19 · Tailwind 4 · Drizzle ORM · PostgreSQL **or** embedded PGlite ·
jose (session cookie) · bcryptjs · ExcelJS · Leaflet + OpenStreetMap · no paid services.

## Run locally

```bash
npm install
npm run dev            # http://localhost:3000
```

The first request creates the embedded database in `.data/` with demo data:

| Login ID | Password | Role |
|---|---|---|
| `ADMIN` | `admin@123` (asks to change) | Admin |
| `PM01` | `pass@123` | Project Manager |
| `SUP01`, `SUP02` | `pass@123` | Site Supervisor |
| `EMP01` … `EMP06` | `pass@123` | Site Staff |

Demo sites are in Thane (Skyline Residency: 19.2183, 72.9781) and Kharghar (Green Valley: 19.0330, 73.0697).
On a laptop, fake your location with Chrome DevTools → ⋮ → More tools → **Sensors**.
To start fresh, stop the server and delete `.data/`.

Phones need **HTTPS** for camera and GPS, so test on a phone through a tunnel
(e.g. `cloudflared tunnel --url http://localhost:3000`) or on the deployed server.
The service worker (offline reload) is active only in a production build (`npm run build && npm start`),
or in dev after `localStorage.setItem("enable-sw","1")`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build → `.next/standalone` (upload this folder) |
| `npm start` | Run the standalone build |
| `npm run typecheck` / `npm run lint` | Checks |
| `npm run db:generate` | New SQL migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Create/update tables (also runs automatically on start) |
| `npm run user:reset-password -- ADMIN "New@123"` | Emergency password reset |
| `npm run icons` | Regenerate phone/favicon icons from `public/brand/jnt-mark.svg` |

Deployment and cost: see **[DEPLOY.md](DEPLOY.md)**. Environment variables: **[.env.example](.env.example)**.

## Branding for another client

1. Admin → Settings → **Company logo**: upload PNG/JPG/WEBP (≤ 500 KB) and set company name, app name, colour.
2. Home-screen icons are files, so regenerate them before building:
   `node scripts/gen-icons.mjs --mark path/to/mark.svg --from "#123456" --to "#345678"`
   (the mark needs a transparent background; add `--keep-colors` for a white icon, or use `--pin "#hex"` for a generic icon).
3. Set `NEXT_PUBLIC_APP_NAME` and rebuild.

## Code map

```
src/app/w/                  site app page (static shell, works offline)
src/components/worker/      punch, labour, history, requests, sync tabs + camera
src/lib/client/             IndexedDB outbox, sync engine, GPS manager, photo compression
public/sw.js                service worker (offline cache + background sync)
src/app/api/w/              bootstrap (offline data), sync (one outbox item), ping
src/lib/sync-server.ts      server validation: geofence, clock correction, fraud flags
src/lib/attendance.ts       day status rules (P/HD/MO/SH/…, late, OT, site minutes)
src/lib/reports.ts          dashboard, register, muster, labour, project cost
src/app/admin/              admin pages + server actions
src/db/                     Drizzle schema, connection (Postgres or PGlite), seed
drizzle/                    SQL migrations
```

## Roadmap

- Android APK via Capacitor: fake-GPS (mock location) detection and satellite GPS time
- Face match on selfie (on-device) to stop buddy punching
- WhatsApp alerts (absent / late / labour not marked) via YukChat
- Payroll export (Tally), link labour cost with ERP sales/purchase for full order-wise profit
