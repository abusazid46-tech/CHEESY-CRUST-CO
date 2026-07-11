# Cheesy Crust Co. Mobile

Expo React Native Android app for the Cheesy Crust Co. Hostinger backend.

## API

The app uses:

```text
https://whitesmoke-jay-438498.hostingersite.com/api/v1
```

## Included MVP

- Email/mobile and password login/register
- Live menu from Hostinger MySQL backend
- Cart with quantity controls
- Delivery and takeaway checkout
- Delivery PIN restriction for `788001`, `788002`, `788003`, `788004`, `788005`
- Razorpay checkout through WebView
- Order history
- Table booking
- Loading, empty, error, retry and payment-failure states

## Run

```bash
npm install
npm run android
```

For a production Android artifact, use EAS Build after configuring the Expo account:

```bash
npx eas build -p android --profile preview
```
