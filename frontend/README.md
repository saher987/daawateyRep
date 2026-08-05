# frontend

React + Vite + TypeScript SPA. Will later be wrapped with Capacitor for iOS/Android.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Environment variables

Firebase web config is injected via `VITE_FIREBASE_*` env vars — see `.env.example`
once it's added. Never commit `.env.staging` / `.env.production`.
