import { describe, expect, it } from 'vitest';
import { startSession } from '../features/endless/session';
import { initialRunHistory, recordRunResult } from './runHistory';
import { startRun } from './run';
import { makeLevel } from '../test/levels';
import { isSharePersonalBest, shareEndlessRun, shareRegularRun, shareRunText } from './shareRun';

const now = Date.parse('2026-10-04T12:00:00Z');
const run = { ...startRun([makeLevel()]), phase: 'finished' as const, result: 'defeat' as const,
    score: 100, decisionsMade: 3, levelsCompleted: 0, moveCounts: { best: 1, good: 1, inaccuracy: 0, bad: 1 } };
const payout = { id: 'payout', baseScore: 100, finalScore: 175, square: 'a1' as const, multiplier: 17.5, upgrade: null };

describe('share run results', () => {
    it('uses the final payout on a loss and the actual coin reward', () => {
        const result = shareRegularRun(run, payout, now);
        expect(result).toMatchObject({ mode: 'regular', score: 175, outcome: 'Run over' });
        expect(result.stats.map(stat => stat.value)).toEqual(['0 / 1', '3', '+4']);
        expect(result.decisionCounts).toEqual({ best: 1, good: 1, inaccuracy: 0, bad: 1 });
        expect(shareRunText(result, 'Knight', 'https://example.com/')).toContain('Best: 1 · Good: 1 · Inaccuracy: 0 · Bad: 1');
    });

    it('uses the dungeon day, including archived runs, and daily coin bonuses', () => {
        const daily = { ...run, daily: { day: '2026-10-01', expiresAt: now }, result: 'complete' as const, levelsCompleted: 1 };
        const result = shareRegularRun(daily, payout, now);
        expect(result).toMatchObject({ mode: 'daily', outcome: 'Dungeon complete', date: 'Oct 1, 2026', score: 175 });
        expect(result.stats[2]?.value).toBe('+120');
    });

    it('distinguishes Standard points from Hardcore successful moves and does not count the losing move', () => {
        const session = { ...startSession('hardcore', 'default', {}, now), phase: 'finished' as const,
            finishedAt: now, score: 12, moves: 13, gamesCompleted: 1, basePoints: 300, longestStreak: 12,
            counts: { best: 2, good: 10, inaccuracy: 0, bad: 1 } };
        const hardcore = shareEndlessRun(session);
        expect(hardcore).toMatchObject({ mode: 'hardcore', score: 12, scoreLabel: 'Successful-move streak' });
        expect(hardcore.stats).toEqual([]);
        expect(hardcore.decisionCounts).toEqual({ best: 2, good: 10, inaccuracy: 0, bad: 1 });
        const standard = shareEndlessRun({ ...session, mode: 'standard', score: 1400 });
        expect(standard).toMatchObject({ score: 1400, scoreLabel: 'Total points' });
        expect(standard.stats.map(stat => stat.value)).toEqual(['12', '13']);
        expect(shareRunText(hardcore, 'Knight', 'https://example.com/')).toContain('12 moves');
        expect(shareRunText(standard, 'Knight', 'https://example.com/')).toContain('1,400 points');
    });

    it('awards a personal best only against other completed records in the same mode', () => {
        const history = recordRunResult(initialRunHistory(), run, payout, now);
        const result = shareRegularRun(run, payout, now);
        expect(isSharePersonalBest(result, history.runs, [])).toBe(false);
        const previous = { ...history.runs[0]!, id: 'earlier', score: 100 };
        expect(isSharePersonalBest(result, [...history.runs, previous], [])).toBe(true);
        expect(isSharePersonalBest(result, [{ ...previous, score: 175 }], [])).toBe(false);
        expect(isSharePersonalBest(result, [{ ...previous, mode: 'daily', dailyDay: '2026-10-03' }], [])).toBe(false);
    });
});
