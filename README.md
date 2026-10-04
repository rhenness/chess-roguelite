# Chess roguelite

The tree generator prepares JSON levels, and a separate offline script scores
their difficulty. Both use the existing [`GeneratedLevel` contract](src/types/level.ts).
Generation leaves `difficulty` at `-1`. All move evaluations, including mate
distances, use the player's perspective. Difficulty scoring runs after generation.

Requires Node.js 22 or newer. Install dependencies with `npm install` (or
`npm ci` when using the lockfile).

## Play a run

```powershell
npm start
```

Open the local URL printed by Vite and choose **Default**, **Obsidian Order**, or **Gilded Court**
to begin a run. The **Choose your set** popup shows both colors of each set,
its name, and a short line with starting hearts and the initial square bonus;
selecting a card starts immediately. **New run** and the result screen open the
same chooser, pausing the current game until a set is chosen or the chooser is
dismissed. Obsidian uses custom faceted SVG pieces with crimson inlays, 2 starting
health, and alternating ×1.0/×1.3 multipliers. Default retains 3 starting health
and ×1.0/×1.1 multipliers. Gilded Court uses ivory/dark green enamel SVGs with
gold trim and emerald inlays, 3 starting health, and just four ×1.5 starting
squares in the center (d4, e4, d5, e5); the other 60 squares start at ×1.0.
Its card says "Limited ×1.5 multis." Each set keeps its own square upgrades. On narrow screens the cards
stack as horizontal rows, with piece previews beside their benefits. Compact
previews show the king, queen, and knight in both colors. No separate start button
is needed.

Default is available immediately. Obsidian Order unlocks after **3 finished runs**,
and Gilded Court after **8**. Wins and deaths count; abandoning a run does not.
Locked cards show a lock and a small finished-run counter. A newly unlocked set
gets a board notification after the payout, before the final score modal.
Progress saves when the run ends, even if the remaining animation is skipped.
The versioned `knightfall.progression.v1` localStorage entry keeps the finished-run
count and last counted run ID across refreshes. If storage is unavailable,
progression continues in memory for the current session.

The chooser shows a shared coin wallet. Use the sparkle icon beside an unlocked
set to open its upgrade board without starting a run. All 64 multipliers are
visible before selection; tap a square to see its current value, next value, and
coin price, then tap the price to buy +0.1x. Close to return to set selection.
Higher multipliers have stronger coloring, and purchases use the shared board
notification without moving the board or checkout controls.

Finished runs earn 1 coin per 25 base points (rounded down), plus 20 coins when
all selected levels are successfully completed. Deaths retain earned coins;
abandoned runs and console previews earn nothing. Each square's paid upgrades
cost 30, 40, 50 coins, and so on. Starting bonuses and free random upgrades do
not increase that price. Balance constants live in [`src/game/economy.ts`](src/game/economy.ts).
The wallet and paid increments save together in `knightfall.progression.v1`,
with separate square counts for each set. Existing unlock saves begin with zero
coins; existing free-upgrade boards remain intact. Paid increments are added to
those boards for display and payouts. A finished run snapshots its board before
shopping, so purchases cannot change an already-earned payout. The free random
upgrade for completing all 10 levels still applies.

The game loads the
precomputed JSON files in `src/levels`, skips unscored files (`difficulty: -1`),
and randomly picks 10 distinct scored levels for each new run, then plays those
levels in ascending difficulty order. If fewer than 10 playable levels are
available, the run uses them all. New runs draw a fresh selection from the catalog.
Malformed files are skipped with a warning. Equal scores use a stable ID order.
The board faces the level's player color. Four colored buttons match the arrows
on the board, following the `fourced-move` UI. Hover or focus a button to highlight
its move. Select it once, then select the green button again to play. You can also
tap a piece and one of its highlighted destinations to play an offered move
directly. Other moves are ignored; tap the selected piece again to deselect it.
If multiple offered promotions share a destination, choose a promotion piece
from the colored buttons. Choice order
is shuffled for each decision; move quality is revealed after confirmation.
Segmented bars between the board and health/score row show past levels in green,
the current level in gold, and future levels in gray. Level numbers and side labels
are hidden. Difficulty is used only for level ordering and is never displayed.
Use **Flip board** to change the view and **?** for the rules. Move history
shows the current level's played moves, including replies only after playback.

