# MedGemma Chat — Web UI

A multi-chat web interface for a **MedGemma 4B** API running on a Kaggle GPU notebook behind ngrok, built with **Next.js 14 (App Router, TypeScript)** and deployable on Vercel. The browser never sees the API key: every model call goes through server-side Next.js route handlers (`/api/generate` and `/api/health`), which attach the secret header before proxying to the model.

**Features**

- Multiple named chats, persisted in the browser's `localStorage`
- Markdown-rendered answers (headings, lists, code blocks, tables, blockquotes)
- One-click copy button on assistant messages
- Stop generation midway with a dedicated Stop button
- Dark theme by default, with a light theme toggle
- Keepalive pinger that hits `/api/health` every 30 seconds (configurable) with a status pill showing last-check age
- Fully mobile responsive (sidebar collapses into an overlay drawer)

## How it works (architecture)

```
Browser
  -> Next.js API route (/api/generate, /api/health — Vercel serverless, adds X-API-Key from env)
    -> ngrok HTTPS tunnel
      -> FastAPI server on a Kaggle GPU notebook
        -> MedGemma 4B
```

State lives **only in the browser**: conversations are stored in `localStorage` on the user's device. The remote API keeps **no history** — every request is independent and posts only the current prompt.

## Prerequisites

- **Node 18.18+**
- A running **Kaggle MedGemma server** (see `medgemma-kaggle-api.ipynb` in the parent repo) with a known ngrok URL and API key
- A **Vercel account** (the free Hobby tier works)

## Local development

```bash
cd medgemma-web
npm install
cp .env.example .env.local   # then edit with real values
npm run dev                  # http://localhost:3000
```

`.env.local` is git-ignored and must **never be committed**.

## Deploy to Vercel

1. Push this folder to a Git repo (it can be its own repo).
2. In Vercel, go to **Add New Project** and import the repo. The framework preset auto-detects Next.js; leave the build settings at their defaults.
3. **Before the first deploy** (or right after), open **Project Settings → Environment Variables** and add exactly:
   - `MEDGEMMA_API_URL` — the ngrok base URL (HTTPS), e.g. `https://YOUR-NGROK-ADDRESS.ngrok-free.app`
   - `MEDGEMMA_API_KEY` — the same key printed by the Kaggle notebook

   Scope them to **Production + Preview**. Do **not** use a `NEXT_PUBLIC_` prefix — the values must stay server-side.
4. Deploy. After any ngrok restart, just update `MEDGEMMA_API_URL` and redeploy (or use a custom domain). Note that changing an environment variable alone requires a redeploy to take effect.

## Keepalive pinger

While any browser tab of the app is open, it sends a `GET /api/health` request every **30 seconds** (adjustable in the Settings dialog, 10–300 s). The route proxies the check to the model's `/health` endpoint with the secret key. This keeps the FastAPI/ngrok path warm and immediately tells you if the Kaggle session died — the status pill turns red.

Honest caveats:

- **The pinger only runs while a tab is open.** Vercel Hobby cron jobs cannot run every 30 s (the minimum is daily), so for true background pinging use an external service such as [cron-job.org](https://cron-job.org) or UptimeRobot hitting `https://YOUR-APP.vercel.app/api/health`.
- **Kaggle may still stop idle sessions on its own policy.** The pinger helps, but it is not a guarantee.
- **Free ngrok URLs change on restart.** Update `MEDGEMMA_API_URL` and redeploy; until then the status pill will show the app as offline.

## Timeouts and serverless limits

`app/api/generate/route.ts` sets `maxDuration = 300` seconds. On Vercel Hobby, the effective limit is **60 s** unless Fluid compute is enabled; if a deploy complains, or generations over ~55 s get cut off, lower that constant to `60` or upgrade to Pro.

Also note medical-grade latency: generating 512 tokens can take **30–90 s** on a T4 GPU. The UI shows a typing indicator and a Stop button during generation.

## Security notes

- The API key exists only in server environment variables — it is never included in the client bundle (verify: nothing in the app uses `NEXT_PUBLIC_`).
- `/api/health` is unauthenticated by design and returns only non-sensitive model info; do not add secret checks to it.
- Conversations are stored in the user's browser only (`localStorage`). Clearing site data wipes them. There is no server-side database.
- The app never uploads files and never sends past messages automatically. Every request posts only the single current prompt, matching the API's stateless design.
- HTTPS is enforced and TLS verification is never disabled.

## Troubleshooting

| Status pill | Meaning | Fix |
| --- | --- | --- |
| Red — "401 / unauthorized" | The API key sent to the model is wrong or missing | Check `MEDGEMMA_API_KEY` in `.env.local` (local) or Vercel env vars; redeploy after changing |
| Red — "404 / not found" | The ngrok URL changed or the tunnel is gone | Restart the notebook's ngrok cell, copy the new URL, update `MEDGEMMA_API_URL`, redeploy |
| Red — "500 / not configured" | Env vars are missing on the server | Add `MEDGEMMA_API_URL` and `MEDGEMMA_API_KEY` in Vercel Project Settings → Environment Variables, then redeploy |
| Amber — "checking" | A health check is in flight | Wait a few seconds; it should resolve to green or red |
| Green then cut off mid-generation | Request exceeded the serverless time limit | Lower `maxDuration` to `60` on Hobby, or upgrade to Pro; long generations (~90 s for 512 tokens) may need a smaller `max_tokens` |
| Red and stays red even with correct config | The Kaggle session is dead | Restart the Kaggle notebook, get the new ngrok URL, update `MEDGEMMA_API_URL`, and redeploy |

## Project structure

```
medgemma-web/
├── app/
│   ├── layout.tsx                     # Root layout: html shell, theme bootstrap, metadata
│   ├── page.tsx                       # Entry page; renders the ChatApp client component
│   ├── globals.css                    # Global stylesheet (plain CSS, design tokens, dark/light themes)
│   └── api/
│       ├── generate/route.ts          # POST proxy to the model's /generate; injects X-API-Key; maxDuration = 300
│       └── health/route.ts            # GET proxy to the model's /health; returns non-sensitive status info
├── components/
│   ├── ChatApp.tsx                    # Top-level client component wiring chats, theme, health, dialogs
│   ├── Sidebar.tsx                    # Chat list, new-chat button, rename/delete, footer controls
│   ├── ChatView.tsx                   # Main pane: topbar, message list, composer, empty state
│   ├── MessageBubble.tsx              # One message: avatar, bubble, meta row with copy button
│   ├── Markdown.tsx                   # Renders assistant answers as sanitized markdown
│   ├── Composer.tsx                   # Auto-growing textarea, send/stop buttons, hint text
│   ├── StatusPill.tsx                 # Health status dot, label, and last-check age
│   └── SettingsDialog.tsx             # Modal for generation params, keepalive interval, theme, health info
├── hooks/
│   ├── useChats.ts                    # Chat state + localStorage persistence
│   ├── useKeepAlive.ts                # Periodic /api/health polling with configurable interval
│   └── useTheme.ts                    # Dark/light theme state on <html data-theme>
├── lib/
│   ├── types.ts                       # Shared TypeScript types (Chat, Message, Health, Settings)
│   ├── storage.ts                     # localStorage read/write helpers and versioning
│   └── utils.ts                       # Small utilities (time formatting, ids, class names)
├── .env.example                       # Template for MEDGEMMA_API_URL and MEDGEMMA_API_KEY
├── next.config.mjs                    # Next.js configuration
├── package.json                       # Scripts and dependencies
└── tsconfig.json                      # TypeScript configuration
```
