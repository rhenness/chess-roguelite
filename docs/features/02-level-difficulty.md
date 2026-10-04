## User Story

As a developer, I want to score the difficulty of generated chess levels after their branching trees have been created, so that each level receives a consistent difficulty value that can later be used by the game when selecting and ordering levels.

## Description

Generated level JSON files are created first with:

`difficulty: -1`

A separate difficulty-scoring script should then process those completed level files.

The scorer should use the existing precomputed decision tree together with additional Stockfish analysis to estimate the difficulty of each player decision and then aggregate those results into one overall level difficulty score.

The scorer should update only the top-level `difficulty` value while preserving the generated tree and all other level data.

This allows difficulty scoring to evolve independently from tree generation and makes it possible to rescore existing levels without regenerating them.

## Processing Flow

`Generated level JSON with difficulty: -1`
→ load level
→ analyze each DecisionNode
→ calculate node difficulty
→ aggregate node difficulties across the tree
→ calculate overall level difficulty
→ update difficulty
→ write JSON back to disk

## Node Difficulty

Each `DecisionNode` should receive an internal difficulty score from `0–100`.

The score should estimate how difficult it is for a player to identify the best move from the four available choices.

The initial implementation should use four signals.

### 1. Move Ambiguity — 35%

Measure how difficult it is to distinguish the best move from the alternatives.

Use:

- the evaluations already stored on the node,
- evaluation loss relative to the best move,
- additional Stockfish MultiPV analysis where useful.

A node should generally be harder when several plausible moves remain close to the best evaluation.

A node should generally be easier when the best move is clearly superior to the alternatives.

Mate evaluations should be normalized so they can be compared consistently with centipawn evaluations.

### 2. Depth to Separation — 25%

Use additional Stockfish analysis at multiple search depths to estimate how deeply the position must be analyzed before the best move becomes clearly distinguishable.

For example, the scorer may analyze the node at depths such as:

- shallow,
- medium,
- deep,
- final.

The exact depths should be configurable.

If multiple moves remain close at shallow and medium depths but the best move only separates at deeper analysis, the node should receive a higher difficulty score.

If the best move is clearly superior even at shallow depth, the node should receive a lower score.

### 3. Best-Move Subtlety — 20%

Estimate how obvious or forcing the best move appears.

The scorer may derive move characteristics from the node FEN and best move, including:

- check,
- capture,
- recapture,
- promotion,
- quiet move,
- other forcing characteristics.

Quiet or less immediately forcing moves should generally receive higher subtlety scores.

Obvious checks, captures, promotions, or strongly forcing moves should generally receive lower subtlety scores.

These rules should remain configurable and replaceable.

### 4. Move Uniqueness — 20%

Use Stockfish analysis to measure how many moves preserve an evaluation close to the best move.

A position where several moves perform similarly should generally be more forgiving.

A position where only one move maintains the evaluation while alternatives drop substantially should generally be more precise and difficult.

The acceptable evaluation-loss threshold for considering a move "close to best" should be configurable.

## Node Difficulty Formula

For the initial implementation:

`nodeDifficulty = 0.35 * ambiguity + 0.25 * depthToSeparation + 0.20 * subtlety + 0.20 * uniqueness`

Clamp the result to `0–100`.

The four signals should be implemented independently so their formulas and weights can be tuned later.

## Additional Stockfish Analysis

The scoring script is allowed to run Stockfish again.

This additional analysis should happen only during offline scoring and should not affect runtime gameplay.

The scorer should be able to perform:

- MultiPV analysis,
- analysis at multiple search depths,
- deeper re-analysis of the four existing candidate moves,
- evaluation-stability checks,
- move-uniqueness analysis.

The exact Stockfish depths, MultiPV count, and evaluation thresholds should be centralized in configuration.

The scoring script must not modify:

- the tree structure,
- player move choices,
- move classifications,
- opponent responses.

Its purpose is only to estimate difficulty.

## Level Difficulty

After calculating difficulty for every reachable `DecisionNode`, calculate one overall level difficulty.

The level difficulty should reflect the challenge of playing through the full branching tree rather than only the starting position.

### Reach Probability

Because player telemetry does not yet exist, use initial assumed probabilities for which move quality a player selects:

