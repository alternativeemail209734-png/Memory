# TikTok LIVE Memory Match

This folder is the complete, finished app. You do not need to edit any code.

> **Before you go live:** open the TikTok app, go to your LIVE settings, then **Comments > Filtered**, and turn **OFF** the **Spam filter** and **Potentially unkind words**. TikTok can quietly hide comments before they ever reach the game, especially many viewers typing short guesses like `1 5` at the same time. The game cannot see a comment TikTok never sends.

## First time: put it online

1. Create a new empty repository on GitHub.
2. Upload everything from this folder to it. Keep the `public` folder as it is.
3. Go to Render.com, click **New +**, then **Web Service**, and pick that repository.
4. Use these settings:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free is fine
5. Click **Create Web Service**. Render gives you a link like `https://your-game.onrender.com`.

## Set your TikTok key once (so you never type it again)

1. On Render, open your web service and go to the **Environment** tab.
2. Add `EULERSTREAM_SIGN_API_KEY` with your free key from eulerstream.com.
3. Add `TIKTOK_USERNAME` with your TikTok name (no @).
4. Save. Render restarts the game by itself.

With both set, the game connects to your LIVE **by itself** every time it starts, and Settings no longer asks for the key. The key stays on Render. It is never in GitHub and is never sent to the browser.

## Already online? Update it

1. Open your GitHub repository.
2. Upload every file from this folder again, on top of the old ones (same names, same `public` folder). Choose to replace when asked.
3. Render notices the change and updates your game by itself in a minute or two.

Two things changed in the files. `package.json` has a new TikTok library version, and there is a new `render.yaml`. Both are picked up automatically. (If you're updating from Part 3 to this build, the only change is `style.css` — a purely visual update to the tiles, nothing to configure.)

## Using the game

Open your Render link on your phone or PC.

- The game board fills the screen. Cards are numbered. Viewers type two numbers in chat, like `1 5`, `1,5` or `1-5`, to flip those two cards.
- Top bar (left to right): difficulty badge, new game, leaderboard, **peek**, **reveal a pair**, theme colours, full screen, settings.
- To change difficulty: tap the numbered badge, pick a level, then tap the new game button (the circular arrow).
- Tap **Settings** (the gear) to pick Offline, Test or Live mode, and to connect TikTok.
- **Host Console** at the bottom lets you type guesses yourself. Tap **Hide** to hide it, and **Console** to bring it back.
- Tap **Leaderboard & Activity** under the board to see the scores, the last chat comment the game received and how it read it, and every recent guess.
- Tap the trophy for the leaderboard window (**This Round** and **All-Time**).
- When the last pair is found, a window shows this round's top scorers, then the all-time top scorers, then closes by itself.
- Turn on **Auto Next Game** in Settings and a new game starts a few seconds after each win.
- In Settings, open the **Test** tab and turn on **Auto-Play (Bots)** to watch fake viewers play whole games on their own.

### Hints and reveals (host only, nobody gets points)

- **Peek** (eye button): every face-down card shows its picture for a few seconds, then hides again.
- **Reveal 1 Pair** (sparkle button): one pair is matched for you.
- In Settings, **Hints & Reveals** also has **Reveal 3 Pairs** and **Reveal Whole Board**. Revealing the whole board ends the game and asks you to confirm first.

### Timing (Settings > Timing)

You can change how long the guess pop-up stays, how long each round-end window stays, how long a wrong pair stays face-up, how long Peek lasts and the pause before the next game. **Reset to Defaults** puts them all back.

### Save & Apply as Default

Tap **Save & Apply as Default** in Settings once your setup is right. It remembers theme, mode, difficulty, Auto Next Game, the timings, Auto-Play Bots and your TikTok username on that device. If Render restarts the game and forgets its settings, the saved setup is applied automatically the next time you open the page. It is only applied when nobody has set the game up yet, so opening the page on a second phone in the middle of a show never resets your game. Use **Clear saved default** to forget it.

## Going Live on TikTok

If you set the two Render variables above, there is nothing to do. The dot at the top left turns green when it works.

Otherwise:

1. Get a free key from eulerstream.com.
2. In Settings, tap **Live**, type your TikTok username (no @) and the key, then tap **Connect**.
3. The dot at the top left turns green when it works.

If the connection drops, or you are not live yet, the game keeps trying again in the background by itself. Viewer comments only count while the game is in **Live** mode. If you switch to Test or Offline, the TikTok connection stays open but chat is ignored, and it counts again as soon as you switch back to Live.

## Keep it awake while you stream

Render's free plan puts the game to sleep after about 15 minutes with no visitors, which also drops the TikTok connection. Point a free monitor such as UptimeRobot or cron-job.org at `https://your-game.onrender.com/healthz` every 5 to 10 minutes while you stream.

## Difficulty levels

| Level | Name    | Cards |
|-------|---------|-------|
| 1     | Warmup  | 20    |
| 2     | Easy    | 36    |
| 3     | Medium  | 48    |
| 4     | Hard    | 64    |
| 5     | Chaos   | 96    |

## If something looks wrong

- **Chat Comments Received stays at 0 in Live mode:** the username or key may be wrong, or you are not live yet. Check the message in Settings. It shows the real reason, and the Render logs show the full detail.
- **A viewer's guess never shows up:** check the TikTok Spam filter setting at the top of this page first.
- **The first load is slow:** free Render games go to sleep. Wait about 30 seconds.
- **All-Time scores:** they are saved to a file, so they survive the game going to sleep and waking up. They start again from zero when you upload new files (a new deploy), because the free Render disk is wiped. To keep them across deploys, use a paid plan with a Persistent Disk (the steps are written in `render.yaml`).
- **Run it on your own computer first:** open a terminal in this folder, run `npm install`, then `npm start`, and open http://localhost:3000. To use your key there, copy `env.example` to a new file named `.env` and fill it in. Never upload `.env`.
- **The `_gitignore` file:** if you use git on your computer, rename it to `.gitignore`. On the GitHub website you can leave it as it is.
- **Want more changes?** Upload this folder back to Claude and say what you want.
