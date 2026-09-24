# TikTok LIVE Memory Match

This folder is the complete, finished app. You do not need to edit any code.

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

## Already online? Update it

1. Open your GitHub repository.
2. Upload every file from this folder again, on top of the old ones (same names, same `public` folder). Choose to replace when asked.
3. Render notices the change and updates your game by itself in a minute or two.

## Using the game

Open your Render link on your phone or PC.

- The game board fills the screen. Cards are numbered. Viewers type two numbers in chat, like `1 5`, to flip those two cards.
- Top bar (left to right): difficulty badge, new game, leaderboard, theme colours, full screen, settings.
- To change difficulty: tap the numbered badge, pick a level, then tap the new game button (the circular arrow).
- Tap **Settings** (the gear) to pick Offline, Test or Live mode, and to connect TikTok.
- **Host Console** at the bottom lets you type guesses yourself. Tap **Hide** to hide it, and **Console** to bring it back.
- Tap **Leaderboard & Activity** under the board to see the scores and every recent guess.

## Going Live on TikTok

1. Get a free key from eulerstream.com.
2. In Settings, tap **Live**, type your TikTok username (no @) and the key, then tap **Connect**.
3. The dot at the top left turns green when it works.

## Difficulty levels

| Level | Name    | Cards |
|-------|---------|-------|
| 1     | Warmup  | 20    |
| 2     | Easy    | 36    |
| 3     | Medium  | 48    |
| 4     | Hard    | 64    |
| 5     | Chaos   | 96    |

## If something looks wrong

- **Raw Events stays at 0 in Live mode:** the username or key may be wrong. Check the red message in Settings.
- **The first load is slow:** free Render games go to sleep. Wait about 30 seconds.
- **Want more changes?** Upload this folder back to Claude and say what you want.
