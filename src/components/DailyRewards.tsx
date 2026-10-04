import { Coins, Sparkles } from 'lucide-react';
import { DAILY_COIN_MULTIPLIER } from '../game/daily';
import { COIN_SCORE_STEP, normalRunCoinReward, RUN_COMPLETION_COINS, runCoinReward } from '../game/economy';
import type { PayoutResult } from '../game/multipliers';
import type { RunState } from '../game/run';

export function DailyRewardReceipt({ run, payout }: { run: RunState; payout: PayoutResult }) {
    const normal = normalRunCoinReward(run);
    const total = runCoinReward(run);
    return <div className="daily-reward-receipt">
        <div className="daily-earned-rewards">
            <span className="coin-balance earned-coins" aria-label={`Earned ${total} coins`}><Coins size={19} aria-hidden="true" /><strong>+{total.toLocaleString()}</strong></span>
            {payout.upgrade && <span className="earned-upgrade" aria-label={`Completion upgrade: +0.1x on ${payout.upgrade.square.toUpperCase()}`}><Sparkles size={16} aria-hidden="true" />+0.1x on {payout.upgrade.square.toUpperCase()}</span>}
        </div>
        <dl className="daily-earnings-breakdown" aria-label="Earnings breakdown">
            <div><dt>Normal earnings</dt><dd>{normal.toLocaleString()} coins</dd></div>
            <div><dt>Daily bonus</dt><dd>+{(total - normal).toLocaleString()} coins</dd></div>
        </dl>
    </div>;
}

export function DailyRewards() {
    return <section className="daily-rewards" aria-label="Dungeon rewards">
        <div className="daily-reward-tiles">
            <div className="daily-reward-tile" aria-label={`${DAILY_COIN_MULTIPLIER} times coins`}>
                <Coins size={22} aria-hidden="true" /><strong>{DAILY_COIN_MULTIPLIER}×</strong><span>Coins</span>
            </div>
            <div className="daily-reward-tile" aria-label={`${RUN_COMPLETION_COINS * DAILY_COIN_MULTIPLIER} bonus coins for clearing every floor`}>
                <Coins size={22} aria-hidden="true" /><strong>+{RUN_COMPLETION_COINS * DAILY_COIN_MULTIPLIER}</strong><span>Clear bonus</span>
            </div>
            <div className="daily-reward-tile" aria-label="Clear every floor to upgrade a random square by 0.1x">
                <Sparkles size={22} aria-hidden="true" /><strong>+0.1×</strong><span>Random square</span>
            </div>
        </div>
        <div className="daily-reward-notes">
            <span>{DAILY_COIN_MULTIPLIER} coins / {COIN_SCORE_STEP} base points</span><span>Bonuses on clear</span>
        </div>
        <p className="daily-reward-policy">Keep coins on defeat · No rewards on expiry</p>
    </section>;
}
