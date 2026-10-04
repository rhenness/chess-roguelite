import { Skull, Trophy } from 'lucide-react';
import { formatMultiplier, type PayoutResult } from '../game/multipliers';
import { QUALITY_LABELS, QUALITY_ORDER, type RunState } from '../game/run';
import { DailyRewardReceipt } from './DailyRewards';

export function DailyResults({ run, payout, rank }: { run: RunState; payout: PayoutResult; rank: number }) {
    const completed = run.result === 'complete' && run.levelsCompleted === run.levels.length;
    return <div className="daily-results">
        <div className="daily-results-heading">
            {completed ? <Trophy size={22} aria-hidden="true" /> : <Skull size={22} aria-hidden="true" />}
            <h2>{completed ? 'Dungeon complete' : 'Run over'}</h2>
        </div>
        <div className="daily-result-overview"><div className="daily-result-score"><span>Final score</span><strong>{payout.finalScore.toLocaleString()}</strong></div>
            <div className="daily-result-placement" aria-label={`Your placement: ${rank}`}><Trophy size={16} aria-hidden="true" /><strong>#{rank}</strong></div></div>
        <DailyRewardReceipt run={run} payout={payout} />
        <details className="reward-details"><summary>Run details</summary>
            <p className="daily-score-calculation">{payout.baseScore.toLocaleString()} points / {payout.square.toUpperCase()} / {formatMultiplier(payout.multiplier)}</p>
            <dl className="daily-result-stats"><div><dt>Levels completed</dt><dd>{run.levelsCompleted} / {run.levels.length}</dd></div>
                <div><dt>Decisions</dt><dd>{run.decisionsMade}</dd></div></dl>
            <div className="quality-counts" aria-label="Daily move counts">
                {QUALITY_ORDER.map(quality => <div key={quality}><strong>{run.moveCounts[quality]}</strong><span>{QUALITY_LABELS[quality]}</span></div>)}
            </div>
        </details>
    </div>;
}
