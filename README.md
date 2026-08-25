# Floor Is Lava

Mobile-first playable prototype. The board scrolls downward and the lava keeps rising — climb by tapping safe tiles before it catches you.

## How to play

- Tap a tile in the next row, directly ahead or one step left/right. The character auto-steps there.
- Safe tiles (green, the white-bordered one is the guaranteed route) are your only way forward. Red tiles are lava — tap one and you die.
- The lava rises continuously and speeds up the further you go. If it reaches you, game over.
- Score = tiles climbed. Best score is saved locally.

## Run

Open `index.html` in a browser, or serve this folder with any static server.

## Implemented

- 5-column endless tile board with a smooth downward-scrolling camera.
- Generation that builds the safe route **ahead of time and visibly**: every row shows its safe tiles (greens + the white-bordered guaranteed route) before you tap, so you can plan. Rows never change after they appear.
- Guaranteed solvability: from any safe tile there is always a reachable safe tile in the next row, so you are never stuck in an unfair dead-end — but mis-tapping lava still kills you.
- Multiple safe options per row (the guaranteed route plus random extras that thin out as difficulty rises).
- Tap-only next-row movement validation; input locked while moving; no move queuing.
- Smooth movement with a landing bounce.
- Rising-lava death (speed scales with score) replacing a countdown timer.
- Two danger indicators: a ring around the character and a bar at the top, both shrinking as the lava nears.
- Score and persistent best score.
- Fast game-over and one-button restart.
- Sound and vibration toggles.
- Stub points for analytics and future ads.
