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
DATA_KEY="$(openssl rand -base64 32)"
CRON_SECRET="$(openssl rand -hex 24)"
APP_URL="https://YOUR-DOMAIN-HERE"
EOF
chown dreamhive:dreamhive .env && chmod 600 .env
```

- `AUTH_SECRET` signs everyone's logins. Don't share it. If you change it later,
  everyone is logged out.
- `DATA_KEY` encrypts members' NID numbers, addresses and nominee details. **Keep a
  copy somewhere safe off the server** (with your backups): without it, those
  fields can't be read after a restore.
- `APP_URL` goes into the QR code on every receipt. Replace `YOUR-DOMAIN-HERE`.
- `CRON_SECRET` lets the jobs timer (step 9) run the scheduled jobs.

WhatsApp, SMS and push notifications are optional and added later: see
[WhatsApp](#whatsapp-login-codes-passwords-and-reminders),
[Push notifications](#push-notifications) and the [Android app](#android-app-google-play).

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

Turn on the scheduled jobs (vote deadlines, due reminders, FDR maturity reminders,
the nominee check, notifications), every 15 minutes:

```bash
cp deploy/dreamhive-jobs.service deploy/dreamhive-jobs.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now dreamhive-jobs.timer
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

Back up at 2:30 every night. Daily backups are kept 30 days, and the first backup
of every month is kept 7 years (in `/var/backups/dreamhive/monthly`):

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
2. **Settings:** society name, reminder day, first month, where members should
   send money, the second-admin limit, and your own WhatsApp number (for the
   login code). The monthly deposit is set there too; a change applies from a
   future month only.
3. **Accounts & ledger:** add each account the society keeps money in (bank,
   bKash/Nagad, cash in hand) with only its last 4 digits, and its balance on the
   day you start using the app.
4. **Enter past amounts** (deposits with *Record payment*, expenses, income)
   before using *Close month* — a closed month is locked.
5. **Members → Add member** for each member, with their nominee. With WhatsApp
   connected the temporary password is sent automatically; otherwise use the
   *Send it on WhatsApp yourself* button. Members log in with their mobile number
   and set their own password.
6. Tell members to open the site on their phone and choose **Add to Home Screen**
   (or install the Android app, below), then turn on notifications from the bell.

## Updating to a new version

When new changes are merged on GitHub, run:

```bash
sudo /opt/dreamhive/savings-society/deploy/update.sh
```

It backs up first, then downloads the new code, updates the database, rebuilds
and restarts. The app is unavailable for the minute or two the build takes.

**Upgrading from the first version (before the ledger):** the same command does
it. After the database update, `prisma/upgrade.ts` runs once and turns the old
records into the new books: the old account list becomes society accounts, FDRs
become FDR accounts, multi-month payments become one payment per month, every
approved payment gets its receipt, every past deposit, expense, income,
investment and payout goes on the ledger, each member's share of past costs and
profits is worked out, and NID and nominee details are encrypted. Afterwards,
check *Accounts & ledger*: the upgrade puts expenses, income and investments on
the first bank account and deposits on the account matching their method, so
move money between accounts there if your real balances differ. Add a `DATA_KEY`
to `.env` (step 7) before upgrading; if you don't, a key is derived from
`AUTH_SECRET`, so don't change `AUTH_SECRET` afterwards.

## WhatsApp: login codes, passwords and reminders

The app sends four WhatsApp template messages through Meta's WhatsApp Business
Platform (Cloud API): `login_code` (authentication: the 6-digit admin login
code, with a copy-code button), `temp_password` (authentication), `payment_due`
and `payment_rejected` (utility).

