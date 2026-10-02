# Putting Dreamhive online (VPS)

This guide takes you from "I have a domain and a VPS" to the app running at
`https://your-domain` with HTTPS and nightly backups. Plan about an hour.
You copy and paste each command into the server's terminal.

Throughout, replace:

- `dreamhive.example.com` with your domain (or subdomain)
- `203.0.113.10` with your VPS's IP address

The layout on the server:

| What | Where |
|---|---|
| The app's code | `/opt/dreamhive/savings-society` |
| Database and uploaded files | `/var/lib/dreamhive` (the society's records: back this up) |
| Nightly backups | `/var/backups/dreamhive` |

---

## 1. Buy the domain and the VPS

**Domain:** any registrar works (Namecheap, Cloudflare, Porkbun, or a `.com.bd`
from a local registrar). You can also use a subdomain of a domain you already
own, e.g. `dreamhive.yoursite.com`.

**VPS:** DigitalOcean, Hetzner, Vultr, Linode or a local provider. Choose:

- **Ubuntu 24.04 LTS**
- At least **1 GB RAM**, 1 CPU, 25 GB disk (about $5–6 a month is enough for a society of 24)
- A region close to your members (Singapore or Mumbai for Bangladesh)
- Log in with an **SSH key** if the provider offers it; otherwise a strong root password

Write down the server's **IP address**.

## 2. Point the domain at the server

In your domain registrar's DNS settings, add an **A record**:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `dreamhive` (for `dreamhive.yoursite.com`) or `@` (for the bare domain) | `203.0.113.10` | Automatic / 300 |

If you use Cloudflare, set the record to **DNS only** (grey cloud) for now.

DNS can take from a few minutes to a few hours. Check it from your own computer:

```bash
ping dreamhive.example.com
```

When it replies from your server's IP, you're ready for step 9. Carry on with the
next steps meanwhile.

## 3. Log in to the server

From your computer (Windows: PowerShell; Mac/Linux: Terminal):

```bash
ssh root@203.0.113.10
```

Everything from here runs on the server.

## 4. Prepare the server

Update it, set the time zone, and turn on automatic security updates:

```bash
apt update && apt upgrade -y
timedatectl set-timezone Asia/Dhaka
apt install -y unattended-upgrades && dpkg-reconfigure -f noninteractive unattended-upgrades
```

Add 2 GB of swap, so building the app doesn't run out of memory on a 1 GB server:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Turn on the firewall, allowing only SSH and the web:

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 5. Install Node.js, Git, SQLite and Caddy

```bash
# Node.js 22 (LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git sqlite3

# Caddy (web server that handles HTTPS automatically)
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

node --version   # should print v22.x
```

## 6. Create the app's user and folders, and download the code

The app runs as its own user, `dreamhive`, which can't log in.

```bash
useradd --system --create-home --home-dir /home/dreamhive --shell /usr/sbin/nologin dreamhive
mkdir -p /opt/dreamhive /var/lib/dreamhive/storage /var/backups/dreamhive
chown dreamhive:dreamhive /opt/dreamhive /var/lib/dreamhive /var/lib/dreamhive/storage
chmod 700 /var/lib/dreamhive /var/backups/dreamhive

sudo -u dreamhive git clone https://github.com/shiblijoy/Partition.git /opt/dreamhive
```

> **Private repository?** GitHub will ask for a username and password. Use your
> GitHub username and a **personal access token** (GitHub → Settings → Developer
> settings → Fine-grained tokens, with read access to this repository's contents)
> as the password.
>
> **PR not merged yet?** Add `-b claude/artifact-session-oesyel` to the clone
> command to use the branch, and later run updates with
> `BRANCH=claude/artifact-session-oesyel`.

## 7. Configure the app

This writes the settings file with a fresh random secret:

```bash
cd /opt/dreamhive/savings-society
cat > .env <<EOF
DATABASE_URL="file:/var/lib/dreamhive/dreamhive.db"
STORAGE_DIR="/var/lib/dreamhive/storage"
AUTH_SECRET="$(openssl rand -hex 32)"
EOF
chown dreamhive:dreamhive .env && chmod 600 .env
```

`AUTH_SECRET` signs everyone's logins. Don't share it. If you change it later,
everyone is logged out.

## 8. Install, create the database and the first admin, and build

Change the four values in the third command first:

- `SEED_ADMIN_NAME`: the treasurer's name
- `SEED_ADMIN_EMAIL`: the email the admin logs in with
- `SEED_ADMIN_PASSWORD`: a temporary password (the app asks for a new one at first login)
- `SEED_START_MONTH`: the society's first deposit month, as `YYYY-MM`

```bash
cd /opt/dreamhive/savings-society
sudo -u dreamhive -H bash -c "npm ci && npx prisma migrate deploy"

sudo -u dreamhive -H env SEED_DEMO=0 \
  SEED_ADMIN_NAME="Treasurer Name" \
  SEED_ADMIN_EMAIL="treasurer@example.com" \
  SEED_ADMIN_PHONE="01700000000" \
  SEED_ADMIN_PASSWORD="Temporary123" \
  SEED_START_MONTH="2026-01" \
  bash -c "npx tsx prisma/seed.ts"

sudo -u dreamhive -H bash -c "npm run build"
```

The seed prints `Skipping demo data.` and `Seed complete.` — no demo members are
created. The build takes a few minutes.

## 9. Start the app and turn on HTTPS

Start the app as a service (it restarts by itself after a crash or reboot):

```bash
cp deploy/dreamhive.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now dreamhive
systemctl status dreamhive --no-pager    # should say "active (running)"
```

Point Caddy at it. Put your domain in the Caddyfile, then reload:

```bash
sed "s/dreamhive.example.com/YOUR-DOMAIN-HERE/" deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl reload caddy
```

Once DNS from step 2 points at the server, Caddy gets an HTTPS certificate on
its own within a minute. Open **`https://your-domain`** in a browser: you should
see the Dreamhive login page with a padlock.

## 10. Set up nightly backups

Back up at 2:30 every night, keeping 30 days:

```bash
echo '30 2 * * * root /opt/dreamhive/savings-society/deploy/backup.sh >> /var/log/dreamhive-backup.log 2>&1' > /etc/cron.d/dreamhive-backup
/opt/dreamhive/savings-society/deploy/backup.sh     # run one now to check
ls -lh /var/backups/dreamhive
```

**Keep a copy off the server too** — if the VPS is lost, so are backups stored on
it. The simplest way, from your own computer, once a week:

```bash
scp root@203.0.113.10:/var/backups/dreamhive/*.tar.gz ~/dreamhive-backups/
```

(For automatic copies to Google Drive or Dropbox, install `rclone` on the server
and add an `rclone copy /var/backups/dreamhive remote:dreamhive` line to the cron
file.) Many VPS providers also sell automatic whole-server backups for about
$1 a month; turning that on is a good extra safety net.

## 11. First login and setting up the society

1. Open `https://your-domain` and log in with the admin **email** and temporary
   password from step 8. Set your own password.
2. **Settings:** society name, monthly deposit, reminder day, first month,
   where members should send money, and the society's accounts.
3. **Enter past amounts** (deposits, expenses, income) before using
   *Close month* — a closed month is locked.
4. **Members → Add member** for each member. Send each one their invite with the
   *Send invite on WhatsApp* button. Members log in with their mobile number and
   set their own password.
5. Tell members to open the site on their phone and choose **Add to Home Screen**.

## Updating to a new version

When new changes are merged on GitHub, run:

```bash
sudo /opt/dreamhive/savings-society/deploy/update.sh
```

It backs up first, then downloads the new code, updates the database, rebuilds
and restarts. The app is unavailable for the minute or two the build takes.

## When something goes wrong

| Problem | What to do |
|---|---|
| Site doesn't load | `systemctl status dreamhive` and `journalctl -u dreamhive -n 100` show the app's errors. |
| No padlock / certificate error | DNS isn't pointing at the server yet (step 2), or ports 80/443 are blocked. `journalctl -u caddy -n 50` shows why. |
| Build runs out of memory | Check swap is on: `swapon --show` (step 4). |
| Admin forgot the password | Another admin resets it in *Settings*. With only one admin, run on the server: `cd /opt/dreamhive/savings-society && sudo -u dreamhive -H env SEED_DEMO=0 SEED_ADMIN_EMAIL=new@example.com SEED_ADMIN_PHONE=01700000001 SEED_ADMIN_PASSWORD=Temporary123 npx tsx prisma/seed.ts` to add a new admin, then log in with it. |

### Restoring from a backup

```bash
systemctl stop dreamhive
mkdir -p /tmp/restore && tar -xzf /var/backups/dreamhive/dreamhive-YYYY-MM-DD-HHMM.tar.gz -C /tmp/restore
cp /var/lib/dreamhive/dreamhive.db /var/lib/dreamhive/dreamhive.db.before-restore
cp /tmp/restore/dreamhive.db /var/lib/dreamhive/dreamhive.db
cp -a /tmp/restore/storage/. /var/lib/dreamhive/storage/
chown -R dreamhive:dreamhive /var/lib/dreamhive
systemctl start dreamhive
```