- Best: 40%
- Good: 35%
- Inaccuracy: 20%
- Bad: 5%

The root node has reach probability `1.0`.

Each child node's reach probability is:

`parentReachProbability * selectedMoveProbability`

These probabilities should be configurable and replaceable later with real player data.

### Decision Depth Discount

Weight earlier decisions more heavily while retaining reach probabilities for each branch:

`nodeWeight = reachProbability * depthDiscount ** decisionsTaken`

`depthDiscount` defaults to `0.5` and must be greater than `0` and at most `1`.
The root has `decisionsTaken: 0`, so it receives no discount. Each subsequent
decision depth halves the multiplier. In a full depth-four tree, the depths
contribute about 53.3%, 26.7%, 13.3% and 6.7% of the weighted mean. Both the mean
and percentile use these discounted weights. Set `depthDiscount` to `1` to
restore weighting by reach probability alone. Rescore existing levels to update
their saved ratings.

### Weighted Mean Difficulty — 80%

Calculate the weighted mean of all reachable `DecisionNode` difficulty scores using the discounted node weights.

This represents path difficulty with more influence given to earlier decisions.

### Weighted Peak Difficulty — 20%

Calculate the weighted 90th percentile of reachable node difficulty.

Use the same discounted node weights as the mean.

This allows difficult sections of the tree to affect the level score without allowing one extremely unlikely branch to dominate it.

### Level Difficulty Formula

For the initial implementation:

`levelDifficulty = 0.80 * weightedMeanDifficulty + 0.20 * weighted90thPercentileDifficulty`

Round the final value to an integer and clamp it to `0–100`.

Higher values indicate more difficult levels.

## Script Behavior

The scoring script should:

- Read generated level JSON files after tree generation has completed.
- Process levels with `difficulty: -1`.
- Validate `schemaVersion: 1`.
- Traverse all reachable `DecisionNode` entries.
- Run any required additional Stockfish analysis for each node.
- Calculate node difficulty.
- Calculate branch reach probabilities.
- Aggregate node scores into one overall level difficulty.
- Update only the top-level `difficulty` value.
- Preserve all other generated level data.
- Write the updated JSON back to disk.
- Support scoring multiple level files in one run.
- Support `--concurrency` for 1–32 simultaneous file jobs, defaulting to 1, including rescoring and dry runs.
- Use separate Stockfish processes for concurrent files, preserve input result order, and report progress per file.
- Report failures without preventing other valid levels from being processed.

## Initial Scope

The POC should support:

- `schemaVersion: 1`.
- `DecisionNode`, `DepthLimitNode`, and `TerminalNode`.
- Centipawn evaluations.
- Mate evaluations.
- Levels that terminate before the configured decision depth.
- Deterministic scoring for the same input and Stockfish configuration.
- Difficulty values from `0–100`.
- Rescoring existing levels without regenerating their trees.

## Out of Scope

This story does not include:

- Generating the decision tree.
- Modifying the generated tree.
- Changing Best / Good / Inaccuracy / Bad classifications.
- Changing opponent responses.
- Player telemetry.
- Machine-learning-based difficulty prediction.
- Run generation.
- React gameplay.
- Player health, score, relics, or other roguelike mechanics.
- Runtime Stockfish analysis.

## Design Considerations

Tree generation and difficulty scoring should remain separate workflows:

`FEN`
→ tree generation
→ `GeneratedLevel { difficulty: -1 }`
→ difficulty scoring
→ `GeneratedLevel { difficulty: 0–100 }`

This separation should allow existing levels to be rescored whenever the scoring algorithm, weights, thresholds, or Stockfish configuration changes.

All Stockfish settings, scoring weights, branch probabilities, thresholds, mate handling, and normalization logic should be centralized and configurable.

The initial algorithm is a heuristic. Future player telemetry should be able to supplement or replace assumed branch probabilities and node-difficulty heuristics without requiring the level-generation pipeline to change.

## POC Goal

Given one or more completed generated level JSON files with `difficulty: -1`, perform additional offline Stockfish analysis as needed, calculate a deterministic estimated difficulty from `0–100`, and write that value back to each level file without regenerating or modifying the existing decision tree.
