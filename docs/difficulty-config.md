# Difficulty Config

Skill tier (`skillTier`) belongs to a run and means beginner, intermediate, or expert. A generation profile describes a recipe for building trees. Difficulty score (`difficultyScore`) is the resulting puzzle's numeric 0–100 rating, used to select and order puzzles.

| Config | Responsibility |
| --- | --- |
| `src/config/generation.ts` | Generation profiles, player options, opponent replies, decision depth, output folders |
| `src/scripts/difficulty-scorer/config.ts` | Analysis depths, signals, weights, and difficulty aggregation |
| `src/config/difficulty.ts` | Run tiers, target option counts, score ranges, floor count, health, damage, and points |

## Current

For the existing regular runs and Daily Dungeon, the current gameplay difficulty is built around this process:

1. Choose starting FENs in `fens.txt`. The generation script builds and scores missing FEN/profile/depth combinations for every registered generation profile by default. Use `--regenerate` to rebuild and rescore existing combinations. The following selection rules describe `4-options-4-depth-10` and existing untagged levels.
2. Generate a move tree from the starting FEN, with 4 player decisions by default and up to 4 move options at each position. When at least 4 legal moves are available, the options are best, good, inaccuracy, and bad (blunder). The selection rules are fixed: good targets a 50-centipawn loss from best, inaccuracy targets a 150-centipawn loss, and bad uses the lowest-ranked analyzed move. These are targets, so the actual value spread and ambiguity depend on the position. With fewer than 4 legal moves, the generator offers all of them and assigns the labels in rank order. Opponent replies are also selected during generation, using `4-options-4-depth-10` weights of 40% best, 40% good, 18% inaccuracy, and 2% bad, adjusted when fewer options are available.
3. Process the generated move tree and assign it a difficulty score from 0–100. The score combines move ambiguity, depth to separation, best-move subtlety, and move uniqueness. Positions higher in the tree affect the overall difficulty more: their weight depends on the assumed chance of reaching them and scales by 0.5x for each player decision deeper in the tree. The final score is 80% weighted average and 20% weighted 90th percentile.
4. Save newly scored levels in `src/levels/<options>-options-<depth>-depth`. Regular runs and Daily Dungeon select the tier's target option count and inclusive difficulty-score range: beginner uses two-option scores 0–39, intermediate uses four-option scores 45–68, and expert uses four-option scores 58–100. Existing untagged levels belong to the four-option pool. Runs select up to 10 distinct scored levels spread across the available difficulty range and play them from easiest to hardest. Daily Dungeon uses a shared selection for each day and skill tier. Endless uses live analysis instead of this level pool.
5. Each floor ends after its configured number of player decisions (4 by default), or earlier at checkmate, stalemate, or another draw. Reaching the decision limit, winning, or drawing completes the floor; being checkmated fails it. The player then moves to the next floor if one remains and they still have health. Running out of health ends the run immediately.
6. Players gain or lose base points according to their skill tier in the table below. The total cannot fall below zero. Items can boost positive awards, and an early player checkmate awards that tier's best-move points for the remaining unplayed decisions.

## Skill Tiers

Build off of this difficulty rating system for 3 different player skill tiers: beginner, intermediate, and expert.

Level folders group trees by target player option count and decision depth: beginner uses `2-options-4-depth`, while intermediate and expert share `4-options-4-depth`. New levels record `generation.profileId`, `profileVersion`, `targetOptionCount`, and a frozen `playerQualities` recipe. All four-option profiles feed the shared pool: a `4-options-4-depth-20` tree scoring 42 belongs to intermediate, and a `4-options-4-depth-10` tree scoring 60 belongs to expert. Runtime eligibility uses the stored target option count and score, independently of the profile ID or its current config. The selected run tier determines health, damage, and points.

### Difficulty-score ranges

| Run Tier | Level Pool | Inclusive Score Range |
| --- | --- | --- |
| Beginner | `src/levels/2-options-4-depth` | 0–39 |
| Intermediate | `src/levels/4-options-4-depth` | 45–68 |
| Expert | `src/levels/4-options-4-depth` | 58–100 |

These cutoffs follow playtesting feedback that scores below 45 feel too easy for an intermediate player. Beginner keeps the two-option range, while intermediate starts at 45 and expert starts at 58. Each pool can supply a ten-floor run from the current catalog.

Intermediate and expert share the four-option pool and intentionally overlap at scores 58–68. Bounds are inclusive: 45 and 68 qualify for intermediate, and 58 and 100 qualify for expert. Four-option levels below 45 are excluded from new runs. Generation still saves every scored level, including those outside the current run ranges, so cutoffs can change without regenerating or deleting trees.

