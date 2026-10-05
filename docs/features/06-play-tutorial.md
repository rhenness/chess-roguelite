# First-play tutorial

The main menu's Regular run button takes players with no finished runs straight
into a Default run, bypassing board and item setup. Returning resumes their
existing run. The first regular run starts the play guide. Existing players use
the usual setup. Skip tutorial is available on
every visible prompt and is remembered. Help offers Replay play tutorial during
an unfinished regular run, using the current position and inventory. Help on
Home or regular setup offers Start guided run with the Default set and no item
purchases. The basic play guide appears only in regular runs.

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
6. Prompts explain the four-Best healing streak and carryover between rounds.
7. The basic guide finishes after carryover. A separate item lesson appears the
   first time inventory is nonempty during playable regular or dungeon gameplay.
   This includes purchased starting supplies, dungeon supplies, and checkpoint
   rewards in any later run. It explains the green check and red X controls.
   Reward selection itself has no tutorial overlay.
8. Activating an item finishes the hands-on lesson. Keep for later also permits
   finishing without using supplies.

Next advances explanations. Gameplay actions use the normal move, checkpoint,
and item functions. Informational lessons hold playback and move input; action
lessons leave their controls usable. Defeat or a short run can finish the guide
without waiting for a checkpoint. Finishing or skipping the basic guide leaves
the item lesson pending until items are available. The multiplier presentation
is unchanged.

## Presentation and persistence

The introduction sits in the center of the board. Other prompts are floating
tooltips with gold pointers matching their target's border. Tooltip and target
frames render outside the game layout, so they do not resize the board and are
not clipped by board squares, the progress bar, or narrow health containers.
Positioning follows scrolling and resizing, stays inside the viewport, and
retargets the green activation check when item confirmation opens.
Move selection and confirmation prompts sit outside the entire row of options,
while the gold pointer and highlight still identify the individual move square.

`knightfall.play-tutorial.v1` stores the basic guide's status, run ID, lesson, and
initial decision count separately from the replayable run.
`knightfall.item-tutorial.v1` independently stores the item lesson's status, run
ID, step, and item-use baseline. Using an item advances its feedback; Keep for
later or Skip tutorial dismisses it without spending anything. Completion and
dismissal are remembered across runs. Replay from Help resets both guides.
Refresh restores
guidance without making moves or spending items. Destination selection is UI
state, so refreshing that step asks for a move again. Older saved checkpoint
lessons retire the basic guide while leaving item guidance pending; existing
item lessons retain their progress and dismissals. Unavailable storage
keeps tutorial state in memory for the session. Skipping the guide affects only
guidance, and replaying it retains the current run and wallet.

Checks cover real actions, explanatory playback holds, isolated demonstrations,
checkpoint rewards in later runs, purchased second-run items, dungeon inventory,
skipping, refresh, replay, unavailable storage, and
keeping the regular guide paused during dungeon play. Browser checks verify
tooltip fit, reachable board and item controls, centered introduction, visible
highlights, and unchanged board bounds on desktop, phone, and landscape layouts.
