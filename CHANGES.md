# What changed in this build (part 1 of 3)

The Memory game now follows the look and layout of the Sudoku game. The game rules are unchanged.

## Part 1 (this build): look, layout and controls
- 8 colour themes (Dark, Light, Cream, Sky Blue, Meadow Green, Blossom Pink, Lavender Violet, Honey Gold). Your choice is remembered on the device.
- New top bar with small icon buttons: difficulty badge, new game, leaderboard, theme, full screen, settings.
- Settings panel (slides up from the bottom): themes, Offline / Test / Live tabs, TikTok connect, new game, how to play.
- Board redesigned: framed board, cards sized to fit any phone (even Chaos, 8 x 12), a red outline on a wrong pair, a small pop on a match.
- Status line with connection dot, pairs found (for example 4/18) and a stopwatch that stops when the game is finished.
- "Leaderboard & Activity" panel: diagnostics, this round's scores, and a feed showing what happened to each guess (match, no match, already flipped, too soon, not a card number, not two numbers).
- Host Console can be hidden and brought back, and remembers its state.
- Full screen button.
- All-matched window with the top scorers and the time taken, and a Start New Game button.

## Small fixes
- Picking a difficulty no longer snaps back to the old one when the next guess arrives.
- A wrong pair from the last game can no longer unlock the next game early.
- Test Mode "Simulate" now only picks cards that are still face down.
- Guesses are ignored once the game is finished, until a new game starts.

## Planned next
- Part 2: live guess pop-ups with viewer photos, all-time leaderboard, auto next round, test bots.
- Part 3: stronger TikTok connection handling, hint/reveal buttons, timing settings, save-as-default settings.
