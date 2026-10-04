import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decision, makeLevel } from '../test/levels';
import { advancePlayback, chooseMove, DEFAULT_RULES, startRun } from './run';
import {
    initialUserProgression, isPieceSetUnlocked, loadUserProgression, newlyUnlockedSets,
    PROGRESSION_STORAGE_KEY, recordFinishedRun, saveUserProgression,
} from './progression';

beforeEach(() => { window.localStorage.removeItem(PROGRESSION_STORAGE_KEY); });
afterEach(() => { vi.restoreAllMocks(); window.localStorage.removeItem(PROGRESSION_STORAGE_KEY); });

describe('saved run progression', () => {
    it('migrates existing unlock progress without inventing coins or losing its counted run', () => {
        window.localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify({
            version: 1, finishedRuns: 8, lastFinishedRunId: 'existing-run',
        }));
        expect(loadUserProgression()).toEqual({
            ...initialUserProgression(), finishedRuns: 8, lastFinishedRunId: 'existing-run',
        });
    });

    it.each([
        { coins: -1, paidUpgrades: {} },
        { coins: 1.5, paidUpgrades: {} },
        { coins: 50, paidUpgrades: { unknown: { a1: 1 } } },
        { coins: 50, paidUpgrades: { default: { z9: 1 } } },
        { coins: 50, paidUpgrades: { default: { a1: -1 } } },
        { coins: 50, paidUpgrades: { default: { a1: 1.5 } } },
    ])('recovers a malformed wallet without resetting valid unlock progress: %j', wallet => {
        window.localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify({
            ...initialUserProgression(), finishedRuns: 8, lastFinishedRunId: 'previous', ...wallet,
        }));
        expect(loadUserProgression()).toEqual({
            ...initialUserProgression(), finishedRuns: 8, lastFinishedRunId: 'previous',
        });
    });

    it('counts wins and deaths once each, but ignores unfinished runs and playback', () => {
        const level = makeLevel();
        const profile = initialUserProgression();
        const run = startRun([level]);
        const reveal = chooseMove(run, decision(level).choices[0]!.playerMove.uci);
        const reply = advancePlayback(reveal);
        for (const unfinished of [run, reveal, reply]) expect(recordFinishedRun(profile, unfinished)).toBe(profile);
        const completed = advancePlayback(reply);
        const first = recordFinishedRun(profile, completed);
        expect(first.finishedRuns).toBe(1);
        expect(first.lastFinishedRunId).toBe(run.id);
        expect(recordFinishedRun(first, completed)).toBe(first);
        const nextRun = startRun([level], { ...DEFAULT_RULES, startingHealth: 1 });
        const defeated = chooseMove(nextRun, decision(level).choices[3]!.playerMove.uci);
        const second = recordFinishedRun(first, defeated);
        expect(second.finishedRuns).toBe(2);
        expect(second.lastFinishedRunId).toBe(nextRun.id);
        expect(recordFinishedRun(second, defeated)).toBe(second);
    });

    it('does not count a finished level while the run has another level remaining', () => {
        const level = makeLevel('first', 10);
        const run = startRun([level, makeLevel('second', 20)]);
        const ended = advancePlayback(advancePlayback(chooseMove(run, decision(level).choices[0]!.playerMove.uci)));
        expect(ended.phase).toBe('level-ended');
        const profile = initialUserProgression();
        expect(recordFinishedRun(profile, ended)).toBe(profile);
    });

    it.each([
        [0, true, false, false], [2, true, false, false], [3, true, true, false],
        [7, true, true, false], [8, true, true, true],
    ] as const)('unlocks the right sets at %i finished runs', (finishedRuns, defaultSet, obsidian, gilded) => {
        const profile = { ...initialUserProgression(), finishedRuns };
        expect(isPieceSetUnlocked('default', profile)).toBe(defaultSet);
        expect(isPieceSetUnlocked('obsidian', profile)).toBe(obsidian);
        expect(isPieceSetUnlocked('gilded', profile)).toBe(gilded);
    });

    it('announces only newly unlocked sets and persists the completion identity', () => {
        const before = { ...initialUserProgression(), finishedRuns: 2 };
        const after = { ...before, finishedRuns: 3, lastFinishedRunId: 'third-run' };
        expect(newlyUnlockedSets(before, after)).toEqual(['obsidian']);
        expect(newlyUnlockedSets(after, after)).toEqual([]);
        expect(newlyUnlockedSets({ ...after, finishedRuns: 7 }, { ...after, finishedRuns: 8 })).toEqual(['gilded']);
        saveUserProgression(after);
        expect(loadUserProgression()).toEqual(after);
    });

    it.each([
        '{invalid', 'null', '{}',
        JSON.stringify({ version: 2, finishedRuns: 8, lastFinishedRunId: null }),
        ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '8'].map(finishedRuns =>
            JSON.stringify({ version: 1, finishedRuns, lastFinishedRunId: null })),
        JSON.stringify({ version: 1, finishedRuns: 8, lastFinishedRunId: '' }),
    ])('recovers from invalid saved progression: %s', source => {
        window.localStorage.setItem(PROGRESSION_STORAGE_KEY, source);
        expect(loadUserProgression()).toEqual(initialUserProgression());
    });

    it('handles unavailable storage without interrupting gameplay', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
        expect(loadUserProgression()).toEqual(initialUserProgression());
        expect(() => saveUserProgression({ ...initialUserProgression(), finishedRuns: 3 })).not.toThrow();
    });
});
