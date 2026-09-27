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

This update (Part 16) changed `public/client.js` and `public/style.css`: wherever a team player's own score shows (leaderboards, the scoreboard, round-end windows, the guess pop-up), a small colored badge now shows their team's current round total right next to it. See `CHANGES.md` for the full list.
- Tap **Settings** (the gear) to pick Offline, Test or Live mode, to connect TikTok, and to pick a **Card Symbols** pack. There are 18 packs now: the originals (Kawaii Stickers, Classic Mix, Animals & Critters, Sweets & Treats, Space & Sky, Holiday & Celebration, Faces & Fun, Careers & Occupations, Vehicles & Travel, Buildings & Places) plus 8 new ones - **World Flags**, **Superheroes**, **Winter Wonderland**, **Famous Landmarks**, **Musical Instruments**, **Dinosaur Age**, **Fantasy & Magic** and **Board Games & Toys**. Picking a new pack starts a fresh game with it right away.

### Guessing in Offline Mode (no need to open Settings)

Whenever the game is in Offline Mode, a **Player Guess Bar** sits right under the top bar on the main screen - this is where guesses happen now, not in Settings. Hand the phone to whoever's turn it is and they just tap:

1. Tap a face-down card, then tap a second one - that's the guess. The first card gets a bright ring so it's clear what's picked. No typing needed.
2. Prefer typing? The guess box in that same bar still takes "1 5" and a Submit button, same as before.

### Multiplayer Teams (Offline Mode)

In Settings > **Offline Mode**, use the **Multiplayer Teams** box to set the match up once:

1. Pick how many teams (2, 3 or 4) and how many players on each team (1-5 - so 1v1 up to 5v5, or a 3- or 4-way game).
2. Type each player's name in the boxes that appear.
3. Tap **Start Team Game**. Each team is given a random color - Red, Blue, Green or Yellow - and a roster card for each team appears, listing its players. You can close Settings now - it isn't needed again during play.
4. To make a guess, on the main screen tap that player's name chip in the Player Guess Bar, then tap their two cards on the board (or type the numbers and tap Submit). Their points are added to their team's total automatically.
5. Tap the trophy button and open the new **Teams** tab to see each team's color, total points, and what every member has scored. A player's own score also carries a small colored badge showing their team's current round total, everywhere their score shows - the leaderboards, the top-5 scoreboard, the round-end window and the live guess pop-up.
6. Tap **Clear Teams** (in Settings > Offline Mode) to end the team match and go back to ordinary solo Offline play.

- **Combo streaks:** a viewer who matches pairs back-to-back earns bonus points - the 2nd pair in a row is worth 2 points, the 3rd worth 3, and 4+ in a row is worth 4. A wrong guess resets that viewer's streak. While someone's streak is 2 or more, a small flame badge (e.g. "🔥×3") shows next to their name in the guess pop-up and the This Round leaderboard.
- **Host Console** at the bottom lets you type guesses yourself. Tap **Hide** to hide it, and **Console** to bring it back.
- Tap **Leaderboard & Activity** under the board to see the scores, the last chat comment the game received and how it read it, and every recent guess.
- Tap the trophy for the leaderboard window (**This Round** and **All-Time**).
- When the last pair is found, a window shows this round's top scorers, then the all-time top scorers, then closes by itself.
- Turn on **Auto Next Game** in Settings and a new game starts a few seconds after each win.
- In Settings, open the **Test** tab and turn on **Auto-Play (Bots)** to watch fake viewers play whole games on their own.

### Reset scores

In Settings, **Reset Scores** has **Reset This Round** and **Reset All-Time**. The trophy window also has a reset button for the tab you have open. Each asks you to confirm first.

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
