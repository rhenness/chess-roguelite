# First-play tutorial

The main menu's Regular run button takes players with no finished runs straight
into a Default run, bypassing board and item setup. Returning resumes their
existing run. The first regular run starts the play guide. Existing players use
the usual setup. Skip tutorial is available on
every visible prompt and is remembered. Help offers Replay play tutorial during
an unfinished regular run, using the current position and inventory. Help on
Home or regular setup offers Start guided run with the Default set and a free
Healing Potion. Guided runs charge no coins. The guide appears only in regular
runs; ordinary runs keep their purchased loadouts.

## Lessons and actions

1. A centered introduction explains surviving ten rounds and keeping hearts.
2. A highlighted colored square for the Best move invites the player to select it. The prompt
   also explains selecting a piece and destination directly on the board.
3. A second tap on the selected move square plays it. Choosing the board instead
   shows a destination prompt and highlights an offered destination.
4. The first actual move pauses playback for an explanation of its awarded
   points and applied damage. The player advances the explanation with Next.
5. A labeled heart animation demonstrates Inaccuracy damage independently of
   real health, score, inventory, and move history. Reduced motion is respected.
6. Prompts explain the four-Best healing streak, rounds, and checkpoint markers.
7. After explaining rounds, the player learns the item bar's green check and red
   X controls using their free Healing Potion at the next playable decision.
   Activation restores one real heart; Keep for later leaves the potion unused.
   This finishes the guide. Reward selection has no tutorial overlay.

Next advances explanations. Gameplay actions use the normal move, checkpoint,
and item functions. Informational lessons hold playback and move input. The
item lesson enables item controls while holding move input. It waits for the
first move's playback to finish before appearing. Defeat or
a short run can finish the guide without waiting for a checkpoint. The
multiplier presentation is unchanged.

## Presentation and persistence

The introduction sits in the center of the board. Other prompts are floating
tooltips with gold pointers matching their target's border. Tooltip and target
frames render outside the game layout, so they do not resize the board and are
not clipped by board squares, the progress bar, or narrow health containers.
Positioning follows scrolling and resizing, stays inside the viewport, and
retargets the green activation check when item confirmation opens.
Move selection and confirmation prompts sit outside the entire row of options,
while the gold pointer and highlight still identify the individual move square.

`knightfall.play-tutorial.v1` stores status, run ID, lesson, initial decision
count, and item-use baseline for the entire guide. Item guidance has no separate
tracking. The free potion is saved in the regular run's starting inventory, so
refresh and resume neither grant it again nor repeat its activation.
Destination selection is UI state, so refreshing that step asks for a move
again. Old checkpoint waits retire without replaying completed play lessons.
Unavailable storage keeps tutorial state in memory for the session. Skipping
affects only guidance. Replay from Help retains the current run and wallet,
teaching its existing items after the rounds explanation if available.

Checks cover real actions, explanatory playback holds, isolated demonstrations,
free starting inventory, real activation after the rounds explanation, unchanged purchased
loadouts, skipping, refresh, replay, unavailable storage, and
keeping the regular guide paused during dungeon play. Browser checks verify
tooltip fit, reachable board and item controls, centered introduction, visible
highlights, and unchanged board bounds on desktop, phone, and landscape layouts.
