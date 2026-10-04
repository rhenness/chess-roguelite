## User Story

As a player, I want to continuously play through precomputed chess levels in increasing difficulty until I run out of health so that each session feels like a complete run with a clear progression curve.

## Description

The game should load precomputed level JSON files and use them to create a continuous gameplay run.

Before each run, show a modal with three visual cards: Default, Obsidian Order, and Gilded Court.
Show a visible "Choose your set" title, both colors of each set, and a short
benefit line with starting hearts and the initial square bonus. Preview all six
pieces on larger screens; compact previews show the king, queen, and knight in
both colors. On narrow mobile screens, stack landscape cards with previews beside
the name and benefits. Selecting a card begins the run immediately, without a
separate start button.
The initial chooser requires selection; during a run it can be dismissed to resume
play. Pause playback, notifications, and payout hopping while it is open and keep
the board dimensions and footer space unchanged.

Default uses the package's existing pieces, 3 starting health, and ×1.0/×1.1
square multipliers. Obsidian Order uses faceted silver/charcoal SVG pieces with
crimson gem inlays, 2 starting health, and ×1.0/×1.3 multipliers. Maintain separate
persistent square upgrades for each set and preserve existing Default saves.
Gilded Court uses ivory/dark green enamel SVGs, gold trim, ornamental engraving,
and emerald inlays. It starts with 3 health, ×1.5 on the four central squares
(d4, e4, d5, e5), and ×1.0 on the other 60 squares. Its description says
"Limited ×1.5 multis." Migrate earlier Gilded saves to this layout
while preserving all earned +0.1 upgrades at their original coordinates.
Keep Gilded upgrades separate. Fit all three cards in the mobile viewport and
keep benefit descriptions brief.

Default is available immediately. Unlock Obsidian Order after 3 finished runs and
Gilded Court after 8. Count both completed runs and deaths, but never abandoned
runs or console previews. Keep locked cards visible with muted previews, a lock,
and a compact counter such as `2/3`; disable their selection. Save the finished-run
count and last counted run ID in the versioned `knightfall.progression.v1`
localStorage entry as soon as a run ends, so skipping payout cannot lose credit.
Each run counts once, including on rerenders and when reopening the score modal.
If storage is unavailable, retain progression in memory for the session. Show a
shared board notification for a newly unlocked set after payout and any square
upgrade, before opening the final score modal.

Each run randomly selects 10 distinct scored levels, or all playable levels if fewer are available, then sorts the selection in ascending difficulty order. The player starts with the easiest selected level and progresses through increasingly difficult levels while health and score persist across the entire run.

The run ends when the player's health reaches 0.

## Technology

The gameplay application should use the same core technologies and project setup as `fourced-move`.

Use:

- React 19
- TypeScript
- Vite
- `chess.js`
- `react-chessboard`
- `lucide-react`
- Vitest
- React Testing Library
- jsdom

The implementation should follow the existing `fourced-move` setup as closely as practical rather than introducing a new frontend framework, state-management library, chessboard library, or build system for the POC.

The reference package configuration is:

```json
{
    "name": "fourced-move",
    "private": true,
    "version": "0.1.0",
    "type": "module",
    "scripts": {
        "start": "vite",
        "build": "tsc --noEmit -p tsconfig.app.json && vite build --configLoader runner",
        "preview": "vite preview",
        "test": "vitest run",
        "test:watch": "vitest"
    },
    "dependencies": {
        "chess.js": "^1.4.0",
        "lucide-react": "^1.49.0",
        "react": "^19.1.1",
        "react-chessboard": "^5.12.1",
        "react-dom": "^19.1.1"
    },
    "devDependencies": {
        "@testing-library/jest-dom": "^6.8.0",
        "@testing-library/react": "^16.3.0",
        "@types/react": "^19.1.10",
        "@types/react-dom": "^19.1.7",
        "@vitejs/plugin-react": "^5.0.2",
        "jsdom": "^26.1.0",
        "stockfish": "^19.0.0",
        "typescript": "~5.8.3",
        "vite": "^7.1.4",
        "vitest": "^3.2.4"
    }
}
```

Stockfish should not be required during runtime gameplay. Levels should already contain the precomputed player choices, opponent responses, and difficulty scores needed by the game.

## Level Selection

At the beginning of the run, load all available precomputed levels with a valid difficulty score.

For the initial POC:

- Exclude levels with `difficulty: -1`.
- Randomly select 10 distinct playable levels for each new run; use all levels if fewer than 10 are available.
- Sort the selected levels in ascending order by `difficulty`, with stable ID ordering for equal scores.
- Start the run with the lowest-difficulty selected level.
- After a level is completed, advance to the next level in difficulty order.
- Levels should not repeat during the same run.
- Health and score persist as the player progresses through increasingly difficult levels.
- Reaching the end of the selected levels with health remaining completes the run.