1. In [Meta Business Suite](https://business.facebook.com) create a business
   account (registered in Bangladesh), then a WhatsApp app at
   [developers.facebook.com](https://developers.facebook.com), and add the
   society's phone number.
2. Create the four templates with exactly those names and these bodies, and wait
   for Meta to approve them:
   - `login_code`: Meta's authentication template, with a copy-code button.
   - `temp_password`: `Hi {{1}}, your Dreamhive temporary password is {{2}}. Log in with your mobile number and set your own password.`
   - `payment_due`: `Hi {{1}}, your Dreamhive deposit for {{2}} of {{3}} is due. Please pay and upload the proof in the app.`
   - `payment_rejected`: `Hi {{1}}, your Dreamhive payment for {{2}} was not approved: {{3}}. Please submit it again in the app.`
3. Create a permanent access token (a System User token with
   `whatsapp_business_messaging`) and note the phone number ID.
4. Add to `.env`, then `systemctl restart dreamhive`:

   ```bash
   WHATSAPP_TOKEN="EAAG…"
   WHATSAPP_PHONE_NUMBER_ID="1234567890"
   ```

From then on, admins with a WhatsApp number in *Settings → My account* get a
login code, new members and password resets get their temporary password, the
reminder day sends `payment_due`, and a rejected payment sends
`payment_rejected`. Every message is logged with its WhatsApp message ID (for
cost tracking); *Settings → Connections* shows what is connected.

**SMS fallback:** if WhatsApp fails twice or isn't set up, the app sends an SMS
through any gateway that takes a URL. Set
`SMS_GATEWAY_URL="https://your-sms-provider/send?key=…&to={to}&msg={text}"`
(`{to}` and `{text}` are filled in; add `SMS_GATEWAY_METHOD="POST"` if it needs POST).

## Push notifications

Members get a push for approvals, rejections, receipts, votes, withdrawals and
notices once they tap *Turn on notifications* in the app. Create the keys once
with `sudo -u dreamhive npx web-push generate-vapid-keys` in the app folder, add
them to `.env`, then restart:

```bash
VAPID_PUBLIC_KEY="…"
VAPID_PRIVATE_KEY="…"
VAPID_SUBJECT="mailto:treasurer@example.com"
```

Push works on Android in Chrome and in the Android app, and on iPhones (iOS
16.4+) once the app has been added to the home screen.

## Android app (Google Play)

The member app is published to Google Play as a Trusted Web Activity: an
Android app that opens the website full-screen, with its own icon and push
notifications. You build it once with Google's Bubblewrap tool on any computer
with Node.js and Java:

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://YOUR-DOMAIN-HERE/manifest.json
#   package name, e.g. org.dreamhive.app — it creates a signing key: keep it safe
bubblewrap build                     # makes app-release-bundle.aab (and an .apk to test)
bubblewrap fingerprint list          # the SHA-256 fingerprint of your key
```

Add the package name and fingerprint to the server's `.env` (with Play App
Signing on, also add the fingerprint from Play Console → App integrity,
comma-separated), then restart:

```bash
ANDROID_PACKAGE="org.dreamhive.app"
ANDROID_SHA256="AB:CD:…"
```

Check that `https://YOUR-DOMAIN-HERE/.well-known/assetlinks.json` shows them,
then upload the `.aab` in the Play Console. The store listing needs the privacy
policy link, `https://YOUR-DOMAIN-HERE/privacy`. Account deletion, which Play
requires, is in the app under *My profile → Delete my account*.

## When something goes wrong

| Problem | What to do |
|---|---|
| Site doesn't load | `systemctl status dreamhive` and `journalctl -u dreamhive -n 100` show the app's errors. |
| No padlock / certificate error | DNS isn't pointing at the server yet (step 2), or ports 80/443 are blocked. `journalctl -u caddy -n 50` shows why. |
| Build runs out of memory | Check swap is on: `swapon --show` (step 4). |
| "Account locked" | 5 wrong passwords lock an account for 15 minutes. The admin can unlock a member early on their page. |
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

The restored database needs the same `DATA_KEY` (and `AUTH_SECRET`) as before;
they're in `.env`, and in the copy you kept from step 7.
