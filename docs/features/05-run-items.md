# Consumables for runs

Item selection belongs to regular-run setup. There is no separate shop page or
navigation tab. Home, Dungeon, Leaderboards, and Profile remain the destinations.

## Purchase and presentation

Show three item rows: an icon, name, adjacent coin price, compact effect summary,
and matching minus/quantity/plus controls. Display one total below the list. Keep
the main wallet in the header; omit an item-selection heading and slot counter.
The only persistent purchase explanation is “Unused items expire after the run.”

Players may select up to three consumables in any combination. Disable adding
when the next copy would exceed the slot limit or available coins. Charge the
entire selection on Start run, save the wallet debit, and copy supplies into the
new run. The selection resets after entry. Selecting and removing items before
entry never charges coins. Replay returns to setup with the same set selected.

## Starter items

| Item | Cost | Effect |
| --- | ---: | --- |
| Triple Crown | 30 | Multiply points for the next three player decisions by three. |
| King’s Guard | 20 | Block damage for the next player decision, even if lethal. |
| Healing Potion | 20 | Restore one heart immediately without introducing a health cap. |

Timed effects count actual confirmed player decisions, including zero-point and
safe moves. They survive floor transitions; previews, opponent replies, and
playback do not count. The same timed effect cannot stack, but a crown and shield
may overlap. A shield does not change move quality, statistics, or streak resets.
Boosts do not apply to early checkmate bonuses for unplayed decisions.

All supplies belong to the current run. Completion, defeat, replacement, and
regular-run refresh lose unused items without refunds. Finished runs clear
supplies and active effects; item ownership never enters permanent progression.

## Activation and feedback

The bar beneath health and score shows item icons and unused quantities. Tapping
shows a red square X and green square check immediately above that item. Only
the check activates it; X, Escape, or clicking elsewhere dismisses the controls
without spending a copy. Descriptions are available in tooltips and accessible
labels. Activation is legal only at an
active decision and clears any pending move confirmation. Timed-effect badges
show an icon and remaining moves with descriptions in their accessible labels and tooltips.

Use actual resolved points and health changes for feedback. A shield reports
Damage blocked and the prevented amount, rather than a health-loss notice. A
shield spent on a safe move reports Guard spent. Healing and activation use the
existing board notices. Queue notices so activation, health, checkmate, floor
advancement, and payout cannot overwrite each other. Death replaces pending
ordinary notices. Notices do not block move input; reduced-motion behavior and
screen-reader announcements remain available.

## Gameplay and persistence

Definitions are serializable data with an effect discriminant. Registered effect
handlers transform normal move points and incoming damage before health is
updated or defeat is checked. Resolution records normal and awarded points,
incoming/prevented/applied damage, health rewards, and effect expiration.
Durations decrement once after each valid player decision.

Track additional item points separately. Final score includes them; normal coin
earnings use score minus item bonus points, plus the existing completion reward.

New daily attempts use version-one item rules and fixed free supplies: one of
each item. Checkpoints record activations with their decision count and floor.
Restore by replaying those actions through the same activation and move functions,
including activations after the last saved move. Reject invalid ordering,
unavailable items, and duplicate timed effects. Legacy attempts without an item
rules version restore with no supplies. Restoring does not charge the wallet or
show previous notifications.

Verification covers purchase affordability and slot limits, supply disposal,
lethal-hit shielding, safe shield consumption, cross-floor boost duration,
streak preservation rules, checkmate scoring, coin rewards, modified feedback,
pending confirmation reset, and daily restoration.
