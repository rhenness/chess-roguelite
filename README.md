# Chess roguelite

A single offline pipeline generates JSON levels and scores their difficulty
for each skill tier. Its reusable generation and scoring modules use the existing [`GeneratedLevel` contract](src/types/level.ts).
Generation leaves `difficultyScore` at `-1`. Level schema version 2 names the
numeric puzzle rating `difficultyScore`; version 1 files using `difficulty`
are normalized when loaded. Scoring a version 1 file preserves its original
schema and formatting. Beginner, intermediate, and expert are skill tiers,
defined by `SkillTier` and `SKILL_TIER_CONFIG` in
[`difficulty.ts`](src/config/difficulty.ts). All move evaluations, including mate
distances, use the player's perspective. Difficulty scoring runs after generation. Generation recipes live separately in
[`generation.ts`](src/config/generation.ts); their IDs describe intended difficulty,
while run eligibility uses the stored target option count and actual score.

Requires Node.js 22 or newer. Install dependencies with `npm install` (or
`npm ci` when using the lockfile).

## GitHub Pages

Deployment follows the sibling `fourced-move` project: Node 22 builds the Vite
site, then GitHub Actions uploads `dist` and deploys it to Pages using
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).
Pushes to `main` deploy automatically; the workflow can also be run
manually from the Actions tab. There is no test step in the deployment workflow.

