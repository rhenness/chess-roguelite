# Daily dungeon and player profile

This version is local-only. Profiles, progression, daily attempts, and results
are stored in the browser. Daily standings use mock competitors and the player's
actual result.

## Development phases

1. Player profile: complete. Display name, transparent SVG avatar, independent
   avatar background color, SVG banner, live row preview, Save/Cancel, local storage.
2. Daily foundations: complete. Deterministic ten-level daily selection,
   saved/resumable attempt, entry loadout snapshot, finished result, daily reset.
3. Play/navigation: complete. Home/Dungeon/Leaderboards/Profile destinations,
   mobile bottom navigation and desktop header links, regular setup from Home,
   explicit daily entry, resume, results access, countdown, and pre-entry upgrades.
4. Daily leaderboard: complete. Stable mock players, final multiplied score,
   shared ranks for ties, own-row highlighting, and profile appearance.
5. Rewards/results: complete. Reward preview, five times regular coin earnings,
   existing completion upgrade, automatic one-time granting, persistent receipt.

Navigation hides during gameplay and payout; the header Home link returns to Home
while preserving the run. Profile is a routed page with editing, plus an overlay
during gameplay. Leaderboards opens the current daily standings. Browser history
and page scroll restoration include the inner dungeon, standings, and profile
scroll regions.

## Agreed rules

- One daily attempt per local player, per UTC day, across all skill tiers.
- Players in the same skill tier get the same daily levels; players bring their
  own unlocked piece set and multipliers. The tier, floors, rules, and loadout
  are frozen when Enter dungeon is pressed. Setup remembers the latest tier
  selected for either a regular or daily run.
- New daily draws use the same balanced difficulty bands as regular runs, with
  date-seeded randomness. Previously saved daily selections remain unchanged.
- The payout lands on an individually random square. Personal multipliers
  contribute to the leaderboard score.
- Daily coin rewards are five times the normal reward, including the normal
  completion coin bonus. Completion retains the existing free square upgrade.
- All skill tiers share one leaderboard ranked by final score, with a skill badge
  on each entry. No placement prizes for this version. Tied scores share a rank.
- At 00:00 UTC an unfinished attempt resets to today's unstarted dungeon, with no
  score submission, rewards, or expiration notification. An active daily run opens
  today's dungeon entry page.
- A final decision submitted before the deadline counts even when its reply or
  payout animation finishes afterward.
- Finished defeats count as attempts and keep earned rewards. Daily resets and
  abandonment do not produce finished results.
- Editing appearance changes leaderboard presentation, including existing results.
  It does not change the gameplay loadout.

## Profile appearance

The circular avatar sits on the left of the banner. Its transparent SVG artwork,
solid background color, and banner artwork are three independent choices.
Rank and score have consistent positions. All appearance choices use presets.
Image uploads are out of scope.

## Persistence and validation

- `knightfall.player-profile.v1` stores appearance and the preferred skill tier
  independently of progression. Players without a preference choose it at first launch.
- `knightfall.daily.v1` keeps today and yesterday using frozen level IDs, entry
  rules/multipliers, and move checkpoints. Scores and health are rebuilt by
  replaying offered moves; large generated trees are not copied into localStorage.
- Saved selections keep their level IDs and rules, even when the preferred tier
  changes. If today's saved attempt cannot be restored after game data changes,
  reopen today's dungeon with a fresh attempt instead of leaving it unavailable.
- A finished payout is chosen once and saved. Daily reward dates in progression
  and multiplier saves prevent double credit after refresh or subsequent regular runs.
- Interrupted finished rewards recover automatically, including the completion
  upgrade. Daily saves synchronize across tabs. Unavailable storage falls back to
  the current session with a visible notice.
- Verification covers deterministic selection, entry snapshots, replay/resume,
  deadline boundaries, payouts, ties, profile edits, reward recovery, and mobile layouts.
