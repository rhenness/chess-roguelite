# Endless

The Endless entry on Home offers Standard and Hardcore. Play both colors from
the normal starting position. Best/Good moves extend the accuracy streak;
Inaccuracy/Bad moves reset it. Checkmate and all chess draw conditions briefly
announce the result and automatically reset the board, carrying the session's
streak, score, move counts, lives, supplies, and remaining effect charges forward.

Standard uses existing set starting health, move points/damage, and up to three
purchased consumables. Four consecutive Best moves grant one heart. A shield
blocks damage without preserving the accuracy streak. Hardcore has exactly one
life, cosmetic set choices, no items, and ends on the first Inaccuracy/Bad move.
Its score is the count of successful moves. Both variants start fresh attempts
at zero score; starting another chess board within an attempt never resets it.

At defeat, award one coin per 25 unboosted points. Hardcore only counts points
from successful moves. Item bonuses, board multipliers, completion bonuses, and
permanent square upgrades do not contribute. Record the award and its receipt
together in the shared wallet; reloading a finished session cannot pay twice.
An abandoned attempt has no reward. Dungeon unlock/completion rules are separate.

Setup uses the existing set picker and item step with actions anchored above the
bottom navbar. Hardcore starts directly from set selection.
Active attempts show stacked actions with Resume first and primary, followed
by Start new. Starting a new Standard attempt still opens item selection.
Both modes reuse the colored move buttons, preview arrows, board taps, promotion
choices, item confirmation, icons, notifications, and piece rendering. Keyboard arrows cycle
choices, Enter/Space selects then confirms, and Escape clears the pending choice.

Use a separate state model and persistence entry (`knightfall.endless.v1`) for
sessions and Standard/Hardcore records. Preserve exact current choices, replay
the current board's PGN for repetition/draw detection, and validate loaded saves.
Keep timers and analysis paused while browsing or viewing help. A refreshed
reveal or board transition resumes automatically when gameplay is visible.

Port Fourced Move's move classification and category selection. Its opening is
c4/d4/e4/Nf3, all Good. Other turns evaluate live using the matching lightweight
Stockfish 19 worker/WASM pair. Worker searches are serialized: stopped-search
output must drain before the next position begins. Ignore stale results and
invalid/bound evaluations. Engine failure retains the attempt and offers retry.

Most code and tests live in `src/features/endless/`, with engine assets/license
under `public/endless/stockfish/`. Share presentation and pure item resolution;
keep engine analysis, mode rules, board rollover, persistence, and records local
to the feature. Profile lifetime stats show best Standard score and Hardcore
streak alongside regular and daily records. Setup does not list records. Home
shows an active attempt's next move beneath the Endless title.
