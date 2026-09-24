# TikTok LIVE Memory Match — Deployment Ready

This folder is the complete, finished app. You do not need to edit any code.

## 1. Push to GitHub
1. Create a new empty repository on GitHub.
2. Upload every file in this folder (keeping the `public/` folder intact) to that repository.

## 2. Deploy on Render.com
1. Go to Render.com → **New +** → **Web Service**.
2. Connect the GitHub repo you just created.
3. Settings:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free is fine to start.
4. Click **Create Web Service**. Render will give you a live URL like
   `https://your-game.onrender.com`.

## 3. Open the game
Open your Render URL in a browser (on your streaming PC or phone). That single page is
both:
- The **overlay** you capture into OBS / your TikTok LIVE Studio as a Browser Source, and
- The **Host Controls** panel (sticky at the bottom) — tap "▾ Host Controls" to
  collapse it if you don't want it visible in your stream capture, or simply crop
  the OBS Browser Source region to exclude it.

## 4. Getting a signing/auth key for Live Mode
Live Mode (real TikTok chat) requires a signing key from a provider such as
**eulerstream.com** (create a free account, copy your API key). Paste your
TikTok `@username` and that key into the Host Controls "Live" row and click Connect.
The app will retry the connection automatically up to 3 times if it fails.

## 5. Modes
- **Offline** — play by yourself using the Host input box at the bottom.
- **Test** — click "🎲 Simulate Comment" to generate fake chat guesses, so you can
  test difficulty levels and visuals before going live.
- **Live** — connects to real TikTok LIVE chat. Viewers type two numbers
  (e.g. `1 5` or `1, 5`) to flip those two cards.

## 6. Difficulty levels
| Level | Name    | Grid   | Cards |
|-------|---------|--------|-------|
| 1     | Warmup  | 4 × 5  | 20    |
| 2     | Easy    | 6 × 6  | 36    |
| 3     | Medium  | 6 × 8  | 48    |
| 4     | Hard    | 8 × 8  | 64    |
| 5     | Chaos   | 8 × 12 | 96    |

## Troubleshooting
- **"Raw Events" counter stuck at 0 in Live Mode** — your signing key or
  username may be wrong, or TikTok may be rate-limiting; check the red status
  text next to "Mode: LIVE".
- **Free Render instances sleep** after inactivity — the first load after a
  while may take ~30 seconds to wake up.
- Want changes later? Use the **2_Source_For_Future_Upgrades** folder — upload
  those files back to Claude and describe the change you want.
