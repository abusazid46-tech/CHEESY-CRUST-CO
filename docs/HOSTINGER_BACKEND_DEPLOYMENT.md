# Legacy Python Backend Deployment

> Current Hostinger target is Node.js. Use `docs/HOSTINGER_NODEJS_DEPLOYMENT.md` and `backend-node` for deployment. This document is kept only for the older Python/FastAPI backend.

This backend is a FastAPI service. Use Hostinger VPS or any Hostinger plan that allows a persistent Python process, systemd, and nginx reverse proxy.

## 1. Server packages

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx git
```

## 2. App folder

```bash
sudo mkdir -p /var/www/cheesy-crust
sudo chown -R $USER:$USER /var/www/cheesy-crust
cd /var/www/cheesy-crust
git clone https://github.com/abusazid46-tech/CHEESY-CRUST-CO.git .
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cp .env.hostinger.example .env
nano .env
```

Fill the real MongoDB, JWT, admin, Razorpay, and CORS values in `.env`.

## 3. systemd service

Create `/etc/systemd/system/cheesy-crust-api.service`:

```ini
[Unit]
Description=Cheesy Crust FastAPI Backend
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/cheesy-crust/backend
EnvironmentFile=/var/www/cheesy-crust/backend/.env
ExecStart=/var/www/cheesy-crust/backend/.venv/bin/gunicorn main:app -c gunicorn_conf.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then run:

```bash
sudo chown -R www-data:www-data /var/www/cheesy-crust
sudo systemctl daemon-reload
sudo systemctl enable --now cheesy-crust-api
sudo systemctl status cheesy-crust-api
```

## 4. nginx reverse proxy

Create `/etc/nginx/sites-available/cheesy-crust-api`:

```nginx
server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/cheesy-crust-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Add SSL with Hostinger panel or Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.your-domain.com
```

## 5. Frontend API URL

Set the frontend API base to the Hostinger API domain:

```html
<script>
  window.API_BASE_URL = "https://api.your-domain.com/api/v1";
  window.ADMIN_API_BASE = "https://api.your-domain.com/api/v1";
</script>
```

Place it before `js/api.js` or `admin/js/admin-api.js`, or update those files directly.

## 6. Razorpay

In Razorpay dashboard:

- Use the live `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in backend `.env`.
- Add webhook URL: `https://api.your-domain.com/api/v1/payment/webhook`.
- Set webhook secret and copy it to `RAZORPAY_WEBHOOK_SECRET`.
- Subscribe to payment captured, failed, and refund events.

## 7. Smoke checks

```bash
curl https://api.your-domain.com/health
curl https://api.your-domain.com/api/v1/menu
sudo journalctl -u cheesy-crust-api -f
```
