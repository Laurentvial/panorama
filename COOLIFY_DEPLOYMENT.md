# Coolify Deployment (VPS)

This guide covers deploying the full Panorama stack (backend, frontend, PostgreSQL, cron jobs) on a self-hosted VPS using [Coolify](https://coolify.io/).

## Prerequisites

- VPS provider account (e.g. [Kyun](https://kyun.sh))
- Domain name (e.g. `yourdomain.com` for frontend, `api.yourdomain.com` for backend)
- SSH key for server access

## 0. VPS Provider

This guide uses [Kyun](https://kyun.sh), a privacy-focused VPS provider that accepts **crypto** (Monero, Bitcoin, Lightning), fiat, and cash—no card required. Coolify works on any Ubuntu VPS.

| Provider | Payment methods | Example plan |
|----------|-----------------|--------------|
| **[Kyun](https://kyun.sh)** | **Crypto** (Monero, Bitcoin, Lightning), fiat, cash | 4 vCPU, 4 GB RAM, 50 GB SSD |

If Ubuntu isn't a template option, install manually from [Ubuntu 24.04 ISO](https://ubuntu.com/download/server) (see Manual Ubuntu install below).

## 1. VPS Provisioning

### Recommended sizing

| Workload | RAM | CPU | Storage | Cost (approx) |
|----------|-----|-----|---------|---------------|
| Light usage | 2 GB | 2 | 30 GB | ~$5–12/mo |
| Production | 4 GB | 2 | 50 GB | ~$5–24/mo |
| 10+ apps + DB | 8 GB | 4 | 100 GB | ~$12–48/mo |

### Create server (provider-agnostic)

1. Sign up at your provider (e.g. [Kyun](https://kyun.sh))
2. Create a **VPS / Cloud Server** (not a managed service)
3. Choose **Ubuntu 24.04 LTS** (or install manually from ISO if your provider offers only bare VPS—see below)
4. Select plan (4 GB RAM, 50 GB SSD recommended for full stack)
5. Add SSH key
6. Choose region (closest to users)
7. Create server

### Manual Ubuntu install (e.g. Kyun, bare VPS)

If your provider doesn't offer Ubuntu as a template, you can install it manually:

1. Download [Ubuntu 24.04 LTS Server ISO](https://ubuntu.com/download/server)
2. Mount the ISO in your VPS control panel (KVM/console) and boot from it
3. **GRUB menu**: Choose **Try or Install Ubuntu Server** (first option)
4. **Boot device** (SeaBIOS): If prompted, select the DVD/CD with Ubuntu (e.g. option 2)
5. Follow the installer: minimal install, SSH server, no desktop
6. Set up a user with sudo access (or use root)
7. **After install**: When you see "Please remove the installation medium, then press ENTER", pressing Enter often does nothing because the ISO is still attached. You must:
   - **Stop** the VM completely (full power off) in Kyun's control panel
   - **Detach/unmount** the ISO from the VM
   - **Start** the VM again
   - The VM will then boot from the hard disk. Rebooting without a full stop keeps the ISO in the boot sequence.
8. Proceed with the Coolify install below

### DNS

Point your domain to the server IP:

- `yourdomain.com` (root) → A record → Server IP (frontend)
- `www.yourdomain.com` → A record or CNAME → Server IP (frontend, optional)
- `api.yourdomain.com` → A record → Server IP (backend)
- `coolify.yourdomain.com` (optional) → A record → Server IP (Coolify dashboard)

**Squarespace DNS** – Add these custom records (replace `YOUR_SERVER_IP` with your VPS IP):

| HOST | TYPE | DATA |
|------|------|------|
| `@` | A | `YOUR_SERVER_IP` |
| `www` | A | `YOUR_SERVER_IP` |
| `api` | A | `YOUR_SERVER_IP` | 
| `coolify` | A | `YOUR_SERVER_IP` | (for Coolify dashboard)

## 2. Install Coolify

SSH into your server:

```bash
ssh root@YOUR_SERVER_IP
```

Run the Coolify installer:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

The installer will:

- Install Docker and supporting packages
- Deploy Coolify and Traefik
- Print the dashboard URL (e.g. `https://coolify-server.example.com` or `http://YOUR_SERVER_IP:8000`)

Complete the first-run wizard in the dashboard (create admin user, etc.).

## 3. Add Server

If Coolify is on a different machine, add this server as a managed server:

1. Coolify → Servers → Add Server
2. Add via SSH (hostname or IP, user, SSH key)
3. Coolify will install Docker and connect

## 4. Create Project

1. Coolify → Projects → Create
2. Name: `panorama`

## 5. Deploy PostgreSQL

1. Project → Add Resource → Database → PostgreSQL
2. Name: `panorama-db`
3. Set password (or use auto-generated)
4. Deploy
5. Wait for healthy status
6. Copy the **Connection URL** (internal) – you'll use it as `DATABASE_URL` for the backend

Example internal URL:

```
postgresql://user:password@panorama-db:5432/postgres
```

### Online database access (remote clients)

To connect from pgAdmin, DBeaver, or your IDE:

**Option A: Public Port (Coolify UI)**

1. Open the PostgreSQL resource in Coolify
2. Go to **Configuration** or **Ports**
3. Enable **Public Port** (or add port mapping `5432`)
4. Coolify will expose the DB; note the host (your server IP or domain) and port
5. Connect with: `Host: yourdomain.com` (or `93.113.25.122`), `Port: 5432`, `User/Password` from the connection URL

**Security**: Restrict access with a firewall (e.g. allow only your IP) or use a strong password. Prefer Option B for production.

**Option B: SSH tunnel (recommended, more secure)**

1. In Coolify, add **Port Mapping** `5432:5432` to the PostgreSQL resource so the host exposes port 5432.
2. From your machine, create an SSH tunnel:
   ```bash
   ssh -L 5433:localhost:5432 your_username@93.113.25.122
   ```
3. In pgAdmin/DBeaver: connect to `localhost:5433` with the DB user/password. Traffic goes through the encrypted SSH tunnel; the DB is never exposed to the internet.

## 6. Deploy Backend

1. Project → Add Resource → Application
2. **Source**: GitHub/GitLab (connect repo) or Public URL
3. **Build Pack**: Dockerfile
4. **Dockerfile path**: `backend/Dockerfile`
5. **Root directory**: `backend` (or leave empty if repo root is the project)
6. **Port**: 8000

### Environment variables

Add these in the project or application environment:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | From PostgreSQL resource (e.g. `postgresql://user:pass@panorama-db:5432/postgres`) |
| `DB_SSL_REQUIRE` | Yes (Coolify) | Set to `false` – Coolify Postgres does not use SSL for internal connections |
| `SECRET_KEY` | Yes | Django secret (generate: `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`) |
| `CRON_SECRET_TOKEN` | Yes | Random token for cron endpoints (e.g. `openssl rand -hex 32`) |
| `BACKEND_PUBLIC_URL` | Yes | Public backend URL (e.g. `https://api.yourdomain.com`) |
| `AWS_ACCESS_KEY_ID` | Yes | S3/MinIO access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | S3/MinIO secret key |
| `AWS_STORAGE_BUCKET_NAME` | Yes | S3/MinIO bucket name |
| `AWS_S3_ENDPOINT_URL` | For MinIO | e.g. `http://minio:9000` |
| `DEBUG` | No | Set to `false` for production |
| `GEMINI_API_KEY` | No | For AI features |
| `ALPHA_VANTAGE_API_KEY` | No | For price refresh |
| `FINNHUB_API_KEY` | No | For price refresh |
| `NEWS_API_KEY` | No | For news |
| `RESEND_API_KEY` | No | For email |
| `RESEND_FROM_EMAIL` | No | Sender email |
| `PRELUDE_API_KEY` | No | For SMS |
| `PRELUDE_TEMPLATE_ID` | No | |
| `PRELUDE_SENDER` | No | |
| `FRONTEND_PUBLIC_URL` | No | e.g. `https://yourdomain.com` |

### Domain and HTTPS

1. Application → Domains
2. Add `api.yourdomain.com`
3. Enable HTTPS (Let's Encrypt)

### Deploy

Trigger build and deploy. The backend will run migrations and collectstatic on startup.

## 7. Deploy Frontend

1. Project → Add Resource → Application
2. **Source**: Same repo
3. **Build Pack**: Dockerfile
4. **Dockerfile path**: `frontend/Dockerfile`
5. **Root directory**: `frontend`
6. **Port**: 80

### Build arguments

Set `VITE_URL` (or `VITE_API_URL`) at build time so the frontend knows the API URL:

- `VITE_URL` = `https://api.yourdomain.com`

### Domain and HTTPS

1. Add `yourdomain.com` (root domain)
2. Optionally add `www.yourdomain.com` if you want both
3. Enable HTTPS (Let's Encrypt)

### Deploy

Trigger build and deploy.

## 8. Scheduled Tasks (Cron)

Coolify Scheduled Tasks run `curl` to hit HTTP endpoints. The backend exposes cron endpoints protected by `CRON_SECRET_TOKEN`.

### Create tasks

1. Coolify → Scheduled Tasks (or within the backend application)
2. Add Task 1:
   - **Name**: refresh-prices
   - **Command**: `curl --fail -X POST "http://YOUR_SERVER_IP/api/cron/refresh-prices/?token=YOUR_CRON_SECRET_TOKEN"`
   - **Schedule**: `0 * * * *` (hourly)
3. Add Task 2:
   - **Name**: process-positions
   - **Command**: `curl --fail -X POST "http://YOUR_SERVER_IP/api/cron/process-positions/?token=YOUR_CRON_SECRET_TOKEN"`
   - **Schedule**: `0 0 * * *` (daily at midnight)

Replace `YOUR_CRON_SECRET_TOKEN` with the value you set in the backend env.

**Note**: Coolify runs tasks from the host. Ensure `curl` is available (it usually is on Ubuntu). If `curl` is not found, install it: `apt-get install -y curl`.

### Optional query params for refresh-prices

- `scope`: `product-assets` (default) or `all`
- `limit`: max assets per run (default 20)
- `min_age_seconds`: skip recently updated assets (default 240)

Example:

```
http://YOUR_SERVER_IP/api/cron/refresh-prices/?token=YOUR_TOKEN&limit=20&min_age_seconds=240
```

## 9. Database Migration from Render

If migrating from Render:

1. Export from Render:

   ```bash
   pg_dump "DATABASE_URL_FROM_RENDER" > backup.sql
   ```

2. Import into Coolify PostgreSQL:
   - Coolify → PostgreSQL resource → Terminal
   - Or use `psql` from your machine if the DB is exposed:

   ```bash
   psql "DATABASE_URL_FROM_COOLIFY" < backup.sql
   ```

Alternatively, run migrations on an empty DB and re-seed if acceptable.

## 10. Troubleshooting

### Backend won't start

- Check logs: Coolify → Application → Logs
- Verify `DATABASE_URL` is correct and the DB is reachable from the backend container
- Ensure `SECRET_KEY` and `CRON_SECRET_TOKEN` are set
- Check `/health/` endpoint returns 200

### "server does not support SSL, but SSL was required"

Coolify's PostgreSQL container does not use SSL for internal connections. Add this environment variable to your backend service:

```
DB_SSL_REQUIRE=false
```

Then redeploy.

### Frontend shows wrong API URL

- Rebuild with correct `VITE_URL` build arg
- The API URL is baked in at build time

### Cron tasks fail

- Verify `CRON_SECRET_TOKEN` matches in backend env and curl command
- Test manually: `curl -X POST "http://YOUR_SERVER_IP/api/cron/refresh-prices/?token=YOUR_TOKEN"`
- Check Coolify logs for the scheduled task

### 500 Internal Server Error on /api/clients/

If the Clients page returns `GET /api/clients/ 500 (Internal Server Error)`:

1. **Check backend logs** – Coolify → Backend Application → Logs. The traceback will show the real error (e.g. database, missing table, Cloudinary).

2. **Database configuration** (most common):
   - `DATABASE_URL` must point to the Coolify PostgreSQL internal URL, e.g. `postgresql://user:pass@panorama-db:5432/postgres` (host = your PostgreSQL resource name in Coolify).
   - Set `DB_SSL_REQUIRE=false` – Coolify internal Postgres does not use SSL. Without this, you may see "server does not support SSL, but SSL was required".

3. **Migrations** – If using a fresh Coolify database, run migrations. The backend runs them on startup; if startup fails before that, run manually in Coolify → Backend → Terminal:
   ```bash
   python manage.py migrate
   ```

4. **Migrated database** – If you imported a dump from Render/Scalingo, ensure the import completed successfully and all tables exist.

5. **S3/MinIO** – Ensure `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_STORAGE_BUCKET_NAME` are set. Missing credentials can cause 500 when serializing clients with profile photos.

6. **Quick test** – Call `https://api.yourdomain.com/health/` to confirm the backend is up. Then test `/api/clients/` with a valid JWT in the `Authorization` header.

### CORS errors

- Backend is configured with `CORS_ALLOW_ALL_ORIGINS = True`; if you restrict to specific origins, add `https://yourdomain.com` and `https://www.yourdomain.com` to `CORS_ALLOWED_ORIGINS`

### SSL / HTTPS

- Coolify uses Traefik with Let's Encrypt. Ensure DNS is correct before enabling HTTPS.
- If certificates fail, check Traefik logs and DNS propagation.

## 11. Cost Comparison

| | Render | Coolify on VPS |
|--|--------|----------------|
| Backend | Starter ~$7/mo | Included |
| Frontend | Static ~$0 | Included |
| PostgreSQL | Free tier | Included |
| Cron | Included | Included |
| **Total** | ~$7+/mo, limits | **~$5–24/mo** depending on provider |
