# Deploying Site Attendance on the client's server

The goal is the **lowest running cost**: one small Linux server, no paid services.

## What it costs

| Item | Cost |
|---|---|
| Server | ₹0 (client's existing server, or Oracle Cloud *Always Free*) — or a 1–2 GB VPS at ~₹400–700/month |
| Database | ₹0 — built-in (PGlite) or PostgreSQL on the same server |
| Photo storage | ₹0 — server disk (~30–40 KB per selfie, old photos auto-deleted) |
| Maps | ₹0 — OpenStreetMap |
| SSL | ₹0 — Let's Encrypt |
| Domain | ₹0 with a sub-domain of the client's domain (e.g. `attendance.jntfire.com`) |
| Backups | ₹0 — nightly archive, optional copy to Google Drive with `rclone` |
| Android app | ₹0 — installed from the browser (PWA). Play Store listing is optional ($25 once) |

Disk estimate: 100 people × 2 selfies × 26 days ≈ 100 MB/month. With the default 6-month
photo retention the photo folder stays under ~1 GB.

## Option A: your own server or VPS (scripted, cheapest)

Two scripts do everything below. Manual steps are kept further down as reference.

```bash
# 1. ON THE SERVER (once). Use --postgres only for 100+ users.
sudo bash install.sh attendance.jntfire.com            # or: ... --postgres
#    → creates the app user, folders, secrets, systemd service, nginx site,
#      nightly backup + photo-cleanup cron, and prints the first ADMIN password

# 2. DNS: A record  attendance.jntfire.com -> server IP

# 3. FROM YOUR PC (every deploy): build + upload + restart
SERVER=ubuntu@attendance.jntfire.com bash deploy/update.sh

# 4. ON THE SERVER (once, after DNS resolves): free HTTPS
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d attendance.jntfire.com
```

Copy `deploy/install.sh` to the server first (`scp deploy/install.sh user@host:`).

## Option B: Vercel (no server to manage)

Vercel has no writable disk, so the app needs a managed database and Blob storage there.
All of that is already supported; only the setup differs.

> **Licence:** Vercel's Hobby (free) plan is for non-commercial use. A client installation needs
> **Pro (~$20/month)**. For the lowest running cost, the VPS path above is cheaper (~₹400–700/month)
> — use Vercel when you prefer zero server maintenance, or for a free demo on your own account.

1. **Git repo** (Vercel deploys from one):
   ```bash
   cd site-attendance
   git init && git add -A && git commit -m "Site attendance"
   gh repo create site-attendance --private --source=. --push
   ```
2. **Import the repo** at vercel.com → New Project. Framework is detected automatically.
3. **Add a PostgreSQL database** (Storage tab → Neon, free tier is enough). It sets `DATABASE_URL`.
   Use the **pooled** connection string.
4. **Add a Blob store** (Storage tab → Blob). It sets `BLOB_READ_WRITE_TOKEN`; photos and the
   uploaded logo then go to Blob storage instead of the disk.
5. **Environment variables** (Project → Settings → Environment Variables):
   | Name | Value |
   |---|---|
   | `AUTH_SECRET` | `openssl rand -hex 32` |
   | `ADMIN_PASSWORD` | first admin password (used once, while the database is empty) |
   | `CRON_SECRET` | `openssl rand -hex 24` (Vercel Cron sends it automatically) |
   | `SEED_DEMO` | `0` |
   | `AUTO_MIGRATE` | `0` (migrations run in the build step) |
   | `NEXT_PUBLIC_APP_NAME` | e.g. `JNT Site Attendance` |
6. **Deploy.** The build runs `vercel-build` = migrations + `next build`. `vercel.json` adds the
   daily photo-cleanup cron. Set the function region to **Mumbai (bom1)** in
   Project → Settings → Functions, and pick the database region closest to it.
7. **Domain:** Project → Domains → add `attendance.jntfire.com` and create the CNAME it shows.
   HTTPS is automatic.

Notes for Vercel:
- The login rate limiter is per instance (in memory), so it is weaker than on a single server.
- Photo/logo reads go through the app, so Blob files are never exposed by a public URL.
- Each deploy runs migrations against the production database — check `drizzle/` changes before deploying.

## Server requirements

- Ubuntu 22.04 / 24.04 (x86 or ARM), 1 vCPU, **1 GB RAM minimum** (2 GB comfortable), 10 GB disk
- Node.js 20.9+ (22 LTS recommended)
- A (sub)domain pointing to the server, ports 80 and 443 open
- **HTTPS is mandatory** — phones only allow camera and GPS on HTTPS

Do **not** host it on an office PC: field staff punch from sites, and the app must be reachable
when office power or internet is down.

### Which database?

- **Built-in (PGlite)** — leave `DATABASE_URL` empty. Nothing else to install. Good for up to ~100 users.
- **PostgreSQL** — set `DATABASE_URL`. Recommended above ~100 users, or when this becomes part of the ERP.
  `sudo apt install postgresql` on the same server costs nothing extra.

---

## 1. Build (on your PC)

```bash
npm ci
npm run build          # creates .next/standalone (≈100 MB) ready to upload
```

The app has no native modules, so a build made on Windows runs on a Linux x86 or ARM server.
Building on a 1 GB server can run out of memory; build on your PC, or add 2 GB swap on the server.

## 2. Prepare the server (once)

```bash
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx
sudo npm install -g npm   # optional

# app user + folders
sudo useradd --system --home /opt/site-attendance --shell /usr/sbin/nologin siteapp
sudo mkdir -p /opt/site-attendance /var/lib/site-attendance /var/backups/site-attendance
sudo chown -R siteapp:siteapp /opt/site-attendance /var/lib/site-attendance
```

Environment file `/etc/site-attendance.env` (copy from `.env.example`):

```bash
sudo cp .env.example /etc/site-attendance.env
sudo nano /etc/site-attendance.env     # set AUTH_SECRET, ADMIN_PASSWORD, CRON_SECRET, SEED_DEMO=0
sudo chmod 600 /etc/site-attendance.env
```

Generate secrets with `openssl rand -hex 32`.

## 3. Upload and start

From your PC:

```bash
rsync -az --delete .next/standalone/ user@SERVER:/tmp/site-attendance/
```

On the server:

```bash
sudo rsync -a --delete /tmp/site-attendance/ /opt/site-attendance/
sudo chown -R siteapp:siteapp /opt/site-attendance
```

Service `/etc/systemd/system/site-attendance.service`:

```ini
[Unit]
Description=Site Attendance
After=network.target postgresql.service

[Service]
User=siteapp
WorkingDirectory=/opt/site-attendance
EnvironmentFile=/etc/site-attendance.env
Environment=NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
MemoryMax=700M

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now site-attendance
journalctl -u site-attendance -f     # first start creates tables + ADMIN user
```

Database tables are created/updated automatically on every start.

## 4. Nginx + free SSL

`/etc/nginx/sites-available/site-attendance`:

```nginx
server {
    server_name attendance.jntfire.com;
    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        # $remote_addr (not $proxy_add_x_forwarded_for) so clients cannot fake their IP for the login limiter
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/site-attendance /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d attendance.jntfire.com     # auto-renews
```

DNS: add an **A record** `attendance` → server public IP at the domain provider.

## 5. Daily jobs (cron)

`sudo crontab -e`:

```cron
# 02:00 backup (PGlite: stop for ~5 s so the copy is consistent)
0 2 * * * systemctl stop site-attendance && tar czf /var/backups/site-attendance/sa-$(date +\%F).tgz -C /var/lib/site-attendance pglite && systemctl start site-attendance
# PostgreSQL instead:  0 2 * * * sudo -u postgres pg_dump site_attendance | gzip > /var/backups/site-attendance/sa-$(date +\%F).sql.gz

# keep 14 days of backups
30 2 * * * find /var/backups/site-attendance -type f -mtime +14 -delete

# 03:00 delete photos older than the retention set in Settings
0 3 * * * curl -s -X POST -H "Authorization: Bearer CRON_SECRET_HERE" http://127.0.0.1:3000/api/cron/cleanup
```

Off-site copy (free Google Drive, 15 GB): `sudo apt install rclone`, `rclone config` (create remote `gdrive`), then
`0 4 * * * rclone copy /var/backups/site-attendance gdrive:site-attendance-backups`.

Photos are not in the backup by default (they expire anyway). Add `files` to the `tar` command to include them.

## 6. Updating

Build on your PC → `rsync` the new `.next/standalone` → `sudo systemctl restart site-attendance`.
Schema changes are applied automatically at start.

## 7. First-time setup in the app

1. Open `https://attendance.jntfire.com` → log in as `ADMIN` with `ADMIN_PASSWORD` → set a new password.
2. **Settings** → company name, brand colour, fence rule, shift rules, holidays.
3. **Projects & sites** → create each project, then its sites (stand at the site and press
   “Use my current location”, or click the map) and set the radius.
4. **Staff & logins** → create users, assign sites, set salary/wage (used for project costing).
5. **Contractors & labour** → add contractors and paste their labour list.

## 7b. Go-live checklist

- [ ] HTTPS works (`https://…` with a valid padlock) — camera and GPS need it
- [ ] Logged in as ADMIN and changed the generated password
- [ ] `SEED_DEMO=0` in `/etc/site-attendance.env` (install.sh sets this) — no demo users in the database
- [ ] Real projects and sites created, each geofence set **standing at the site** and radius checked
- [ ] Staff created with site access, salary/wage filled (needed for project cost)
- [ ] Contractors and their labour lists added
- [ ] Rules set: shift times per site, grace minutes, full/half day, OT, weekly off, holidays
- [ ] One real test punch from a supervisor's phone at a real site, and one labour sheet
- [ ] Backup ran once (`sudo /usr/local/bin/site-attendance-backup`) and the file exists in `/var/backups/site-attendance`
- [ ] Restore tested once on a spare folder, so the backup is known to be usable
- [ ] Everyone installed the app on their phone and allowed Location + Camera

## 8. Installing on phones

- **Android (Chrome):** open `https://…/w`, log in, tap **Install app** (or ⋮ → *Add to Home screen*).
- **iPhone (Safari):** Share → *Add to Home Screen*.
- Allow **Location** and **Camera** when asked. Open the app once with internet — after that punches work offline.

## Oracle Cloud Always Free notes

- Create an *Ampere A1* (ARM) or *E2.1.Micro* VM with Ubuntu. Node.js runs fine on ARM.
- Open ports 80/443 in the VCN security list **and** on the VM:
  `sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT && sudo netfilter-persistent save`
- Oracle may reclaim *idle* Always Free VMs. Upgrading the account to Pay-As-You-Go (still ₹0 within free limits) avoids that.

## Troubleshooting

| Problem | Fix |
|---|---|
| `AUTH_SECRET must be set` on start | Add a 32+ character `AUTH_SECRET` to the env file |
| Camera/GPS not working on phone | Site must be opened over **https** |
| Admin locked out | Stop the service. In a copy of the project on the server (`npm ci`), load the same env (`set -a; . /etc/site-attendance.env; set +a`) and run `npm run user:reset-password -- ADMIN "NewPass@123"`. Start the service. |
| `Database is locked` with PGlite | Only one process may open PGlite — stop the service before running scripts |