Default and Gilded Court runs begin with 3 health; Obsidian Order begins with 2. Best/Good/Inaccuracy/Bad moves award 100/75/25/0 points
and cost 0/0/1/2 health. Every four consecutive Best moves earn one extra health
point, including streaks spanning levels. Other move qualities break the streak;
a new run resets it. A fire icon and the current Best streak appear beside health
while the streak is above zero. Health changes appear over the board as a filled
heart with +1 for rewards or −1/−2 for damage. They pop in, glow, float upward,
and fade. Damage uses a red theme. A lethal move instead shows a skull and
"Run over" over a dimmed board before starting the payout. The overlay never blocks taps
or changes the layout; reduced-motion settings show a still badge. The reusable
`BoardNotification` component accepts SVGs or images, a label, an optional caption,
a color theme, and a display duration for other milestone notifications.
Preview overlays from the browser console using `window.knightfall`. These
commands only show notifications; they do not change gameplay health or score:

```js
knightfall.health(); // Preview +1 health
knightfall.health(-1); // Preview health loss (also accepts -2)
knightfall.death(); // Preview the skull / Run over animation
knightfall.notify('Nice!');
knightfall.notify({ label: 'Streak!', icon: 'trophy', tone: 'reward', durationMs: 2500 });
knightfall.notify({ label: 'Bonus', image: '/reward.png', caption: 'Custom image' });
knightfall.payout(); // Preview the spin, payout, and square upgrade
knightfall.payout({ score: 1200, completed: false }); // Preview a payout without an upgrade
knightfall.dismiss();
```

Icons accept `heart`, `skull`, `sparkles`, or `trophy`; themes accept `health`, `reward`,
or `danger`. Every call restarts the animation, and the global object is removed
when the app unmounts.

Every ended run gets a board payout, including runs that end at zero health.
The 64 squares start as a checkerboard of ×1.0 and ×1.1 for Default, or ×1.0
and ×1.3 for Obsidian Order. Gilded Court starts with ×1.5 on the four central
squares (d4, e4, d5, e5) and ×1.0 elsewhere. At payout time, the
existing board clears its pieces and reveals the square multipliers. A highlight hops
between squares, slows down, and lands on a square chosen before the animation.
Its multiplier is applied to the base score, rounded once, and shown using the
board notification before the final score modal opens. Gameplay points remain
the base score; the final score and base/multiplier calculation appear in the modal.

Successfully completing all ten levels earns one random square a permanent +0.1
upgrade. Runs with fewer than ten completed levels still get a payout, but earn
no upgrade. The current payout uses the pre-upgrade multipliers. The upgrade is
saved once as soon as the payout starts so starting a new run cannot lose or
duplicate it; its notification plays after the payout notification. Multipliers
are stored in tenths under `knightfall.multipliers.v1` (Default) or
`knightfall.multipliers.obsidian.v1` (Obsidian Order), or
`knightfall.multipliers.gilded.v1` (Gilded Court) in this browser's
`localStorage`, and stay attached to square coordinates when the board is flipped.
Refreshing returns to the set chooser while preserving each set's square upgrades,
including Default upgrades earned before piece sets were added.
Older Gilded saves migrate to the four central bonus squares while retaining
earned +0.1 upgrades on their original coordinates.

`knightfall.payout()` pauses gameplay for a temporary preview and restores the
board afterward. It never changes scores or saved upgrades. Starting a new run
cancels pending payout animations. Reduced-motion settings skip the hopping and
show the selected square and notifications directly.

Health can exceed the starting amount. Both totals persist
between levels. The stored opponent
reply plays automatically after the reveal, then gameplay advances automatically.
The quality box shows only the move, quality, and points. Select **Next level**
after a level ends. Wins, draws, and depth-limit
leaves count as completed levels. Opponent wins count as failed levels, and play
continues while health remains. Zero health ends the run immediately, before an
opponent reply. The skull notification finishes before the board payout
begins. Completing the selected levels also ends the run.

