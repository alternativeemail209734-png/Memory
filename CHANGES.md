# What changed (part 5 of 5)

Part 5 replaces the single "everything is pink, matches are green" tile coloring with a full rainbow. Nothing about how the game plays, connects or scores has changed.

## Part 5 (this build): a rainbow board
- **Tiles are no longer all one color.** Every tile - face-down or matched - gets one of six colors, repeating across the board like a bag of candy, instead of every tile-back being pink and every match being green.
- **Still fully theme-matched:** each of the six colors is the active theme's own pink/green rotated around the color wheel, not a fixed hardcoded palette - so switching themes re-tints the whole rainbow, not just one color.
- **Clearer status cues, not weaker ones:** since matched tiles now keep their own color instead of all turning green, a matched pair gets a warm gold glow around the whole tile so "you got it" still reads instantly at a glance. A wrong pair still gets a plain red ring, also unaffected by the tile's own color.

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
