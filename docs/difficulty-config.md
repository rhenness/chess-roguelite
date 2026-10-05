# Difficulty Config

Skill tier (`skillTier`) means beginner, intermediate, or expert. Difficulty score (`difficultyScore`) is the puzzle's numeric 0–100 rating, used to select and order puzzles within a tier.

## Current

For the existing regular runs and Daily Dungeon, the current gameplay difficulty is built around this process:

1. Choose starting FENs in `fens.txt`. The generation script builds and scores missing FEN/tier combinations for all three skill tiers by default. Use `--regenerate` to rebuild and rescore existing combinations. The following selection rules describe intermediate and the existing untagged levels.
2. Generate a move tree from the starting FEN, with 4 player decisions by default and up to 4 move options at each position. When at least 4 legal moves are available, the options are best, good, inaccuracy, and bad (blunder). The selection rules are fixed: good targets a 50-centipawn loss from best, inaccuracy targets a 150-centipawn loss, and bad uses the lowest-ranked analyzed move. These are targets, so the actual value spread and ambiguity depend on the position. With fewer than 4 legal moves, the generator offers all of them and assigns the labels in rank order. Opponent replies are also selected during generation, using intermediate weights of 40% best, 40% good, 18% inaccuracy, and 2% bad, adjusted when fewer options are available.
3. Process the generated move tree and assign it a difficulty score from 0–100. The score combines move ambiguity, depth to separation, best-move subtlety, and move uniqueness. Positions higher in the tree affect the overall difficulty more: their weight depends on the assumed chance of reaching them and scales by 0.5x for each player decision deeper in the tree. The final score is 80% weighted average and 20% weighted 90th percentile.
4. Save newly scored levels in `src/levels/<tierFolder>`. Regular runs and Daily Dungeon currently pull from intermediate and existing untagged levels in `src/levels`. Runs select up to 10 distinct scored levels spread across the available difficulty range and play them from easiest to hardest. Daily Dungeon uses a shared selection for the day. Endless uses live analysis instead of this level pool.
5. Each floor ends after its configured number of player decisions (4 by default), or earlier at checkmate, stalemate, or another draw. Reaching the decision limit, winning, or drawing completes the floor; being checkmated fails it. The player then moves to the next floor if one remains and they still have health. Running out of health ends the run immediately.
6. Players are awarded base points of 100/75/25/0 for best/good/inaccuracy/bad moves. Items can change the points awarded, and an early player checkmate awards best-move points for the remaining unplayed decisions.

## Proposed

Build off of this current difficulty rating system for 3 different player skill tiers: beginner, intermediate, and expert.

Each skill tier would use its own level folder and different parameters for move ambiguity, player options, opponent replies, and points gained in the workflow above.

| Skill Tier | Level Folder | Tree Generation | Player Move Options | Moves to Clear a Floor | Opponent Moves | Points Awarded |
| --- | --- | --- | --- | --- | --- | --- |
| Beginner | `src/levels/1-beginner` | Least ambiguous move trees | 2 options, focused on best vs. blunder | 4 player moves | Mix of good moves, inaccuracies, and blunders | Best: 50; Blunder: 0 |
| Intermediate | `src/levels/2-intermediate` | Moderately ambiguous move trees | 4 options: 1 best, 1 good, 1 inaccuracy, 1 blunder | 4 player moves | Mix of best, good, inaccuracy, and blunder | Best: 100; Good: 75; Inaccuracy: 25; Blunder: −25 |
| Expert | `src/levels/3-expert` | Most ambiguous move trees | 4 options: 1 best, 1 good, 2 inaccuracies | 4 player moves | Mix of best and good | Best: 150; Good: 100; Inaccuracy: −25 |

The shared `SKILL_TIER_CONFIG` constant in `src/config/difficulty.ts` includes a `skillTier` and `levelFolder` value for each tier. `npm run generate:levels` now reads `fens.txt`, generates and scores each position for all three tiers, and saves the levels in their tier folders. Use `--tier beginner`, `--tier intermediate`, or `--tier expert` to generate one tier, and `--concurrency` to set the number of jobs running at once. The level loader supports these subfolders and currently selects intermediate levels plus the existing untagged levels. Regular runs and Daily Dungeon still need a skill-tier chooser. The 0–100 `difficultyScore` continues to control selection and ordering within each tier.

The tree generation and opponent settings in this table are implemented in the generator. “Least” and “most” ambiguous describe the intended effect of the move-selection targets; the starting position still determines the actual evaluation gaps and difficulty score. All three tiers generate four player decisions, with fewer moves if a branch ends early. Points remain a gameplay proposal.

Generation skips duplicate input FENs and existing FEN/tier combinations. `--regenerate` builds fresh trees and scores, then deletes older files for those FENs and selected tiers after the replacements are saved. Existing untagged levels count as intermediate. Failed jobs keep their old levels, and `--resume` can finish pending replacements.

These point values are a starting proposal to tune during playtesting. Intermediate loses points for blunders, while expert loses points for inaccuracies. Negative points would require updating the current run rules, which only allow nonnegative point values.