In [the repository's Pages settings](https://github.com/rhenness/chess-roguelite/settings/pages),
select **GitHub Actions** as the build and deployment source. The site will be
available at [rhenness.github.io/chess-roguelite](https://rhenness.github.io/chess-roguelite/)
after a successful deployment. See [GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

The workflow supplies Pages' base path to Vite, including custom-domain paths.
Local production builds default to `/chess-roguelite/`, while `npm start` uses `/`.
The logo and favicon use Vite's base path so they load correctly on the deployed site.
Level JSON is bundled with the app; generation and scoring do not run during deployment.

### Social link previews

Knightfall includes custom dungeon artwork for iMessage and other social link previews.
Open Graph and Twitter card metadata are emitted in the initial HTML, with the
1200 × 630 JPEG at [`public/knightfall-social-preview.jpg`](public/knightfall-social-preview.jpg).
The deployment workflow supplies `VITE_SITE_URL` from Pages so preview URLs also
follow custom domains. Local builds default to `https://rhenness.github.io/chess-roguelite/`;
set `VITE_SITE_URL` to the full public site URL when building for another host.
Artwork generation details and the original prompt are in
[`docs/social-preview.md`](docs/social-preview.md).

## Share a run

At the end of a Regular run, Daily dungeon, Endless Standard game, or Hardcore
game, choose **Share run** to preview a square player card with your banner,
avatar, final score, mode stats, and Best/Good/Inaccuracy/Bad decision counts.
Swipe through **Player card**, **Spotlight**, and **Decision breakdown** layouts,
or use the arrows, style dots, or left/right keys. Sharing and downloading use
the selected layout; switching back to a prepared card reuses its image.
Losses can be shared too. A personal-best badge appears when the score exceeds
your other saved results in that mode.

**Share** opens the device share sheet when the browser supports PNG file
sharing. **Save image** downloads a 1080 × 1080 PNG; **Copy text** provides a
pasteable summary with the game link. When clipboard access is unavailable,
the summary is shown for manual copying. Images are generated locally in the
browser with `html-to-image`; no server or image upload is required.

## Play a run

### Main menu

On first launch, choose **Beginner**, **Intermediate**, or **Expert** directly on
the home page, then press **Continue** to see the run menu. This defaults
your first run. Regular and daily setup remember the most recently selected skill
level, and let you change it before entering a new run. Your choice is stored with
your player profile. Existing profiles without a preference are asked once.

The main menu at `#/play` shows your wallet, profile and help shortcuts, **Regular run**,
**Daily dungeon**, and **Endless**. Each mode shows **In progress** beneath its title
when it has an active run, with the current floor or move number. Cards open their
mode pages, where you can resume or start a new attempt. Regular run opens set
selection without replacing an active run. Daily checkpoints remain resumable
after refresh.
The daily card shows the countdown and coin bonus, or your final score and rank
after finishing. The header **Home** link or logo returns here while pausing gameplay.
The menu fits a phone screen and adapts to landscape. The three mode cards stay
in the same order as runs are started, paused, and finished.
After skill selection, Home shows a permanent isometric player journey, the
current material tier, and an XP bar labeled with the player's current level.
Scroll within the map to explore earlier or later tiers; faded edges contain the
scenery, and a directional arrow returns to the pawn when it leaves view.
Regular and Daily award 100 XP for reaching the end and partial credit on defeat.
Both Endless modes bank 5 XP per two player decisions. Existing saves receive
credit for historical play. Rules, the level curve, and save migration are in
[`docs/leveling-system.md`](docs/leveling-system.md).
First-time skill selection retains the chess-hall artwork documented in
[`docs/main-menu-artwork.md`](docs/main-menu-artwork.md).

Navigation has four destinations: **Home**, **Dungeon**, **Leaderboards**, and
**Profile**. Phones and tablets use a bottom bar with safe-area padding; desktop
uses the same links in the header. Regular set selection remains under Home.
The bar hides during gameplay and payout, then returns on result pages. The
header Home link returns without resetting the run; resume from its mode page.
Browser Back/Forward and direct links to `#/profile` and `#/leaderboards` work.
Switching destinations preserves page scroll, dungeon selection, and active moves.

### Player profile

Choose **Profile** or the header avatar to open the profile page. During gameplay,
the header avatar opens an overlay that pauses play and returns to the same board.
The overview shows
your best regular and daily final scores with dates, fully cleared runs, and
checkmates across finished runs. Score history switches between Daily and Regular
and between 30 days and All time. Daily history shows each dungeon day's attempt;
regular history shows the best finished run on each local calendar date. Hover,
tap, or focus a chart point for its score, floors cleared, and outcome. Days without
a recorded run have no score point.

The lifetime stats also show best Endless Standard points and Hardcore streak,
with longest streaks and completed-game counts.

Choose **Edit profile** from the overview to change your appearance.
Choose a display name (up to 24 characters), one of eight transparent SVG avatars,
an independent avatar-circle background color, and one of six SVG banners.
Background colors use preset swatches. The leaderboard-row
preview updates as you edit, using sample rank and score values. The same avatar,
circle color, name, and banner appear in daily standings. Save changes updates the header avatar and writes
`knightfall.player-profile.v1` to localStorage and returns to the overview.
Cancel and Escape in the editor discard the draft and return to the overview.
Leaving the profile page also discards an unsaved draft. In the gameplay overlay,
closing the editor returns to the overview and closing the overview resumes play.
Profile appearance saves separately from unlocks, coins, multipliers, and history.
If browser storage is unavailable, changes remain available for the current session.
The gameplay overlay uses a desktop dialog and a full-screen panel on phones,
and pauses move playback and automatic floor advancement while open.

Finished runs, including defeats, save their final payout scores to
`knightfall.run-history.v1`. Regular history begins with newly finished runs;
existing saved daily results are imported where available. Reopening the profile
or refreshing does not duplicate results. History remains local to this browser.

### Daily dungeon

Choose **Daily dungeon** on the main menu, choose a skill level and an unlocked set,
and press **Enter dungeon**. Changing either selection does not consume the attempt.
Each UTC day has the same seeded selection for players in the same skill tier,
with one attempt per local player across all tiers. Your skill tier, floors,
set's health, rules, and personal multiplier board are frozen at entry.
**Resume dungeon** restores saved moves after refresh or a regular run.

The final score includes your own multiplier on an individually random payout
square. The payout is saved once, so refresh cannot reroll it. Daily runs earn
five times normal coins, including the completion coin bonus, plus the existing
free square upgrade for clearing all ten levels. After the payout, the daily page
automatically shows the score, placement, and reward receipt. Interrupted
finished rewards recover without double granting coins or upgrades.

Set selection and results stay in **Dungeon**, with Enter or Resume pinned
beneath the scrollable content. **Leaderboards** opens the current daily standings
as its own page and shows every player in one scrollable list: stable mock players plus
your actual multiplied score. All skill tiers share this leaderboard, ranked by
final score with a skill badge on each entry. Ties share ranks; your row is highlighted and pinned.
Switching destinations preserves selection and scroll position. The header logo
returns to Home. The trophy shortcut appears only in daily
games and opens standings in a modal; closing it returns to the same game and
move selection. Profile editing updates your standings appearance; returning to
Leaderboards restores its scroll position.
Dungeon rules and rewards use compact badges and icon tiles. Set cards show
starting hearts and square bonuses, with a checkmark on the selected set.
Reward rates, earned coins, and result calculations are visible without expanding sections.

At 00:00 UTC unfinished daily attempts reset to today's unstarted dungeon without
scores, rewards, or an expiration notification. An active dungeon opens today's daily page. A final
decision made before the deadline counts even if its animation ends afterward.
Daily storage keeps today and yesterday as compact checkpoints in
`knightfall.daily.v1`. All profiles, standings, and progression remain local.
See [development phases and rules](docs/features/04-daily-dungeon-profile.md).

### Regular runs

After choosing their skill level, the main menu sends new players straight into a Default regular run. They
receive a free Healing Potion and a centered introduction. Tooltips explain move
controls, feedback, hearts, healing streaks, and rounds, followed by item usage.
The guide
highlights the Best move's colored option and explains board controls too.
Players perform the real
actions; Next advances explanations. The damage example does not affect health.
Prompts and highlights float above the page without moving the board. Guidance
can be skipped, resumed after refresh, or replayed from Help on the current run.
Help on Home or regular setup also offers a Default guided run with the same
free potion and no coin charge. See [the tutorial rules](docs/features/06-play-tutorial.md).

```powershell
npm start
```

Open the local URL printed by Vite, choose **Regular run**, select **Default**,
**Obsidian Order**, or **Gilded Court**, and press **Start run**. Set cards show
both colors, the name, starting hearts, and the initial square bonus. Selecting a
card changes your selection without starting or replacing a run. **Menu** opens
the main menu and pauses playback; **Resume regular run** returns to the
existing run from set selection. The logo also returns to the main menu. Browser Back and Forward
follow pages without starting a run. Obsidian uses custom faceted SVG pieces with crimson inlays, 2 starting
health, and alternating ×1.0/×1.3 multipliers. Default retains 3 starting health
and ×1.0/×1.1 multipliers. Gilded Court uses ivory/dark green enamel SVGs with
gold trim and emerald inlays, 3 starting health, and just four ×1.5 starting
squares in the center (d4, e4, d5, e5); the other 60 squares start at ×1.0.
Its card says "Limited ×1.5 multis." Each set keeps its own square upgrades. On narrow screens the cards
stack as horizontal rows, with piece previews beside their benefits. Compact
previews show the king, queen, and knight in both colors.

Default is available immediately. Obsidian Order unlocks after **3 finished runs**,
and Gilded Court after **8**. Wins and deaths count; abandoning a run does not.
Locked cards show a lock and a small finished-run counter. A newly unlocked set
gets a board notification after the payout, before the final score page.
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

### Endless

Choose **Endless** from Home, then **Standard** or **Hardcore**. Every attempt starts
from the normal chess position and you choose moves for both White and Black.
Best and Good moves extend your accuracy streak. Checkmate or any draw briefly
shows the result, then automatically starts another game with the streak intact.

Standard uses the selected set's starting hearts and the existing item loadout.
Inaccuracy/Bad moves reset the accuracy streak and deal normal damage; shields
can block damage but do not preserve a broken streak. Points use normal move
values, including item boosts. Four consecutive Best moves restore one heart.
Remaining hearts, items, and effect charges carry into the next board.

Hardcore uses one life and no items, with set choices affecting appearance only.
One Inaccuracy or Bad move ends the attempt. Its score is the number of successful
Best/Good moves before the failure; Standard scores remain separate.

Both variants award coins when the attempt ends: one coin per 25 unboosted move
points, with Hardcore counting only successful moves. A receipt in the shared
wallet prevents repeat awards after refresh. Endless does not award permanent
square upgrades or dungeon completion credit. Replacing an unfinished attempt
does not pay coins.

Sessions, exact offered choices, and mode-specific records save separately under
`knightfall.endless.v1`. Leaving the page or opening help pauses play and cancels
pending analysis; reopening resumes the attempt. The compact Stockfish worker
evaluates positions locally and offers up to four legal moves. Opening choices
match Fourced Move: c4, d4, e4, and Nf3, all Good. Later qualities use the same
0.5/1.5-pawn thresholds and mate handling. Engine errors offer Retry analysis.

Feature code lives in `src/features/endless/`; browser engine assets and their
license live in `public/endless/`. Shared move buttons, item controls, effects,
piece renderers, profile, wallet, and navigation serve all modes.

### Run items

Regular-run setup includes three consumables with matching minus/plus controls,
prices beside their names, and one total below the list. Select up to three
copies in any combination; **Start run** purchases the whole loadout. Changing
the selection before entry costs nothing. **Play again** returns to set selection with
the previous piece set selected and an empty item selection.

- **Triple Crown (30 coins):** triple move points for the next three player decisions.
- **King’s Guard (20 coins):** block all damage from the next three player decisions,
  including lethal damage. A shield charge is spent even on a safe move; move quality
  and streak breaking still apply.
- **Healing Potion (20 coins):** immediately restore one heart, with no new health cap.

During play, an item bar beneath health and score shows unused quantities. Tap
an item to show a red cancel square and green confirm square immediately above
it. The green check uses the item; the red X, Escape, or clicking elsewhere
dismisses the confirmation without spending it. Active effects show their icons and remaining player
moves; replies and animations do not spend charges. Effects cross floors, and
the same timed effect cannot be activated twice at once. Activation clears any
pending move confirmation. Notifications announce activation, healing, and
prevented damage; move feedback displays the actual boosted points.

Unused supplies and effects are discarded when the run finishes. Replacing an
unfinished regular run loses its supplies without a refund. Refreshing preserves
the saved run and its inventory. Items do not enter permanent progression
storage. Boost points count toward the final square payout but are excluded from coin rewards and early
checkmate bonuses for unplayed decisions.

New daily attempts receive one free copy of each item. Saved daily checkpoints
replay item activations at their original decisions without charging coins or
replaying notifications. Existing attempts without item rules remain item-free.
Definitions, prices, and effect handlers live in [`src/game/items.ts`](src/game/items.ts).

New regular and daily runs pause after rounds **3 and 6** for a free item choice.
Two distinct random item cards hover over the cleared board; tapping one adds
it to inventory and starts the next round. Checkpoint rewards can exceed the
three-item entry limit. Small dots between floors mark the checkpoints, and a
flag announces each stop. Health, streak, and effect durations carry through.
Daily offers are date-seeded and shared by all players. Both run types preserve
offers and claimed rewards on refresh; older saves retain their original rules.

The game loads the
precomputed JSON files recursively in `src/levels`, excludes `.staging`, and
skips unscored files (`difficultyScore: -1`). It selects by target option count
and inclusive difficulty-score range: Beginner uses `2-options-4-depth` at 0–39; Intermediate
uses `4-options-4-depth` at 45–68; Expert uses `4-options-4-depth` at 58–100. Intermediate and Expert
share all four-option generation profiles; scores 58–68 are eligible for both tiers.
Untagged levels belong to that pool.
Each tier currently selects 10 distinct scored levels spread across difficulty.
Entry is disabled if the selected tier has no playable levels.
The available minimum-to-maximum score range is divided into ten equal-width bands, with one
random level per populated band before any band receives a second level. Empty
or exhausted bands redistribute slots evenly among bands with levels remaining.
Selected levels play in ascending difficulty order. If fewer than 10 playable levels are
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

Default and Gilded Court runs begin with 3 health; Obsidian Order begins with 2.
Beginner awards 50 for Best and 0 for Blunder. Intermediate awards 100/75/25/−25
for Best/Good/Inaccuracy/Blunder. Expert awards 150/100/−25 for
Best/Good/Inaccuracy. Total score cannot fall below zero, and score boosts only
multiply positive awards. Best/Good/Inaccuracy/Bad moves cost 0/0/1/2 health.
Every four consecutive Best moves earn one extra health
point, including streaks spanning levels. Other move qualities break the streak;
a new run resets it. A fire icon and the current Best streak appear beside health
while the streak is above zero. Health changes appear over the board as a filled
heart with +1 for rewards or −1/−2 for damage. They pop in, glow, float upward,
and fade. Damage uses a red theme. A lethal move instead shows a skull and
"Run over" over a dimmed board before starting the payout. The overlay never blocks taps
or changes the layout; reduced-motion settings show a still badge. The reusable
`BoardNotification` component accepts SVGs or images, a label, an optional caption,
a color theme, and a display duration for other milestone notifications.

Checkmating the opponent before the floor's configured decision limit awards
Best-move points for every unplayed decision: a win on move two of a
four-decision intermediate floor adds 200 bonus points. These points do not increase move
counts, the Best streak, or health. Draws and losses award no such bonus.
Player checkmates show a "Checkmate" board notification, followed by the next
floor notification before advancing. On the final floor, payout starts after
the Checkmate notification finishes.

Preview overlays from the browser console using `window.knightfall`. These
commands only show notifications; they do not change gameplay health or score:

```js
knightfall.health(); // Preview +1 health
knightfall.health(-1); // Preview health loss (also accepts -2)
knightfall.death(); // Preview the skull / Run over animation
knightfall.notify('Nice!');
knightfall.notify({
    label: 'Streak!',
    icon: 'trophy',
    tone: 'reward',
    durationMs: 2500,
});
knightfall.notify({
    label: 'Bonus',
    image: '/reward.png',
    caption: 'Custom image',
});
knightfall.payout(); // Preview the spin, payout, and square upgrade
knightfall.payout({ score: 1200, completed: false }); // Preview a payout without an upgrade
knightfall.dismiss();
```

Icons accept `heart`, `skull`, `sparkles`, or `trophy`; themes accept `health`, `reward`,
or `danger`. Every call restarts the animation, and the global object is removed
when the app unmounts.

To replay today's daily dungeon locally, run `knightfall.resetDailyDungeon()` in
the browser console. It clears today's saved attempt and opens the dungeon entry
page immediately, keeping the same levels and deadline. It returns the reset UTC
date. Other days, regular runs, profile data, and earned rewards stay intact;
daily rewards still only pay once per day.

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
The quality box shows only the move, quality, and points. The next level starts
automatically after the level-ending presentation. Wins, draws, and depth-limit
leaves count as completed levels. Opponent wins count as failed levels, and play
continues while health remains. Zero health ends the run immediately, before an
opponent reply. The skull notification finishes before the board payout
begins. Completing the selected levels also ends the run.

The regular result page shows the multiplied score and earned coins, with level,
decision, and move-quality counts under **Run details**. **Play again** returns to
chess set selection; **Share run** opens an image and text sharing preview. The daily
page combines daily results and rewards, with standings on **Leaderboards**. Setup and result pages scroll
on mobile, while gameplay keeps its viewport layout. Rules open in a modal and
return to their opener. Tier settings are configurable through `SKILL_TIER_CONFIG`
in [`src/config/difficulty.ts`](src/config/difficulty.ts); Obsidian overrides starting
health to 2. Tree choices, opponent replies, and decision depth are baked into the
generated levels, so changing those settings requires regeneration. Run rules can
also be overridden through the `rules` prop to `App`. Saved regular and daily runs
retain their skill tier, rules, floor count, and selected floors across refresh and
preference changes. Older saves use intermediate metadata with their original rules.

Gameplay uses React, chess.js, and react-chessboard. It follows only the selected
precomputed branch and performs no Stockfish analysis. Level JSON is never modified
by gameplay. Run `npm run build` for a production build and `npm run preview` to
serve it. `npm test` runs gameplay/React tests and the existing offline script tests;
`npm run typecheck` checks both applications.

## Generate and score levels

Put one complete FEN per line in the project-root `fens.txt`:

```text
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1
```

The command generates and scores each missing FEN/profile combination for all
registered recipes:

```powershell
npm run generate:levels
npm run generate:levels -- --profile 4-options-4-depth-20 --concurrency 4
npm run generate:levels -- other-fens.txt --concurrency 2
npm run generate:levels -- --regenerate
npm run generate:levels -- --profile 4-options-4-depth-20 --regenerate
```

Two-option recipes save into `src/levels/2-options-4-depth`; four-option recipes share
`src/levels/4-options-4-depth`. A `--depth` override uses a folder matching that depth;
the profile ID still identifies the selected recipe and its default depth. Files are named `<three-digit-score>-<guid>.json`. Each new level
records `generation.profileId`, `profileVersion`, `targetOptionCount`, a frozen
`playerQualities` recipe, a stable UUID, its tree, and `difficultyScore`. It has
no top-level `skillTier`; the player's selected run tier controls points and rules.

Blank lines, comments, a UTF-8 BOM, and Windows line endings are supported.
Matching uses the normalized root FEN, profile ID and decision depth, independently of filename
or profile version. Legacy beginner/intermediate/expert tags map to
`2-options-4-depth-10`/`4-options-4-depth-10`/`4-options-4-depth-20`; untagged levels map to
`4-options-4-depth-10`. Loaders preserve existing files, trees, IDs, and saved runs.

Use `--regenerate` to rebuild selected FENs/profiles. After each replacement is
published, older matching files are removed. Other FENs and profiles remain.
Failures retain the old levels. Changes to profile settings take effect on new
generation; use regeneration to replace old trees.

Recipes live in [`generation.ts`](src/config/generation.ts). IDs follow
`<option-count>-options-<depth>-depth-<recipe-number>`: higher numbers aim for harder trees
within the same option count and default depth, with gaps for additions such as `4-options-4-depth-15`.
The score determines actual run eligibility. Increment a recipe's
`profileVersion` when revising its settings; versioned staging keeps pending
jobs from different revisions separate. Run cutoffs, health, damage, points,
and floor counts live independently in [`difficulty.ts`](src/config/difficulty.ts).

| Profile | Player choices | Opponent weights: best / good / inaccuracy / blunder |
| --- | --- | --- |
| `2-options-4-depth-10` | Best and worst analyzed move | 0 / 40 / 40 / 20% |
| `4-options-4-depth-10` | Best, good (50 cp loss), inaccuracy (150 cp loss), worst | 40 / 40 / 18 / 2% |
| `4-options-4-depth-20` | Best, good (25 cp loss), two inaccuracies (50 / 100 cp loss) | 60 / 40 / 0 / 0% |
| `4-options-4-depth-30` | Best, good (10 cp loss), two inaccuracies (25 / 50 cp loss) | 100 / 0 / 0 / 0% |
| `4-options-4-depth-40` | Best, good (5 cp loss), two inaccuracies (15 / 30 cp loss) | 100 / 0 / 0 / 0% |

Recipes 30 and 40 target closer alternatives and always choose the best analyzed
opponent reply. Recipe 40 tightens the loss targets further, aiming for harder choices
at the same depth. Generate it with `npm run generate:levels -- --profile 4-options-4-depth-40`.
The score still determines whether a generated level qualifies for Intermediate or Expert.

Losses are targets relative to the best evaluation. Selection follows Stockfish's
rank order and reserves distinct, worse moves for subsequent options. Actual
evaluation gaps depend on the position; these labels are relative alternatives
and do not guarantee chess annotation thresholds or a particular difficulty score.
When fewer legal moves are available than configured options, fewer choices are
offered. Opponent weights are renormalized across available qualities; a sole
legal reply is played even if its configured weight is zero. Reducing MultiPV
limits selection to the analyzed candidates and may make the worst move less severe.

Each choice records the player's UCI/SAN move, its parent-position evaluation/PV,
the FEN after the move, the sampled opponent response, and `next`. The side to
move in the starting FEN is the player's color. Evaluations always use that
player's perspective. An opponent reply is stored even on the final decision,
unless the player's move already ends the game. Checkmate, stalemate, insufficient
material, the fifty-move rule, and threefold repetition end branches before the
depth limit. Both chess.js and Stockfish receive branch history; a starting FEN
establishes no earlier repetition history. Terminal and depth-limit nodes have
no choices.

Generation samples opponent replies using `Math.random`, so repeated runs can
produce different trees. Programmatic callers can supply `BatchOptions.random`
for reproducible reply selection. Scoring clears engine state before each search
and replays the branch history, making ratings reproducible for the same tree,
scoring configuration, and engine build.

Use `npm run generate:levels -- --help` for all options:

| Option | Default | Meaning |
| --- | --- | --- |
| `--profile` | All registered profiles | Generate one recipe, such as `4-options-4-depth-20` |
| `--concurrency` | `1` | Global limit of 1–32 simultaneous FEN/profile jobs |
| `--output-dir` | `src/levels` | Output root containing option-count/depth subfolders and staging |
| `--resume` | Off | Score matching pending trees without regenerating them |
| `--regenerate` | Off | Rebuild and rescore selected FENs/profiles, then delete matching old files |
| `--depth` | Profile config: `4` | Override player decisions, each followed by a reply |
| `--search-depth` | `10` | Generation search depth |
| `--multi-pv` | `256` | Generation candidates, capped by the legal move count |
| `--timeout-ms` | `120000` | Generation timeout per engine operation |
| `--config` | Scorer defaults | JSON file of partial difficulty-scoring overrides |
| `--engine` | Bundled Stockfish | Native executable or JavaScript wrapper |

Every active job uses one independent, single-threaded Stockfish process with
64 MB of hash memory, reusing it sequentially for generation and scoring. The
concurrency limit covers all profiles together. Higher concurrency increases CPU
and memory use. Four-way branching at depth four can produce 85 player decision
nodes, 340 choices, and 256 leaves; analyzing all legal moves can take several
minutes per tree. For a quick trial in a separate output folder:

```powershell
npm run generate:levels -- --profile 2-options-4-depth-10 --depth 1 --search-depth 4 --output-dir scratch-levels
```

The full, single-threaded [Stockfish.js engine](https://github.com/nmrugg/stockfish.js)
is included as a dependency. Use `--engine` or `STOCKFISH_PATH` for another engine.
Generation and difficulty-scoring analysis depths are configured separately;
`--search-depth` changes generation only. Scorer defaults and validation live in
[`config.ts`](src/scripts/difficulty-scorer/config.ts). Nested `--config` overrides
preserve omitted defaults; unknown keys, invalid thresholds, and weights that
do not sum to 1 are rejected. For example:

```json
{
    "depths": [4, 8, 12, 16],
    "depthDiscount": 0.5,
    "acceptableLossCp": 50,
    "subtlety": { "quiet": 90 }
}
```

Progress and summaries identify both the original source line and profile.
Invalid FENs and generation, scoring, or publication failures are reported while
other jobs continue. Any failure produces exit code 1. Scored outputs become
visible as complete JSON files; regeneration cleans up older matching levels
only after the replacement is saved. Files edited during analysis are preserved
and reported as a publication failure.

Completed trees are first saved with `difficultyScore: -1` in
`src/levels/.staging/<options>-options-<depth>-depth`. If scoring or publication fails, retry with:

```powershell
npm run generate:levels -- --resume
npm run generate:levels -- --profile 4-options-4-depth-20 --concurrency 4 --resume
```

Use the same input file, FEN line positions, output root, profile ID, and profile version to
find pending work. Resume retains the saved tree, depth, and UUID; it skips jobs
without a pending tree and performs no tree generation. Scoring replaces only
the top-level score, publishes the final level file, then removes the pending
file. Pending replacements record `generation.regenerated: true`, so `--resume`
also finishes old-file cleanup after a failed regeneration. Staging is excluded
from the game's level catalog. A normal run skips existing levels and refuses
to replace a pending tree. `--regenerate` rebuilds even a pending tree; `--resume`
retains it. Generation failures can be retried with the original command.

For programmatic use, [`generateLevelBatch`](src/scripts/level-batch/index.ts)
returns results in FEN/profile order and reports results as they finish through
`onResult`. A caller-supplied `AnalysisEngine` supports concurrency 1.
[`generateTree`](src/scripts/tree-generator/index.ts) and
[`scoreLevel`](src/scripts/difficulty-scorer/index.ts) remain reusable modules.
The standalone tree-generation and scoring CLIs have been replaced by
`generate:levels`.

## Difficulty scoring

The initial heuristic follows
[`02-level-difficulty`](docs/features/02-level-difficulty.md):

| Signal              | Weight | Implementation                                                                                                                                                                     |
| ------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ambiguity           | 35%    | Mean alternative plausibility, `100 * exp(-loss / 100)`; blend stored and final offered-move analysis equally                                                                      |
| Depth to separation | 25%    | Earliest depth where the stored best choice leads every alternative by at least 80 cp and keeps that lead at all later sampled depths; normalize between the first and final depth |
| Subtlety            | 20%    | Quiet moves score 100; captures 35, checks 20, recaptures 15, promotions 10, check evasions 30; use the lowest applicable value                                                    |
| Uniqueness          | 20%    | `100 / acceptableMoveCount`, where acceptable moves lose at most 50 cp from the fresh analysis's best legal move                                                                   |

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
40%/35%/20%/5%. Available quality probabilities are renormalized, and a
quality's probability is split equally among its choices. Expert's two inaccuracy
choices therefore share the inaccuracy probability. Both the mean and percentile use
`reachProbability * depthDiscount ** decisionsTaken` as the node weight. The default
`depthDiscount` is 0.5, so successive decision depths receive multipliers of
1, 0.5, 0.25 and 0.125. In a full depth-four tree, the opening contributes about
53.3% of the weighted mean. The discount must be greater than 0 and at most 1;
set it to 1 to restore weighting by reach probability alone. Existing ratings
can be updated with the reusable `scoreLevelFiles` API using `rescore: true`.

Overall difficulty is 80% of the weighted mean plus 20% of the
weighted 90th percentile, rounded and clamped to 0–100. The percentile uses
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
