# What changed (part 6 of 6)

Part 6 replaces the glossy "candy button" tiles and the rainbow board with a calmer, minimalist look. Nothing about how the game plays, connects or scores has changed.

## Part 6 (this build): minimalist, cute tiles
- **Flat instead of glossy:** no more gradients, gloss, polka-dot texture, or corner sparkles/hearts. Tiles are a simple soft-rounded shape with one gentle shadow.
- **Quiet two-tone variety instead of one flat color or a full rainbow:** face-down tiles alternate between two soft pastel tones across the board (one leaning on the theme's pink, one on its cyan), so it's not a wall of one color, but it's not a loud rainbow either.
- **Calmer status cues:** a matched pair gets a soft pastel-green tint and a thin green border (no gold glow); a wrong pair gets a quick, quiet shake instead of a red ring.
- **Still fully theme-matched:** every tile color is computed from the active theme's own pink/cyan/green, so it re-tints itself automatically for all 8 themes and light/dark mode.

## Part 5: a rainbow board (superseded by Part 6, kept for history)
Part 5 gave every tile its own color from a six-color rotation of the theme's pink/green, with a gold glow on matches and a red ring on misses. Part 6 replaced this with the calmer look above because it read as more cluttered than cute.

## Part 4: cute, glossy 3D tiles
- **Tiles now look like little glossy candy buttons**, not flat rectangles: rounder corners, a soft shine near the top-left, a raised "gumdrop" edge underneath for real depth, and a gentle bounce as a card settles face-up.
- **A cuter, bigger-feeling deck:** the 48 symbols are now all kawaii-style — baby animals, sweets and treats, plus a few sparkly extras (rainbow, balloon, heart, star, bow) — instead of the plainer original mix.
- **Both sides got a bit of extra detail:** a very soft polka-dot texture, and a tiny sparkle/heart tucked in opposite corners (well clear of the number or emoji) so a tile-back reads like a little gift tag and a face-up tile like a small keepsake. Matched pairs get a warmer, more festive sparkle.
- **Every tile re-colors itself to match whichever of the 8 themes is active**, automatically — the tile colors, dots and sparkles are all computed from each theme's own pink/cyan/panel colors, so there was nothing to hand-tune per theme and nothing to keep in sync later.
- Matched pairs keep their green "correct" color, now with the same glossy treatment and a slightly bigger pop.
- A wrong pair (red outline while it's held face-up) is unchanged in meaning, just redrawn on the new tile shape.
- On a mouse/desktop browser, hovering a face-down tile lifts it slightly and clicking presses it down, like a real button (touch devices are unaffected, since there's no hover there). Purely a host-side visual nicety — viewers still only play by typing in chat.
- Respects "reduce motion" system settings the same way the app already did: the settle-bounce and match-pop animations turn off, the flip itself becomes instant.

## Part 3: a sturdier show
- **Stronger TikTok connection:**
  - The game reconnects by itself if the connection drops, the stream ends, or you were not live yet when you connected.
  - A watchdog notices a "zombie" connection (still says Connected but nothing arrives for 2 minutes) and reconnects.
  - When EulerStream says "slow down" (rate limit), the game waits as long as it asks instead of retrying every few seconds.
  - The TikTok library is pinned to version 2.5.0, so a fresh deploy can never quietly pull in a different one.
  - Comments are de-duplicated by their message ID, and comments that arrive in unusual shapes are still read.
  - The real reason for any connection problem now shows in Settings and in the Render logs.
- **Set the key once:** `EULERSTREAM_SIGN_API_KEY` and `TIKTOK_USERNAME` can live on Render. With both set, the game connects on start and Settings stops asking for the key. A `.env` file now works on your own computer, and `/healthz` is there for a sleep-preventing monitor.
- **All-Time scores are saved to a file** (survive sleep and wake, not a new deploy on the free plan; `render.yaml` explains how to keep them across deploys with a Persistent Disk).
- **Hints and reveals (host only, no points):** Peek shows every card for a few seconds. Reveal 1 Pair, Reveal 3 Pairs and Reveal Whole Board (with a confirm) are in Settings. Peek and Reveal 1 Pair are also in the top bar.
- **Timing settings:** guess pop-up, round-end windows, next game delay, how long a wrong pair stays face-up and Peek length. Reset to Defaults included.
- **Save & Apply Settings** and **Save & Apply as Default**: remembers your setup and re-applies it once when the game has restarted. It never touches a show that is already running.
- **Better guess reading:** `1-5`, `1:5` and full-width digits are read correctly (before, `1-5` was read as card 1 and card -5). The Diagnostics panel now shows how the last comment was read.
- **New To Memory? Rules** in the How To Play section.
- Files are sent with no-cache headers, so phones always load the newest version after a deploy.

## Things to know
- In Live mode, viewer comments only count while the mode is **Live**. Switching to Test or Offline no longer disconnects TikTok, it just ignores chat until you switch back.
- The Diagnostics counter now counts chat comments only (it used to count likes and joins too).
- Test bots only run in Test mode. Switching to Offline or Live turns them off.
- Already in Part 2 and unchanged: guess pop-ups, viewer photos, all-time leaderboard, round-end window, Auto Next Game, Auto-Play bots.

## Part 2: the live show
- Guess pop-ups with the viewer's photo, name and result. Viewer photos in leaderboards and recent guesses. All-Time Leaderboard. Round-end window. Auto Next Game. Auto-Play (Bots). Scores belong to the viewer's TikTok ID.

## Part 1: look, layout and controls
- 8 colour themes, a compact top bar, a Settings panel, a redesigned board, status line with stopwatch, Leaderboard & Activity panel, hideable Host Console and full screen.
