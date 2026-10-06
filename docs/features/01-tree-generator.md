## User Story

As a developer, I want to generate a precomputed branching chess tree from a starting FEN so that the game can play through multiple player decisions without running Stockfish during gameplay.

## Description

Given a valid starting FEN, the tree generator uses Stockfish to generate a fixed-depth decision tree. The public command is `npm run generate:levels`: it reads `fens.txt`, generates and scores all registered generation profiles, and publishes results in `src/levels/<options>-options-<depth>-depth`. `--profile` selects one recipe and `--concurrency` limits simultaneous FEN/profile jobs. Generation and scoring remain reusable modules within this pipeline.

At each player decision:

- Analyze the current position with Stockfish.
- Select distinct candidate moves using `GENERATION_PROFILES` in `src/config/generation.ts`: `2-options-4-depth-10` offers Best and Bad; `4-options-4-depth-10` offers Best, Good, Inaccuracy, and Bad; recipes 20, 30, and 40 offer Best, Good, and two distinct Inaccuracies. Their loss targets tighten from 25 / 50 / 100 cp (20), to 10 / 25 / 50 cp (30), to 5 / 15 / 30 cp (40). Fewer legal moves produce fewer choices.
- Create a separate branch for each move.
- Apply the selected player move.
- Analyze the resulting position with Stockfish.
- Sample and play a computer reply using the profile's weights. `4-options-4-depth-10` uses 40% Best, 40% Good, 18% Inaccuracy, and 2% Blunder; `2-options-4-depth-10` uses 0/40/40/20, `4-options-4-depth-20` uses 60/40/0/0, and recipes 30 and 40 use 100/0/0/0. Available weights are renormalized; a sole legal reply is always played.
- Use the resulting position as the next player decision node.
- Continue recursively until the configured decision depth is reached.

For the initial proof of concept, the tree should support 4 player decisions.

## Initial Scope

Normal pipeline runs skip existing root-FEN/profile/depth combinations and duplicate input FENs. Existing untagged levels map to `4-options-4-depth-10`. `--regenerate` builds and scores fresh trees for the selected FENs and profiles, then deletes all older matching level files after each replacement is published. Failed jobs retain their old levels; pending regeneration is remembered by `--resume`.

The POC should support:

- Accepting a valid FEN as input.
- Configurable tree depth, defaulting to 4 player decisions.
- Stockfish MultiPV analysis for player candidate move selection.
- Selecting the configured move options for each generation profile.
- Generating a separate branch for each distinct player choice.
- Using Stockfish MultiPV analysis and weighted selection for the computer opponent's reply.
- Storing the resulting FEN for each child node.
- Storing relevant Stockfish evaluation data with each player move.
- Detecting terminal positions where further expansion is not possible.
- Serializing each generated level as JSON.
- Saving unscored trees in `src/levels/.staging/<options>-options-<depth>-depth` before scoring and publication in `src/levels/<options>-options-<depth>-depth`.

## Output

Generated levels should be written to:

`/src/levels/<options>-options-<depth>-depth`

Each generated level should be stored as its own JSON file so it can be inspected independently and later consumed by the game.

## Out of Scope

This story does not include:

- Node difficulty scoring.
- Overall level difficulty scoring.
- Run generation.
- Player health or scoring.
- Relics or other roguelike systems.
- React gameplay UI.
- Runtime Stockfish analysis.
- A persistent level database beyond the JSON files stored in `src/levels/`.

## POC Goal

Given a starting FEN and generation profile, generate a complete branching tree representing up to 4 player decisions, where every configured player choice leads to its own branch followed by a sampled computer response using that profile's weights.

The completed tree is saved in staging and then scored by the same command. The final JSON file is published in the option-count/depth folder with a three-digit difficulty score and stable UUID in its filename. `--resume` retries scoring of pending trees using the same input file, profile and decision depth without generating new trees.

## Proposed JSON Interface

The TypeScript contract is defined in [`src/types/level.ts`](../../src/types/level.ts).
Each JSON file contains one `GeneratedLevel`, with generation metadata and a
nested `root` tree. The root's FEN is the starting position, and `playerColor`
is inferred from the active color in that FEN.

Each decision node contains its FEN, the number of player decisions already
taken, Stockfish's best evaluation, and the available choices. Each choice
contains its quality label, the player's move in UCI and SAN notation, its
MultiPV evaluation, the FEN after the player move, the opponent's sampled reply,
and the next node. Evaluations always use the player's perspective, including
mate scores, so values remain comparable across the tree.

Contract rules:

- `id` is a stable unique string, generated as a UUID and independent of the filename.
- `schemaVersion` is `2`; the numeric puzzle rating is stored as `difficultyScore`.
- New files include `generation.profileId`, `profileVersion`, `targetOptionCount`, and frozen `playerQualities`; they contain no top-level `skillTier`. Legacy tags and untagged files are normalized on load without changing their files or trees. Validation uses stored recipes independently of current profile registrations.
- `decisionDepth` defaults to `4` and counts player decisions, not individual
  moves or Stockfish search depth. The root has `decisionsTaken: 0`, and every
  choice increments it by one.
- Each ordinary decision has distinct moves with the stored recipe's quality
  sequence. `4-options-4-depth-20` allows two distinct moves labeled `inaccuracy`. If fewer legal
  moves exist than configured options, emit fewer choices using the first labels
  in that sequence; always include the best move. Selection loss targets remain
  a generator concern and do not guarantee particular evaluation gaps.
- A choice's evaluation comes from analysis of the parent position, and its
  principal variation starts with that choice's player move.
- Opponent candidates use the same quality selection rules from the opponent's
  perspective. Blunder corresponds to the existing `bad` category. If fewer than
  four candidates exist, renormalize the available weights.
- The opponent plays a sampled reply even on the final configured decision,
  unless the player move already ended the game.
- `opponentReply` is `null` only if the player move ends the game; in that case,
  `next` is terminal and its FEN equals `fenAfterPlayerMove`.
- After an opponent reply, `next.fen` is the resulting position. If play can
  continue, it is another decision node or a depth-limit node.
- Terminal detection takes precedence over the depth limit. Terminal and
  depth-limit nodes have no choices. A terminal starting FEN produces a terminal
  root with `decisionsTaken: 0`.
- Checkmate records the winning color; stalemate and other detected draws record
  `result: "draw"`. History-dependent draws require tracking the branch's move
  history; a starting FEN alone cannot establish prior repetition.
- Interfaces describe the JSON shape; the generator must validate these rules
  when producing files.