More advanced level selection, acts, bosses, and run generation can be added later.

## Level Gameplay

Each level is driven entirely by its precomputed decision tree.

The player controls the side defined by the level's `playerColor`.

At each `DecisionNode`:

- Display the board using the node's FEN.
- Present the four available player choices.
- Allow the player to select a colored option and confirm it with a second tap,
  or tap a piece followed by a destination belonging to an offered move.
- Highlight only that piece's offered destinations, ignore other moves, and let
  the player switch pieces or tap the selected piece again to deselect it.
- When offered promotions share a source and destination, show promotion pieces
  in the existing colored buttons and require an explicit piece choice.
- Play the selected move on the board.
- Reveal the move's quality:
    - Best
    - Good
    - Inaccuracy
    - Bad
- Apply the appropriate score and health effect.
- Play the precomputed opponent reply when one exists.
- Advance to the `next` node associated with the player's selected branch.

The selected player move must determine which branch is followed.

The game should continue through the level until:

- the branch reaches a `DepthLimitNode`,
- the branch reaches a `TerminalNode`,
- or the player's health reaches 0.

## Health Rules

Health belongs to the run and persists across levels.

Suggested POC rules:

- Start Default and Gilded Court runs with 3 health and Obsidian Order runs with 2 health.
- Best: lose 0 health.
- Good: lose 0 health.
- Inaccuracy: lose 1 health.
- Bad: lose 2 health.

Health is not automatically restored when a level ends.

If health reaches 0 at any point, the run immediately ends.

Health values and damage amounts should be configurable.

## Scoring Rules

Score also persists across the entire run.

Suggested POC values:

- Best: 100 points.
- Good: 75 points.
- Inaccuracy: 25 points.
- Bad: 0 points.

The base run score is the sum of points earned across all player decisions in all levels, including early checkmate bonuses. The final score applies the end-of-run square multiplier and rounds once.

When the player wins by checkmate before the floor's configured decision depth,
award `max(0, decisionDepth - decisionsTaken) * points.best` once as a completion
bonus. For example, mating on move two of a four-decision floor adds 200 points
with the default rules. These points do not count as played moves, extend the
Best-move streak, or grant health. Draws, losses, and terminal starting positions
receive no bonus.

Scoring values should be configurable.

## Level Completion

A level is successfully completed when the current branch reaches a `DepthLimitNode` while the player still has health remaining.

If a `TerminalNode` is reached:

- If the terminal result favors the player, treat the level as completed.
- If the result is a draw, treat the level as completed.
- If the terminal result favors the opponent, treat the level as failed.

If the player still has health after a level ends, advance to the next level in difficulty order.

## Run Completion

The run ends when either:

- the player's health reaches 0, or
- the player reaches the end of the selected levels.

The final run result should show:

- Final multiplied score, with the base score and selected multiplier.
- Number of levels completed.
- Total decisions made.
- Best move count.
- Good move count.
- Inaccuracy count.
- Bad move count.

The player should be able to start a new run from the result screen.

## Persistent Board Multipliers

Default initially alternates between ×1.0 and ×1.1, and Obsidian Order between ×1.0 and ×1.3. Gilded Court starts with ×1.5 on d4, e4, d5, and e5, and ×1.0 on the other 60 squares. Every ended run, including a defeat, receives one score payout. On lethal damage, show a skull and "Run over" notification instead of a numeric health-loss badge. After the notification completes, clear the board's pieces, reveal the multipliers using the existing board, and animate a highlight between squares before landing. Keep gameplay's stored position intact so new runs and console previews restore their pieces. Select the landing square once before animating and apply its pre-upgrade multiplier to the base score.

Completing all ten levels successfully earns one random square a permanent +0.1 upgrade. Fewer than ten completed levels earns no upgrade. Keep the current payout separate from the upgrade so a newly upgraded square only improves future payouts. Store the square multipliers as integer tenths in versioned localStorage and apply each earned upgrade once, including when the score modal is reopened or the remaining animation is skipped for a new run.

Use the shared board notification for the multiplier result and then for the upgraded square. Open the final score modal after the sequence finishes. Preserve the board dimensions throughout, keep multipliers attached to square coordinates when flipping, and skip hopping when reduced motion is preferred. A console preview should play the sequence without modifying gameplay or persistent progression.

## Coins and Purchased Upgrades

