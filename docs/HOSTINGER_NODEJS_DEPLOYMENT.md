# Hostinger Node.js Deployment

Use `backend-node` for Hostinger Node.js hosting. The older `backend` folder is the previous Python/FastAPI implementation and should be treated as legacy unless you deploy on a Python-capable VPS.

## App Settings

In Hostinger, create a Node.js app with:

- Application root: `backend-node`
- Startup file: `src/server.js`
- Node version: `18` or newer
- Start command: `npm start`

## Environment

Copy `backend-node/.env.example` to Hostinger environment variables, or create a `.env` file inside `backend-node` if your Hostinger plan allows it.

Required values:

```bash
MONGODB_URI=
MONGODB_DB_NAME=cheesy_crust
JWT_SECRET=
ADMIN_JWT_SECRET=
ADMIN_EMAIL=
ADMIN_PASSWORD=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
CORS_ORIGINS=https://whitesmoke-jay-438498.hostingersite.com
```

## Install And Start Over SSH

```bash
cd /path/to/CHEESY-CRUST-CO/backend-node
npm install --omit=dev
npm start
```

For Hostinger's panel-managed Node.js app, run install from the panel if available, then restart the app.

## Frontend API URL

Point the frontend API base to the Hostinger Node API:

```html
<script>
  window.API_BASE_URL = "https://whitesmoke-jay-438498.hostingersite.com/api/v1";
  window.ADMIN_API_BASE = "https://whitesmoke-jay-438498.hostingersite.com/api/v1";
</script>
```

Place this before `frontend/js/api.js` and before `frontend/admin/js/admin-api.js`, or update those JS files directly once the final API domain is known.

## Razorpay

In Razorpay Dashboard:

- Use the live key ID and secret in Hostinger env.
- Webhook URL: `https://whitesmoke-jay-438498.hostingersite.com/api/v1/payment/webhook`
- Webhook secret: same value as `RAZORPAY_WEBHOOK_SECRET`
- Subscribe to payment captured, payment failed, and refund events.

## Smoke Checks

```bash
curl https://whitesmoke-jay-438498.hostingersite.com/health
curl https://whitesmoke-jay-438498.hostingersite.com/api/v1/menu
```

Expected health response includes:

```json
{
  "status": "healthy",
  "database": "connected",
  "runtime": "nodejs"
}
```
