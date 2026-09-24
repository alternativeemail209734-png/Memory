# What changed (part 10)

- **No glistening or flashing:** removed the shimmer sweep across tiles, the twinkling corner star and the sparkle burst on matches. The corner star is now still. The only motion left is a slow, gentle float on face-down tiles and a slow breathing of face-up pictures, with no brightness changes.
- **Space & Sky** now includes celestial objects: comet/meteor, all eight moon phases, ringed planet, three Earths, galaxy, shooting star, sun, UFO, satellite, telescope and more, alongside the sky and weather pictures.
- **Two new packs:** Vehicles & Travel (cars, trains, planes, boats and so on) and Buildings & Places (houses, landmarks, mountains, beaches and so on). Every pack has 48 pictures and no picture appears in any other pack. To keep that true, the job tools in Careers & Occupations now use tools like fire extinguisher, broom, axe and gear instead of vehicles.

# Part 9

- **No repeated pictures between symbol packs:** every pack has 48 pictures and no picture appears in any other pack. Classic Mix is now flowers, plants, toys, music and sports; Animals, Sweets & Treats, Space & Sky, Holiday & Celebration and Faces & Fun are each fully their own.
- **New pack: Careers & Occupations** - doctor, farmer, chef, teacher, pilot, astronaut, firefighter, police and more, plus their tools (stethoscope, hammer, fire truck, camera and so on).
- **Scores reach both leaderboards, in normal view and full screen:**
  - A new always-on scoreboard sits under the board (top 5 for This Round and All-Time). It is part of the game screen, so it shows in full screen too. The trophy window and round-end window also work in full screen.
  - The winning pair's points are saved to the all-time file immediately, and the streak flame clears right after a wrong guess.
  - The leaderboards no longer cut the list short (round 500, all-time 1000 players).

# Part 8 and earlier

- **One uniform tile:** every tile is now the same soft pearl gradient (pink to sky) - no more two colour halves. It has a glossy highlight, a slow shimmer sweep, a twinkling star and a tiny float, all staggered so the board ripples. Colours follow the active theme.
- **New Card Symbols pack, "Kawaii Stickers" (now the default):** the 12 cute pictures from your preview (heart, star, moon, drop, clover, cat, gem, donut, cloud, frog, mushroom, ghost). Chaos needs 48 different pictures, so the pack reuses the 12 in colour-shifted versions. Face-up pictures gently breathe. The other packs are unchanged.
- Files now sit in the correct layout: `client.js`, `index.html`, `style.css` and the new `symbols/` pictures are in the `public` folder.


Part 7 gives the board a fresh look again (not a return to Part 4 or Part 6), and adds two new features: combo/streak bonuses for viewers, and a Card Symbols picker so you can swap the whole deck's pictures. How the game connects, scores (aside from the new streak bonus) and is played is otherwise unchanged.

## Part 7 (this build): puffy sticker tiles, combo streaks, symbol packs

- **A fresh tile look - not the old glossy candy buttons, not the flat minimalist tiles either:** each tile is now a soft, puffy gradient "jelly bubble" with a bright die-cut sticker rim, like a cute vinyl sticker rather than a printed square or a glossy button. One small star peeks from a corner of each tile back - a single whimsical touch, not a repeating pattern, so the board stays calm rather than busy or crowded.
  - Quiet two-tone variety is kept (tiles alternate between a pink-leaning and a cyan-leaning tone), same as Part 6, just redrawn as puffy gradients instead of flat color.
  - Symbols now pop in with a playful bounce-and-wiggle when a card flips face-up, instead of a plain settle - a bit more "alive" without being distracting.
  - A matched pair gets a bright puffy green tile and a quick two-corner sparkle burst that fades out, instead of a static glow or border.
  - Still fully theme-matched: every tile color is computed from the active theme's own pink/cyan/green, so it re-tints itself automatically for all 8 themes and light/dark mode.
- **Combo / streak bonus:** matching pairs back-to-back (no miss in between) now earns bonus points on top of the usual 1 per pair - the 2nd pair in a row is worth 2, the 3rd worth 3, the 4th and beyond worth 4 (the bonus caps there so one long streak can't run away with the whole round). A viewer's streak resets the moment they guess a pair that doesn't match. While a streak is 2 or more, a small flame badge (e.g. "🔥×3") shows next to their name in the guess pop-up and in the This Round leaderboard.
- **Card Symbols picker (Settings):** choose which set of pictures the cards use - Classic Mix (the original set), Animals & Critters, Sweets & Treats, Space & Sky, Holiday & Celebration, or Faces & Fun. Each pack has enough unique pictures for every difficulty up to Chaos. Picking a new pack starts a fresh game right away with the new set, at whatever difficulty is currently selected.

## Part 6: minimalist, cute tiles (superseded by Part 7, kept for history)
Part 6 replaced the glossy "candy button" tiles and the rainbow board with a calmer, flat, two-tone look. Part 7 replaced this with the puffier sticker look above because it read as a bit dull on stream.
- Flat instead of glossy: no gradients, gloss, polka-dot texture, or corner sparkles/hearts. Tiles were a simple soft-rounded shape with one gentle shadow.
- Quiet two-tone variety instead of one flat color or a full rainbow.
- Calmer status cues: a matched pair got a soft pastel-green tint and a thin green border; a wrong pair got a quick, quiet shake.

## Part 5: a rainbow board (superseded by Part 6, kept for history)
Part 5 gave every tile its own color from a six-color rotation of the theme's pink/green, with a gold glow on matches and a red ring on misses. Part 6 replaced this with a calmer look because it read as more cluttered than cute.

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