Show one shared coin balance in the set chooser and a separate upgrade icon beside
each unlocked card. Selecting the card starts a run; selecting its upgrade icon
opens a modal without starting or resetting gameplay. Locked sets have no upgrade
action and retain the same gray styling.

Display all 64 square multipliers immediately, with pieces cleared and stronger
coloring for higher values. Initially select no square. Tapping a square highlights
it and shows its current multiplier, the value after +0.1x, and a coin-price button.
Require a separate purchase tap. Disable purchasing without enough coins; keep
the board and checkout dimensions fixed through selection and purchase. Use the
shared board notification for purchases. Closing the modal returns to set selection.

When a run ends, award floor(base score / 25) coins, plus 20 if all its selected
levels were successfully completed. Deaths retain score-based coins. Unfinished
runs, abandoned runs, and console previews earn nothing. Credit coins with the
finished-run count once, before payout presentation, and show the earned amount
in the final score modal. The score multiplier never increases coin rewards.

Each square's first paid +0.1x costs 30 coins; later purchases on the same square
cost 40, 50, and so on. Price depends on paid purchases, not starting bonuses or
free upgrades. Keep paid counts per square and set, while sharing the wallet.
Save the debit and purchased increment together in `knightfall.progression.v1`.
Preserve existing run-count saves and free-upgrade boards; older saves start with
zero coins and no paid increments. Retain purchases in memory if storage is blocked.

Combine purchased increments with each set's saved free-upgrade board for display
and payouts. Snapshot a finished run's multipliers even while its death notification
or chooser pauses payout, so shopping cannot alter that result. Completing all
10 levels still gives the existing free random upgrade, without double-counting
paid increments when that free upgrade is saved.

## Basic Gameplay Flow

`Start Run`
→ load scored levels
→ randomly select 10 distinct levels (or all if fewer are available)
→ sort by difficulty ascending
→ initialize health and score
→ load easiest level
→ play through level
→ update persistent health and score
→ level ends
→ if health > 0, load next harder level
→ repeat
→ health reaches 0 or all selected levels are completed
→ wait for any health notification
→ board payout and optional square-upgrade notification
→ Run Over / Run Complete

Within each level:

`DecisionNode`
→ show four move choices
→ player selects one
→ play selected move
→ reveal move quality
→ update health and score
→ play precomputed computer reply
→ advance to selected branch
→ repeat

## Initial Scope

The POC should support:

- Loading multiple generated level JSON files.
- Ignoring unscored levels with `difficulty: -1`.
- Sorting levels by ascending difficulty.
- Starting a run with fixed health.
- Progressing through levels in difficulty order.
- Preventing level repetition within a run.
- Randomizing levels with identical difficulty scores if desired.
- Rendering the board from FEN.
- Respecting each level's `playerColor`.
- Displaying the four precomputed player choices.
- Allowing the player to select a move.
- Following the correct precomputed branch after selection.
- Playing the precomputed opponent response.
- Persistent health across levels.
- Persistent score across levels.
- Move-quality feedback.
- Level transitions.
- Run-over state when health reaches 0.
- Run-complete state if all available levels are completed.
- A basic run summary.
- Starting a new run.
- Basic automated coverage using Vitest and React Testing Library for the core gameplay and run-state behavior.

## Out of Scope

This story does not include:

- Random difficulty-based run generation.
- Acts.
- Boss levels.
- Relics and additional progression systems beyond square multipliers, coins, and set unlocks.
- Accounts.
- Leaderboards.
- Custom artwork or advanced visual effects.
- Audio.
- AI explanations.
- Runtime Stockfish analysis.
- Regenerating or modifying level JSON files.
- Dynamically adjusting difficulty during a run.
- Replacing the existing `fourced-move` technology stack with a different framework or architecture.

## Design Considerations

The game should treat a run as the top-level gameplay session.

Health and score belong to the run rather than to an individual level.

Level selection should be implemented separately from level gameplay so that more advanced selection logic can later use:

- level difficulty,
- acts,
- level tags,
- boss rules,
- randomization,
- seeded runs.

The POC should use ascending level difficulty intentionally so that playtesting also validates whether the generated difficulty scores produce a sensible progression.

Gameplay should rely entirely on the precomputed level tree. No Stockfish analysis should be required while playing.

The implementation should favor the same patterns and technologies already used by `fourced-move` so that code and concepts can be reused where appropriate.

## POC Goal

Given a pool of precomputed level JSON files with difficulty scores, randomly select up to 10 distinct levels per run and play them from easiest to hardest while maintaining health and score, ending when the player runs out of health or completes the selected levels.

The implementation should use the same core React, TypeScript, Vite, chess.js, and react-chessboard stack as `fourced-move`.
