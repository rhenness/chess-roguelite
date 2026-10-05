import { afterEach, describe, expect, it, vi } from 'vitest';
import { decision, makeLevel } from '../test/levels';
import { advancePlayback, chooseMove, DEFAULT_RULES, nextLevel, startRun, type RunState } from './run';
import type { PayoutResult } from './multipliers';
import {
    initialRunHistory, loadRunHistory, mergeRunHistory, profileStats, recordRunResult,
    RUN_HISTORY_STORAGE_KEY, saveRunHistory, scoreHistoryPoints, type RunRecord,
} from './runHistory';

const now = Date.parse('2026-10-04T12:00:00Z');
const payout = (run: RunState): PayoutResult => ({ id: `payout-${run.id}`, square: 'a1', multiplier: 12,
    baseScore: run.score, finalScore: Math.round(run.score * 1.2), upgrade: null });
const play = (run: RunState, quality = 'best'): RunState => {
    if (run.node.kind !== 'decision') throw new Error('Expected a decision.');
    return advancePlayback(advancePlayback(chooseMove(run, run.node.choices.find(choice => choice.quality === quality)!.playerMove.uci)));
};
const sample = (id: string, day: string, score: number, mode: 'daily' | 'regular' = 'regular'): RunRecord => ({
    id, mode, finishedAt: Date.parse(`${day}T12:00:00Z`), ...(mode === 'daily' ? { dailyDay: day } : {}),
    score, floorsCompleted: 10, floorsTotal: 10, checkmates: 0, result: 'complete',
});
afterEach(() => { window.localStorage.removeItem(RUN_HISTORY_STORAGE_KEY); vi.restoreAllMocks(); });

describe('run history', () => {
    it('records the final payout score and actual checkmates without counting unplayed Best decisions', () => {
        const mate = makeLevel('mate', 10, 2);
        const choice = decision(mate).choices[0]!;
        choice.opponentReply = null;
        choice.next = { kind: 'terminal', fen: choice.fenAfterPlayerMove, decisionsTaken: 1, reason: 'checkmate', result: 'white' };
        const run = play(nextLevel(play(startRun([mate, makeLevel('next', 20)]))));
        const history = recordRunResult(initialRunHistory(), run, payout(run), now);
        expect(run.score).toBe(300);
        expect(history.runs[0]).toMatchObject({ score: 360, checkmates: 1, floorsCompleted: 2, floorsTotal: 2, mode: 'regular' });
        expect(profileStats(history)).toMatchObject({ runsCompleted: 1, checkmates: 1 });
        expect(recordRunResult(history, run, payout(run), now + 1000)).toBe(history);
        expect(saveRunHistory(history)).toBe(true);
        expect(loadRunHistory()).toEqual(history);
    });

    it('keeps defeat scores and ignores unfinished runs or mismatched payouts', () => {
        const active = startRun([makeLevel()], { ...DEFAULT_RULES, startingHealth: 1 });
        expect(recordRunResult(initialRunHistory(), active, payout(active), now).runs).toHaveLength(0);
        const defeated = play(active, 'inaccuracy');
        const history = recordRunResult(initialRunHistory(), defeated, payout(defeated), now);
        expect(history.runs[0]).toMatchObject({ score: 30, result: 'defeat', floorsCompleted: 0, checkmates: 0 });
        expect(profileStats(history).runsCompleted).toBe(0);
        expect(recordRunResult(initialRunHistory(), defeated, { ...payout(defeated), baseScore: 900 }, now).runs).toHaveLength(0);
    });

    it('deduplicates older results and daily attempts across restores and merges', () => {
        const first = play(startRun([makeLevel()]));
        const second = play(startRun([makeLevel('second')]));
        let history = recordRunResult(initialRunHistory(), first, payout(first), now);
        history = recordRunResult(history, second, payout(second), now + 1);
        expect(recordRunResult(history, first, payout(first), now + 2)).toBe(history);
        const daily = { ...first, id: 'daily', daily: { day: '2026-10-04', expiresAt: now + 1000 } };
        history = recordRunResult(history, daily, payout(daily), now);
        expect(recordRunResult(history, { ...daily, id: 'restored-daily' }, payout(daily), now)).toBe(history);
        expect(mergeRunHistory(history, history)).toBe(history);
        expect(history.runs).toHaveLength(3);
    });

    it('repairs damaged saves and preserves valid records without accepting invalid stats', () => {
        const valid = sample('valid', '2026-10-04', 400);
        window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, runs: [
            null, valid, valid, { ...valid, id: 'negative', score: -1 },
            { ...valid, id: 'fractions', score: 1.5 }, { ...valid, id: 'overflow', floorsCompleted: 11 },
            { ...valid, id: 'date', mode: 'daily', dailyDay: '2026-02-30' },
        ] }));
        expect(loadRunHistory().runs).toEqual([valid]);
        window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, '{broken');
        expect(loadRunHistory()).toEqual(initialRunHistory());
        window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, '{"version":2,"runs":[]}');
        expect(loadRunHistory()).toEqual(initialRunHistory());
    });

    it('retains in-memory results when storage is unavailable', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
        const history = { version: 1 as const, runs: [sample('saved', '2026-10-04', 400)] };
        expect(saveRunHistory(history)).toBe(false);
        expect(mergeRunHistory(history, loadRunHistory())).toBe(history);
    });

    it('plots the best regular score per played day and a separate daily attempt without filling gaps', () => {
        const history = { version: 1 as const, runs: [sample('low', '2026-10-01', 100), sample('high', '2026-10-01', 400),
            sample('later', '2026-10-04', 300), sample('daily', '2026-10-04', 700, 'daily')] };
        expect(scoreHistoryPoints(history, 'regular', 'all', now).map(run => run.id)).toEqual(['high', 'later']);
        expect(scoreHistoryPoints(history, 'daily', '30', now).map(run => run.id)).toEqual(['daily']);
        expect(profileStats(history).bestRegular?.id).toBe('high');
        expect(profileStats(history).bestDaily?.score).toBe(700);
    });

    it('includes the entire first day of the 30-day window and retains earlier scores for All time', () => {
        const history = { version: 1 as const, runs: [sample('old', '2026-09-04', 400), sample('boundary', '2026-09-05', 200),
            sample('now', '2026-10-04', 300), sample('daily-old', '2026-09-04', 800, 'daily'),
            sample('daily-boundary', '2026-09-05', 500, 'daily')] };
        expect(scoreHistoryPoints(history, 'regular', '30', now).map(run => run.id)).toEqual(['boundary', 'now']);
        expect(scoreHistoryPoints(history, 'regular', 'all', now)).toHaveLength(3);
        expect(scoreHistoryPoints(history, 'daily', '30', now).map(run => run.id)).toEqual(['daily-boundary']);
    });
});
