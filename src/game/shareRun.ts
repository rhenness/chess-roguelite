import type { EndlessRecord, EndlessSession } from '../features/endless/types';
import { runCoinReward } from './economy';
import type { PayoutResult } from './multipliers';
import type { RunState } from './run';
import { QUALITY_LABELS, QUALITY_ORDER } from './run';
import type { MoveQuality } from '../types/level';
import type { RunRecord } from './runHistory';

export type ShareMode = 'regular' | 'daily' | 'standard' | 'hardcore';
export type ShareStatIcon = 'floors' | 'moves' | 'coins' | 'streak' | 'games';
export interface ShareRunStat { label: string; value: string; icon: ShareStatIcon }
export interface ShareRunData {
    id: string;
    mode: ShareMode;
    modeLabel: string;
    date: string;
    outcome: string;
    score: number;
    scoreLabel: string;
    stats: ShareRunStat[];
    decisionCounts: Record<MoveQuality, number>;
    personalBest?: boolean;
}
export type ShareRunHandler = (result: ShareRunData, trigger: HTMLButtonElement) => void;

const number = (value: number) => value.toLocaleString();
const formatDate = (time: number | string, daily = false) => new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', ...(daily ? { timeZone: 'UTC' } : {}),
}).format(new Date(time));

/** Share the settled payout, including defeats, rather than the pre-multiplier score. */
export function shareRegularRun(run: RunState, payout: PayoutResult, finishedAt = Date.now()): ShareRunData {
    const daily = !!run.daily;
    const completed = run.result === 'complete' && run.levelsCompleted === run.levels.length;
    return {
        id: run.id, mode: daily ? 'daily' : 'regular', modeLabel: daily ? 'Daily dungeon' : 'Regular run',
        date: formatDate(daily ? `${run.daily!.day}T12:00:00Z` : finishedAt, daily),
        outcome: completed ? daily ? 'Dungeon complete' : 'Run complete' : daily ? 'Dungeon over' : 'Run over',
        score: payout.finalScore, scoreLabel: 'Final score', decisionCounts: { ...run.moveCounts },
        stats: [
            { label: 'Floors completed', value: `${number(run.levelsCompleted)} / ${number(run.levels.length)}`, icon: 'floors' },
            { label: 'Decisions', value: number(run.decisionsMade), icon: 'moves' },
            { label: 'Coins earned', value: `+${number(runCoinReward(run))}`, icon: 'coins' },
        ],
    };
}

export function shareEndlessRun(session: EndlessSession): ShareRunData {
    const hardcore = session.mode === 'hardcore';
    return {
        id: session.id, mode: session.mode, modeLabel: hardcore ? 'Hardcore' : 'Endless Standard',
        date: formatDate(session.finishedAt ?? session.startedAt), outcome: hardcore ? 'Hardcore over' : 'Endless over',
        score: session.score, scoreLabel: hardcore ? 'Successful-move streak' : 'Total points', decisionCounts: { ...session.counts },
        stats: hardcore ? [] : [
            { label: 'Longest streak', value: number(session.longestStreak), icon: 'streak' },
            { label: 'Moves played', value: number(session.moves), icon: 'moves' },
        ],
    };
}

export function isSharePersonalBest(result: ShareRunData, runs: readonly RunRecord[], endless: readonly EndlessRecord[]): boolean {
    const previous = (result.mode === 'regular' || result.mode === 'daily' ? runs : endless)
        .filter(record => record.mode === result.mode && record.id !== result.id);
    return previous.length > 0 && previous.every(record => result.score > record.score);
}

export function shareRunText(result: ShareRunData, displayName: string, url: string): string {
    const unit = result.mode === 'hardcore' ? 'moves' : 'points';
    return [
        `Knightfall · ${result.modeLabel} · ${result.date}`,
        `${displayName} · ${result.outcome}`,
        `${number(result.score)} ${unit}${result.personalBest ? ' · Personal best!' : ''}`,
        ...result.stats.map(stat => `${stat.label}: ${stat.value}`),
        QUALITY_ORDER.map(quality => `${QUALITY_LABELS[quality]}: ${number(result.decisionCounts[quality])}`).join(' · '),
        url,
    ].join('\n');
}
