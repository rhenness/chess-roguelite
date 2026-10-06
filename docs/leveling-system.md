# Player leveling

Implemented phase one, October 2026. Player level recognizes accumulated play in Regular, Daily, Standard Endless, and Hardcore Endless. It is permanent, independent of skill difficulty and leaderboard score, and stored locally with the player's other saves.

## Earning XP

| Play | XP |
| --- | --- |
| Reach the end of a Regular or Daily run | 100 |
| Defeat | Credit for settled floors plus partial credit for decisions on the unfinished floor |
| Either Endless mode | 5 per two committed player decisions, banked as play continues |

For a ten-floor dungeon each settled floor is worth 10 XP, whether its outcome is completed or failed. Defeat earns `floor(100 × (settled floors + min(0.9, current-floor decisions / planned decision depth)) / actual floor count)`. Three settled floors and two of four decisions on the unfinished floor earn 35 XP. A lethal decision counts as participation. Settled floors cannot be counted again as partial floors. Reaching the available dungeon's end always gives 100 XP, including an early checkmate or a shorter available catalog.

Dungeon XP is awarded on finishing, before the coin payout. Pause/resume retain the run's potential award. Replacing an unfinished dungeon or allowing a Daily to expire grants no XP in this release. Endless banks pairs immediately; its receipt holds the total credited for the session, so refresh, finishing, or repeated engine updates do not add that total again. An unpaired move is preserved by the saved session; abandoning that session leaves it uncredited.

Score, accuracy, move quality, difficulty, items, streaks, coin multipliers, engine waiting, idle tabs, and elapsed wall-clock time do not change XP. This is a predictable measure of participation, not an exact timer. Fast players and early mates earn XP faster per minute. There are no XP boosts, daily streak requirements, level-based gameplay advantages, or additional cosmetic unlocks in phase one. Existing piece-set unlocks retain their finished-run rules.

## Level curve

Start at Bronze, Level 1, with 0 XP. Eight levels form each tier. The first two transitions cost 50 XP apiece; the remaining Bronze transitions cost 100. Transitions out of later tiers cost 200, 300, 400, 500, 600, 700, and 800 respectively. Level numbering continues across tiers.

| Tier | Levels | Entry XP | Equivalent completed runs |
| --- | --- | ---: | ---: |
| Bronze | 1–8 | 0 | 0 |
| Silver | 9–16 | 700 | 7 |
| Gold | 17–24 | 2,300 | 23 |
| Platinum | 25–32 | 4,700 | 47 |
| Emerald | 33–40 | 7,900 | 79 |
| Diamond | 41–48 | 11,900 | 119 |
| Crown | 49–56 | 16,700 | 167 |
| Legend | 57–64 | 22,300 | 223 |

Level 64 is reached at 27,900 XP. The current map ends there, but lifetime XP continues to accumulate so a future extension can honor further play. The display shows a full progress bar at 64. The curve is versioned as rules v1; changing thresholds requires a deliberate migration rather than silently lowering existing players' levels.

## State and persistence

[playerLeveling.ts](../src/game/playerLeveling.ts) owns the threshold table, selectors, award rules, migration, save validation, and receipt union. [usePlayerLeveling.ts](../src/game/usePlayerLeveling.ts) connects run and Endless state to storage and React. Level, tier, and progress are derived; they are never separately saved.

Storage key: `knightfall.player-leveling.v1`.

```ts
{
  version: 1,
  rulesVersion: 1,
  legacyXp: number,
  legacyDailyThrough: string | null,
  receipts: { [sourceId: string]: number }
}
```

Receipt keys are `run:<run id>`, `daily:<UTC date>`, and `endless:<session id>`. Dungeon receipts are final, including zero-XP finishes. Daily date prevents an alternate/restored attempt ID from paying twice. Endless receipts increase to the greatest credited checkpoint. XP and its receipt are written in the same localStorage value, and lifetime XP is the sum of the legacy grant and receipt totals, bounded to a safe integer.

Storage updates merge receipt unions, taking the greatest value for the same source, and listen for other-tab events. This handles duplicate React effects, resumed sessions, old results, and ordinary cross-tab changes without paying twice. LocalStorage is not a server-side transaction or anti-cheat authority; simultaneous tab shutdown during conflicting writes is not guaranteed to preserve every update. A future synced account system should store authoritative receipts transactionally. Blocked storage preserves state in memory for the current session and exposes a persistence warning. Malformed or unsupported saves fall back to a validated legacy migration.

## Existing players

On first initialization, grant 100 XP per historical finished dungeon, using the greater of the unlock counter and deduplicated run-history count. These overlap and are never added together. Historical defeats get full legacy credit because old records cannot reconstruct exact partial decisions. Seed zero-valued receipts for historical runs and the last finished run, and retain the last rewarded Daily date so reopened old results cannot add XP on top of the grant.

Historical Endless records and the current saved session contribute their move-based XP, using the greatest checkpoint when a session also appears in records. This also preserves current-session progress. The new save records migration once; subsequent finishes use live rules and do not recalculate the legacy grant.

## Home journey

Home shows the actual overall tier and an XP bar labeled with the player's current level. The isometric route has eight tiles per material tier, completed checks, the player's pawn and chosen avatar, and tier gates. Area names, a large level heading, and a profile-icon level badge are omitted. Gameplay mode buttons keep their existing actions and resume states. The map is a bounded scrolling region with faded edges, independent of the other content, with its scrollbar hidden. It starts with the pawn in view; players can scroll through previous and future tiers. A single directional arrow appears only when the pawn is out of view; clicking it returns to the pawn. Selected tiles show their level and remaining XP. Motion respects reduced-motion preferences.

## Validation

- `npx vitest run --pool=threads --reporter=dot --maxWorkers=2`: 392 app/unit tests passed, including live run awards, Endless awards across refresh, migration, receipt merging, and map navigation.
- `npm run test:scripts`: 53 pipeline tests passed.
- `npm run typecheck`: passed.
- `npm run build -- --outDir .tmp/leveling-preview/production-build`: passed. A temporary output folder avoids protected existing files in this workspace's `dist` directory.
- Chrome checks at 320×700, 390×844, 768×1024, 844×390, and 1440×960 confirmed map scrolling, faded clipping, no horizontal overflow or hidden mode buttons, hidden scrollbars, conditional return arrows in both directions, keyboard tile inspection, and refresh persistence.

The default Vitest fork pool encountered a worker reporting timeout in this Windows workspace; the thread pool completed the full suite without errors. Focused checks also passed after the final UI simplification and map memoization.
