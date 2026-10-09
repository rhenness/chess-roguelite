# Move grades and evaluations

Player-facing move quality uses A, B, C, and F, in descending order. The existing
categories remain `best`, `good`, `inaccuracy`, and `bad`; only their display names
change. Generation recipes and Endless classification retain their assignments,
including A/B/C/C and A/F recipes. Points, health, streaks, and items still use the
original categories and rules.

Regular, Daily dungeon, and both Endless modes reveal only the committed move's
grade in a compact, centered card. Previews and pending selections hide this
feedback. Help, tutorials, move-count summaries, and shared results use the same
grade names. Fatal moves also display their grade. Score and health remain visible
in the HUD; move notation remains in the board history.

Move evaluations and centipawn loss are reserved for a future game review screen.
The evaluation data and formatting helpers remain available; the grade card does
not display evaluation, loss, points, or effect details.

Evaluations come from the actual move analysis, not recipe targets. Scores already
use the mover's perspective, including Black: positive favors the player, negative
favors the opponent. Display centipawns as `+85 cp`, `−85 cp`, or `0 cp`, and mate
distances as `+M3` or `−M3`. Cp loss is `max(0, best cp − move cp)` and appears only
when both scores are centipawn evaluations. Neither mate nor unavailable scores
are converted to centipawns.

Preset Endless opening moves stay B and have no evaluation (`—`). Older opening
placeholders are restored as unavailable without changing the saved attempt.
Evaluated zero scores remain `0 cp`. Endless captures the best score before
clearing offered options so its comparison data survives refresh. Older reveals
without a saved baseline keep it unavailable instead of inventing it.