The final score modal shows the multiplied score, base score and multiplier,
completed levels, decisions, and all
four move-quality counts. The board and controls keep their positions during
playback and level transitions. Both the result and rules open as modal overlays
so mobile gameplay fits the viewport without page scrolling. Select
**Start new run** to choose a set and reset the run. Rules are configurable through `DEFAULT_RULES`
and `RunRules` in [`src/game/run.ts`](src/game/run.ts), or by supplying the `rules`
prop to `App`; Obsidian overrides starting health to 2. Active runs are held in memory;
refreshing the page returns to set selection while retaining saved unlocks and square upgrades.

Gameplay uses React, chess.js, and react-chessboard. It follows only the selected
precomputed branch and performs no Stockfish analysis. Level JSON is never modified
by gameplay. Run `npm run build` for a production build and `npm run preview` to
serve it. `npm test` runs gameplay/React tests and the existing offline script tests;
`npm run typecheck` checks both applications.

## Generate a level

Generate a level from a starting FEN:

```powershell
npm run generate:tree -- --fen "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" --name opening
```

This writes `src/levels/opening.json`. Each file contains one
level with a stable UUID `id`, metadata and a nested `root` tree. The side to move in the FEN is the
player's color. Each choice records the player's UCI/SAN move, its parent-position
evaluation/PV, the FEN after the move, the opponent's sampled response, and `next`.
The scoring script can load this file and traverse `root.choices[*].next`.
Terminal and depth-limit nodes have no choices.

Use `npm run generate:tree -- --help` for all options. Defaults:

| Option | Default | Meaning |
| --- | --- | --- |
| `--depth` | `4` | Player decisions, each followed by a sampled opponent reply |
| `--search-depth` | `10` | Stockfish search depth for every analysis |
| `--multi-pv` | `256` | Analyze all legal moves for both sides, capped by the legal move count |
| `--timeout-ms` | `120000` | Maximum time per engine operation |
| `--name` | Unique timestamp | Output filename, without `.json` |
| `--engine` | Bundled Stockfish | Native executable or JavaScript engine wrapper |

