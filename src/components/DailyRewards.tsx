import { Coins, Sparkles } from 'lucide-react';
import { DAILY_COIN_MULTIPLIER } from '../game/daily';
import { normalRunCoinReward, RUN_COMPLETION_COINS, runCoinReward } from '../game/economy';
import type { PayoutResult } from '../game/multipliers';
import type { RunState } from '../game/run';
import { dungeonRunXp } from '../game/playerLeveling';

export function DailyRewardReceipt({ run, payout }: { run: RunState; payout: PayoutResult }) {
    const normal = normalRunCoinReward(run);
    const total = runCoinReward(run);
    return <div className="daily-reward-receipt">
        <dl className="daily-earnings-breakdown" aria-label="Earnings breakdown">
            <div><dt>Normal earnings</dt><dd>{normal.toLocaleString()} coins</dd></div>
            <div><dt>Daily bonus</dt><dd>+{(total - normal).toLocaleString()} coins</dd></div>
            <div><dt>Total coins</dt><dd className="coin-balance" aria-label={`Earned ${total} coins`}><Coins size={16} aria-hidden="true" /><strong>+{total.toLocaleString()}</strong></dd></div>
            <div><dt>Player XP</dt><dd aria-label={`Earned ${dungeonRunXp(run)} XP`}>+{dungeonRunXp(run)} XP</dd></div>
        </dl>
        {payout.upgrade && <div className="daily-earned-rewards"><span className="earned-upgrade" aria-label={`Completion upgrade: +0.1x on ${payout.upgrade.square.toUpperCase()}`}><Sparkles size={16} aria-hidden="true" />+0.1x on {payout.upgrade.square.toUpperCase()}</span></div>}
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
    </section>;
}
