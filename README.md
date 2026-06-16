# Telegram MTProto Proxy List

A static web app that fetches **live working Telegram MTProto proxy links** from open-source repositories on GitHub.

## ✨ Features

- 🔗 Fetches real, verified MTProto proxies from multiple public sources
- 🔍 Search & filter by protocol mode (Normal / `dd` Secure / `ee` Fake-TLS)
- 📱 One-click open in Telegram
- 📋 Copy any link to clipboard
- 🔄 Manual refresh + auto-fallback to mirror sources if one fails
- 🎨 Modern, responsive UI built with React + Tailwind CSS
- 📦 Single-file build — entire app inlined into one `index.html`

## 🚀 Deploy to GitHub Pages

### Option 1: Automatic (GitHub Actions)

1. **Fork** or push this repo to your GitHub account
2. Go to **Settings → Pages**
3. Under **Source**, select **GitHub Actions**
4. Push to `main` or `master` — the included workflow (`.github/workflows/deploy.yml`) will build and deploy automatically
5. Your site will be live at `https://<your-username>.github.io/<repo-name>/`

### Option 2: Manual Deploy

```bash
npm install
npm run build
# Upload the contents of dist/ to any static host
```

The build output is a single self-contained `dist/index.html` — easy to host anywhere (GitHub Pages, Cloudflare Pages, Netlify, Vercel, etc.).

## 🛠️ Local Development

```bash
npm install
npm run dev      # start dev server
npm run build    # production build to dist/
npm run preview  # preview the production build
```

## 📡 Data Sources

| Source | Update Frequency | Notes |
|---|---|---|
| [SoliSpirit/mtproto](https://github.com/SoliSpirit/mtproto) | Every 12h | 199+ verified proxies |
| [shablin/mtproto-proxy](https://github.com/shablin/mtproto-proxy) | Every 2h | Latency-tested |

All data is fetched **client-side** from `raw.githubusercontent.com` (which has CORS enabled). No backend required.

## 🔒 Privacy

- All fetching happens in your browser
- No analytics, no tracking, no backend
- The app is just an HTML file — fully auditable

## 📝 License

MIT — use it however you like.