The full, single-threaded [Stockfish.js engine](https://github.com/nmrugg/stockfish.js)
is included as a dependency. To use a native Stockfish executable, pass
`--engine "C:\tools\stockfish.exe"` or set `STOCKFISH_PATH`. Generation uses one
engine process, one search thread, and 64 MB of hash memory. Files are validated
before publication, become visible as complete JSON, and never overwrite existing
levels. Omit `--name` to generate multiple levels without filename collisions.

Four decisions can produce 85 analyzed player nodes, 340 choices/opponent replies,
and 256 leaves. MultiPV analysis of all legal moves at depth 10 can take several
minutes depending on the position and hardware. For a quick trial:

```powershell
npm run generate:tree -- --fen "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" --depth 1 --search-depth 4 --name quick-trial
```

Move selection follows Stockfish's rank order. The best candidate is always
included; good and inaccuracy candidates target losses of 50 and 150 centipawns
relative to best, while reserving distinct, worse moves for subsequent labels.
Bad is the worst analyzed candidate. Mate scores remain mate scores in JSON;
selection ranks forced wins above centipawn scores and forced losses below them,
preferring faster wins and slower losses. When the position lacks meaningful
evaluation gaps, these labels represent relative alternatives rather than strict
chess annotation thresholds. Fewer than four legal moves produce fewer choices.
Reducing `--multi-pv` limits the selection to Stockfish's top candidates and may
make the bad move less severe.

For each computer reply, the generator analyzes candidate moves and samples one:
40% Best, 40% Good, 18% Inaccuracy, and 2% Blunder (the existing `bad` category).
Reply candidates use the same selection rules, with losses measured from the
computer's perspective. When fewer than four candidates exist, the available
quality weights are renormalized. One reply is stored per player choice, including
the final decision; no reply is needed when the player move ends the game.
Generation uses `Math.random` by default, so repeated runs can produce different
trees. Programmatic callers can supply `GeneratorOptions.random` for reproducible
reply selection. MultiPV searches for replies can increase generation time.

Checkmate, stalemate, insufficient material, the fifty-move rule, and threefold
repetition end a branch before the depth limit. Both chess.js and Stockfish receive
the branch history. A starting FEN establishes no repetition history before
generation. Mate winners are actual colors; draws have `result: "draw"`.

Scored levels have a three-digit difficulty prefix, such as
[`043-7677a9a4-d23c-4d20-9aa8-868ae3ecc074.json`](src/levels/043-7677a9a4-d23c-4d20-9aa8-868ae3ecc074.json). Filenames sort from easiest to
hardest, and each level's stable GUID is the only suffix. Adding levels never
requires renumbering existing files. IDs stay stable when files are renamed or
rescored. This example illustrates four decisions at search depth 10.

For programmatic use, import `generateTree` from
`src/scripts/tree-generator/index.ts`; it returns `Promise<GeneratedLevel>`.
It validates its result and closes its engine even if generation fails. An
optional `AnalysisEngine` argument lets a caller own and reuse the process.

```powershell
npm run typecheck
npm test
```

Tests cover tree depth/branching, final opponent replies, draws and branch history,
mate and promotion handling, fewer legal moves, color perspective, invalid input,
JSON contract replay, UCI parsing, and real Stockfish integration.

## Generate and score a FEN text file

Create `fens.txt` with one complete FEN per line:

```text
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1
```

Run both generators for every position:

```powershell
npm run generate:levels
```

Each FEN job generates a tree, saves it, then scores its difficulty. By default,
one job runs at a time. To generate and score up to four FENs concurrently:

```powershell
npm run generate:levels -- --concurrency 4
```

Output goes to `src/levels` as `<three-digit-difficulty>-<level-guid>.json`.
Before scoring, filenames use a unique batch prefix and original line number,
such as `batch-<timestamp>-<id>-0001.json`. Blank lines and
lines starting with `#` are skipped; Windows line endings and a UTF-8 BOM are
supported. Duplicate FENs are processed separately.

Choose a filename prefix, output directory, or generation settings:

```powershell
npm run generate:levels -- --prefix puzzles --output-dir src/levels --depth 1 --search-depth 4
npm run generate:levels -- --config difficulty-config.json
npm run generate:levels -- --help
```

`--depth`, `--search-depth`, `--multi-pv`, and `--timeout-ms` control tree
generation. Difficulty settings, including analysis depths and timeout, come
from the scorer's defaults or `--config`. `--engine` (or `STOCKFISH_PATH`) applies
to both stages. `--concurrency` accepts 1–32 simultaneous jobs. Each active job
uses an independent single-threaded Stockfish process with 64 MB of hash memory,
plus engine overhead. Higher concurrency increases CPU and memory use; each FEN
can still take several minutes at the default depths. Progress is tracked per
source line and results are logged as they finish.

Programmatic callers can pass `BatchOptions.concurrency` to `generateLevelBatch`;
the returned results retain input order. A caller-supplied engine supports only
concurrency 1, since a Stockfish engine cannot analyze two positions simultaneously.

Existing files are never overwritten. Invalid FENs and engine/file failures are
reported with their source line number, and remaining lines continue. Any
failure sets exit code 1. If scoring fails after generation, the tree stays on
disk with `difficulty: -1`; retry it with `npm run score:levels -- <file.json>`.
Scoring replaces the temporary batch name with the difficulty and GUID. A new
run generates new GUIDs, so completed batches never need to be renamed manually.

## Score level difficulty

Preview estimated scores without changing any files, then write the scores:

```powershell
npm run score:levels -- --dry-run
npm run score:levels
```

By default, the scorer processes JSON files directly inside `src/levels` with
`difficulty: -1`. It replaces only the top-level difficulty number with an integer
from 0 to 100, preserving every other byte, including formatting and unknown fields.
Each successful update is written to a temporary file and published with a
three-digit difficulty prefix followed by the level's existing GUID, as
`043-7677a9a4-d23c-4d20-9aa8-868ae3ecc074.json`. Rescoring updates
the score prefix while preserving the GUID. Equal scores retain
distinct filenames, and adding levels requires no manual renaming. Already-scored
files are skipped unless `--rescore` is supplied. Dry runs keep filenames unchanged.
Existing destination files are never overwritten;
failed levels stay unchanged and the batch continues. A failure produces exit code 1.
The scorer also refuses to overwrite a level whose contents changed during analysis.

Select specific files, another directory, or already-scored levels:

```powershell
npm run score:levels -- src/levels/my-level.json
npm run score:levels -- --directory "C:\levels" --rescore
npm run score:levels -- --help
```

Use `--engine` or `STOCKFISH_PATH` for an alternative Stockfish executable.
Scoring uses one thread and 64 MB of hash memory. Each search clears engine state
and replays the full branch history so results are reproducible for the same input,
configuration and engine build, independently of previously scored positions.

Configuration defaults and validation live in
[`config.ts`](src/scripts/difficulty-scorer/config.ts). Use `--print-config` to
inspect the defaults and `--config <path>` to supply a JSON file of partial
overrides. Nested overrides preserve defaults for omitted values; unknown keys,
invalid thresholds and weights that do not sum to 1 are rejected. For example:

```json
{
  "depths": [4, 8, 12, 16],
  "acceptableLossCp": 50,
  "subtlety": { "quiet": 90 }
}
```

```powershell
npm run score:levels -- --config difficulty-config.json --rescore
```

The initial heuristic follows
[`02-level-difficulty`](docs/features/02-level-difficulty.md):

| Signal | Weight | Implementation |
| --- | --- | --- |
| Ambiguity | 35% | Mean alternative plausibility, `100 * exp(-loss / 100)`; blend stored and final offered-move analysis equally |
| Depth to separation | 25% | Earliest depth where the stored best choice leads every alternative by at least 80 cp and keeps that lead at all later sampled depths; normalize between the first and final depth |
| Subtlety | 20% | Quiet moves score 100; captures 35, checks 20, recaptures 15, promotions 10, check evasions 30; use the lowest applicable value |
| Uniqueness | 20% | `100 / acceptableMoveCount`, where acceptable moves lose at most 50 cp from the fresh analysis's best legal move |

The default depths are `[4, 6, 8, 10]`. At each depth, Stockfish analyzes every
offered choice using `searchmoves`. A separate final-depth MultiPV search measures
uniqueness across up to 256 legal moves by default. When all legal moves are
already offered, the final offered-move analysis is reused. Lowering `multiPv`
limits the separate uniqueness search to the top candidates; unexamined moves may
also be acceptable, so the uniqueness score may be overestimated. Higher depths
and all-move analysis can take several minutes per level.

Centipawn scores are clamped to ±10,000. Mate scores map to
`sign * (20,000 - min(abs(distance), 100) * 50)`, with mate zero treated as a loss.
This keeps forced wins above centipawn scores and forced losses below them, while
preferring faster wins and slower losses. Normalization, signal formulas and
aggregation are separate functions in
[`signals.ts`](src/scripts/difficulty-scorer/signals.ts).

Deeper analysis may prefer another offered move. The scorer reports these nodes
and still evaluates how distinguishable the original best choice is, preserving
all choices, labels and opponent replies. A sole-choice decision scores zero.
Terminal and depth-limit nodes contribute no decisions; a level with no decisions
scores zero without starting Stockfish.

Reach probabilities start at 1 and use best/good/inaccuracy/bad probabilities of
40%/35%/20%/5%. When fewer than four choices exist, the available probabilities are
renormalized. Overall difficulty is 80% of the reach-weighted mean plus 20% of the
reach-weighted 90th percentile, rounded and clamped to 0–100. The percentile uses
the first ascending score whose cumulative weight reaches 90% of total decision
weight. Leaves do not add weight. These are heuristic estimates; human difficulty
calibration remains future work.

For programmatic use, `scoreLevel` from
[`index.ts`](src/scripts/difficulty-scorer/index.ts) returns the overall score and
internal node scores without mutating its input. `scoreLevelFiles` from
[`files.ts`](src/scripts/difficulty-scorer/files.ts) handles batches, dry runs,
rescoring and file updates. Both accept an optional caller-owned `AnalysisEngine`.
Tests cover the signals, aggregation, mate normalization, branch probabilities,
byte preservation, batch failures, CLI behavior and real-engine reproducibility.
