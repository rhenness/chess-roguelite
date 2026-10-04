## User Story

As a developer, I want to generate a precomputed branching chess tree from a starting FEN so that the game can play through multiple player decisions without running Stockfish during gameplay.

## Description

Given a valid starting FEN, the tree generator should use Stockfish to generate a fixed-depth decision tree.

At each player decision:

- Analyze the current position with Stockfish.
- Select 4 candidate moves representing Best, Good, Inaccuracy, and Bad.
- Create a separate branch for each move.
- Apply the selected player move.
- Analyze the resulting position with Stockfish.
- Sample and play a computer reply with weights of 40% Best, 40% Good, 18% Inaccuracy, and 2% Blunder.
- Use the resulting position as the next player decision node.
- Continue recursively until the configured decision depth is reached.

For the initial proof of concept, the tree should support 4 player decisions.

## Initial Scope

The POC should support:

- Accepting a valid FEN as input.
- Configurable tree depth, defaulting to 4 player decisions.
- Stockfish MultiPV analysis for player candidate move selection.
- Selecting one Best, Good, Inaccuracy, and Bad move at each player node.
- Generating a separate branch for each of the 4 player choices.
- Using Stockfish MultiPV analysis and weighted selection for the computer opponent's reply.
- Storing the resulting FEN for each child node.
- Storing relevant Stockfish evaluation data with each player move.
- Detecting terminal positions where further expansion is not possible.
- Serializing each generated level as JSON.
- Writing generated level JSON files to the `src/levels/` directory.

## Output

Generated levels should be written to:

`/src/levels`

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

Given a starting FEN, generate a complete branching tree representing up to 4 player decisions, where every player choice leads to its own branch, followed by a sampled computer response: 40% Best, 40% Good, 18% Inaccuracy, and 2% Blunder.

The completed tree should be serialized to a JSON file in the `src/levels/` directory.

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
- `schemaVersion` starts at `1`.
- `decisionDepth` defaults to `4` and counts player decisions, not individual
  moves or Stockfish search depth. The root has `decisionsTaken: 0`, and every
  choice increments it by one.
- Each ordinary decision has four distinct moves, one for each quality label.
  If fewer than four legal moves exist, emit fewer choices with distinct moves
  and labels; always include the best move. Quality selection thresholds remain
  a generator concern.
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