These are initial playtesting settings rather than calibrated measures of player ability. Tune `run.difficultyScoreRange` in `src/config/difficulty.ts` as the catalog and playtesting evidence grow. Saved regular and daily runs retain their original floors and rules, even when later score-range changes would exclude those floors from a new run.

### Generation profiles

| Profile ID | Output Folder | Player Options | Opponent Weights: Best / Good / Inaccuracy / Blunder |
| --- | --- | --- | --- |
| `2-options-4-depth-10` | `src/levels/2-options-4-depth` | Best and worst analyzed move | 0 / 40 / 40 / 20% |
| `4-options-4-depth-10` | `src/levels/4-options-4-depth` | Best, good (50 cp loss), inaccuracy (150 cp loss), worst | 40 / 40 / 18 / 2% |
| `4-options-4-depth-20` | `src/levels/4-options-4-depth` | Best, good (25 cp loss), two inaccuracies (50 / 100 cp loss) | 60 / 40 / 0 / 0% |
| `4-options-4-depth-30` | `src/levels/4-options-4-depth` | Best, good (10 cp loss), two inaccuracies (25 / 50 cp loss) | 100 / 0 / 0 / 0% |
| `4-options-4-depth-40` | `src/levels/4-options-4-depth` | Best, good (5 cp loss), two inaccuracies (15 / 30 cp loss) | 100 / 0 / 0 / 0% |

Recipes 30 and 40 target closer alternatives and always choose the best analyzed opponent reply. Recipe 40 tightens the loss targets further, aiming for harder choices at the same depth; the resulting score still determines run eligibility.

Profile IDs follow `<option-count>-options-<depth>-depth-<recipe-number>`. Higher recipe numbers aim for harder levels within the same option count and default depth; the scorer measures the actual result. Leave gaps (10, 20, 30) so a recipe can be added at 15. Add a new ID for a distinct recipe, and increment that profile's `profileVersion` when revising it. All current recipes default to four player decisions, ending branches earlier when the game ends. A `--depth` override writes to the matching depth folder; the stored profile ID identifies the selected recipe and its default depth, while `generation.decisionDepth` records the actual depth. Resume must use the same depth override. Loaders also accept old profile names that omitted the default depth.

`GENERATION_PROFILES` in `src/config/generation.ts` contains only generation settings. `npm run generate:levels` processes all registered profiles. Use `--profile` with an ID from the table to select one, and `--concurrency` to limit simultaneous jobs. No recipe assigns a run skill tier.

### Run points

| Run Tier | Best | Good | Inaccuracy | Blunder |
| --- | --- | --- | --- | --- |
| Beginner | 50 | 0 | 0 | 0 |
| Intermediate | 100 | 75 | 25 | −25 |
| Expert | 150 | 100 | −25 | 0 |

Every tier starts with 3 health; best and good moves cause no damage, inaccuracies cost 1 health, and blunders cost 2. All four-option recipes can appear in either four-option run tier, with points determined by the selected run tier. `SKILL_TIER_CONFIG` contains only these runtime rules and selection settings.

### Existing levels

Loaders map legacy level tags without modifying JSON files, trees, or IDs: beginner maps to `2-options-4-depth-10`, intermediate to `4-options-4-depth-10`, and expert to `4-options-4-depth-20`. Untagged levels map to `4-options-4-depth-10`; legacy `generation.configVersion` becomes `profileVersion` (default 1). The historical quality recipes are fixed in the compatibility layer, so later generation config changes cannot invalidate old trees. New levels contain no top-level `skillTier`; saved runs still retain their selected `skillTier`.

When players first start the app, they choose their skill tier. That defaults their first run. Before each new regular or daily run, they can change it; the app remembers their latest choice. Saved runs keep their original skill tier, rules, floor count, and selected levels. Older runs remain intermediate with their original rules. If a tier has no playable levels, entry is disabled until another tier is selected.

Daily Dungeon allows one attempt per UTC day across all skill tiers. The tier locks when the player enters. Players in the same tier get the same daily selection, and everyone shares one leaderboard ranked by final score, with each entry showing its skill tier.

Generation skips duplicate input FENs and existing FEN/profile/depth combinations. `--regenerate` builds fresh trees and scores, then removes older matching files only after each replacement succeeds. Failed jobs retain their old levels, and `--resume` finishes pending scoring and replacement cleanup. Resume uses the same input file, line positions, profile ID, profile version, decision depth, and output root.

These point values are a starting point to tune during playtesting. Intermediate loses points for blunders, while expert loses points for inaccuracies. Score boosts only affect positive awards; blocking damage does not block a points penalty.
