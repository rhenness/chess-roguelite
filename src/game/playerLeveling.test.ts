import { StrictMode, createElement } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialSave, saveState } from '../features/endless/storage';
import { startSession } from '../features/endless/session';
import { decision, makeLevel } from '../test/levels';
import { initialUserProgression, PROGRESSION_STORAGE_KEY, saveUserProgression } from './progression';
import { initialRunHistory, RUN_HISTORY_STORAGE_KEY, type RunRecord } from './runHistory';
import { advancePlayback, chooseMove, DEFAULT_RULES, startRun } from './run';
import {
    awardDungeonXp, awardEndlessXp, dungeonRunXp, endlessMoveXp, initialPlayerLeveling, loadPlayerLeveling,
    mergePlayerLeveling, migratePlayerLeveling, parsePlayerLeveling, PLAYER_LEVELING_STORAGE_KEY,
    PLAYER_LEVEL_THRESHOLDS, playerLevelProgress, savePlayerLeveling, totalPlayerXp,
} from './playerLeveling';
import { usePlayerLeveling } from './usePlayerLeveling';

beforeEach(() => window.localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

function completedRun(id = 'completed') {
    const level = makeLevel();
    return { ...advancePlayback(advancePlayback(chooseMove(startRun([level]), decision(level).choices[0]!.playerMove.uci))), id };
}

describe('player level rules', () => {
    it('uses exact permanent tier boundaries and keeps banking XP at the map limit', () => {
        expect(playerLevelProgress(0)).toMatchObject({ level: 1, tier: 'Bronze', earned: 0, cost: 50 });
        expect(playerLevelProgress(49).level).toBe(1);
        expect(playerLevelProgress(50).level).toBe(2);
        expect(playerLevelProgress(100)).toMatchObject({ level: 3, cost: 100 });
        for (const [xp, level, tier] of [[700, 9, 'Silver'], [2300, 17, 'Gold'], [4700, 25, 'Platinum'],
            [7900, 33, 'Emerald'], [11900, 41, 'Diamond'], [16700, 49, 'Crown'], [22300, 57, 'Legend']] as const) {
            expect(playerLevelProgress(xp - 1).level).toBe(level - 1);
            expect(playerLevelProgress(xp)).toMatchObject({ level, tier, earned: 0 });
        }
        expect(PLAYER_LEVEL_THRESHOLDS).toHaveLength(64);
        expect(playerLevelProgress(27900)).toMatchObject({ level: 64, atMaxLevel: true, fraction: 1 });
        expect(playerLevelProgress(40000)).toMatchObject({ level: 64, totalXp: 40000 });
        expect(playerLevelProgress(NaN).level).toBe(1);
    });

    it('grants a fixed award across skills, scores, and Daily coin bonuses', () => {
        const run = completedRun();
        for (const skillTier of ['beginner', 'intermediate', 'expert'] as const) {
            expect(dungeonRunXp({ ...run, skillTier, score: 999999 })).toBe(100);
            expect(dungeonRunXp({ ...run, skillTier, levelsCompleted: 0, daily: { day: '2026-10-05', expiresAt: 0 } })).toBe(100);
        }
        expect(dungeonRunXp(startRun([makeLevel()]))).toBe(0);
    });

    it('credits settled failed floors and actual decisions on a defeated unfinished floor', () => {
        const fixture = makeLevel();
        const levels = Array.from({ length: 10 }, (_, i) => ({ ...fixture, id: `floor-${i}`,
            generation: { ...fixture.generation, decisionDepth: 4 } }));
        const run = { ...startRun([fixture]), levels, levelIndex: 3, phase: 'finished' as const, result: 'defeat' as const,
            outcomes: levels.slice(0, 3).map(level => ({ id: level.id, difficultyScore: 50, status: 'failed' as const })),
            history: Array.from({ length: 2 }, () => ({ levelId: levels[3]!.id, playerMove: decision(fixture).choices[0]!.playerMove, opponentReply: null })) };
        expect(dungeonRunXp(run)).toBe(35);
        expect(dungeonRunXp({ ...run, history: [...run.history, ...run.history] })).toBe(39);
        expect(dungeonRunXp({ ...run, outcomes: [...run.outcomes, { id: levels[3]!.id, difficultyScore: 50, status: 'completed' }] })).toBe(40);
        const lethal = chooseMove(startRun([fixture], { ...DEFAULT_RULES, startingHealth: 1 }), decision(fixture).choices[3]!.playerMove.uci);
        expect(lethal.result).toBe('defeat');
        expect(dungeonRunXp(lethal)).toBe(90);
    });

    it('rejects old results after intervening runs and alternate IDs for the same Daily', () => {
        const run = completedRun();
        const daily = { ...run, daily: { day: '2026-10-05', expiresAt: 0 } };
        let state = awardDungeonXp(initialPlayerLeveling(), run);
        state = awardDungeonXp(state, completedRun('next'));
        expect(awardDungeonXp(state, run)).toBe(state);
        state = awardDungeonXp(state, daily);
        expect(awardDungeonXp(state, { ...daily, id: 'another-daily-id' })).toBe(state);
        expect(totalPlayerXp(state)).toBe(300);
    });

    it('banks Endless participation in both modes and pays only new move pairs', () => {
        expect([0, 1, 2, 3, 4, 40].map(endlessMoveXp)).toEqual([0, 0, 5, 5, 10, 100]);
        for (const mode of ['standard', 'hardcore'] as const) {
            const session = { ...startSession(mode, 'default', {}), moves: 3 };
            let state = awardEndlessXp(initialPlayerLeveling(), session);
            expect(totalPlayerXp(state)).toBe(5);
            expect(awardEndlessXp(state, { ...session, moves: 2 })).toBe(state);
            state = awardEndlessXp(state, { ...session, moves: 4 });
            expect(totalPlayerXp(state)).toBe(10);
            const finished = { ...session, moves: 4, phase: 'finished' as const };
            expect(awardEndlessXp(state, finished)).toBe(state);
        }
    });
});

describe('leveling saves and migration', () => {
    it('grants historical dungeon XP once, without adding overlapping history', () => {
        const record: RunRecord = { id: 'old', mode: 'regular', score: 0, floorsCompleted: 0,
            floorsTotal: 10, checkmates: 0, result: 'defeat', finishedAt: 0 };
        const progression = { ...initialUserProgression(), finishedRuns: 8, lastFinishedRunId: 'last-old', lastDailyRewardDay: '2026-10-04' };
        const state = migratePlayerLeveling(progression, { version: 1, runs: [record] }, initialSave());
        expect(totalPlayerXp(state)).toBe(800);
        for (const id of ['old', 'last-old']) expect(awardDungeonXp(state, completedRun(id))).toBe(state);
        expect(awardDungeonXp(state, { ...completedRun(), daily: { day: '2026-10-04', expiresAt: 0 } })).toBe(state);
        expect(totalPlayerXp(awardDungeonXp(state, completedRun('new')))).toBe(900);
        savePlayerLeveling(state);
        expect(totalPlayerXp(loadPlayerLeveling()!)).toBe(800);
        expect(totalPlayerXp(migratePlayerLeveling(initialUserProgression(), { version: 1, runs: [record] }, initialSave()))).toBe(100);
    });

    it('counts the same legacy Endless record and current session once, carrying an odd move', () => {
        const session = { ...startSession('standard', 'default', {}), moves: 41 };
        const records = [{ id: session.id, mode: session.mode, score: 0, longestStreak: 0, moves: 40,
            gamesCompleted: 0, coins: 0, finishedAt: 0 }];
        const state = migratePlayerLeveling(initialUserProgression(), initialRunHistory(), { version: 1, session, records });
        expect(totalPlayerXp(state)).toBe(100);
        expect(totalPlayerXp(awardEndlessXp(state, { ...session, moves: 42 }))).toBe(105);
    });

    it('unions awards across tabs while preserving the greatest checkpoint and legacy grant', () => {
        const a = { ...initialPlayerLeveling(), legacyXp: 800, receipts: { 'run:a': 100, 'endless:c': 5 } };
        const b = { ...initialPlayerLeveling(), legacyXp: 800, legacyDailyThrough: '2026-10-04', receipts: { 'run:b': 35, 'endless:c': 10 } };
        const merged = mergePlayerLeveling(a, b);
        expect(totalPlayerXp(merged)).toBe(945);
        expect(merged.legacyDailyThrough).toBe('2026-10-04');
        expect(mergePlayerLeveling(merged, a)).toBe(merged);
        expect(mergePlayerLeveling(merged, b)).toBe(merged);
    });

    it.each([null, 'bad json', '{}', JSON.stringify({ ...initialPlayerLeveling(), version: 2 }),
        JSON.stringify({ ...initialPlayerLeveling(), legacyXp: -1 }),
        JSON.stringify({ ...initialPlayerLeveling(), receipts: [] }),
        JSON.stringify({ ...initialPlayerLeveling(), receipts: { 'run:id': 1.5 } }),
        JSON.stringify({ ...initialPlayerLeveling(), receipts: { 'daily:2026-02-30': 100 } }),
    ])('rejects malformed or unsupported saves: %s', source => expect(parsePlayerLeveling(source)).toBeNull());

    it('saturates lifetime XP at a safe integer and tolerates unavailable storage', () => {
        expect(totalPlayerXp({ ...initialPlayerLeveling(), legacyXp: Number.MAX_SAFE_INTEGER, receipts: { 'run:a': 100 } })).toBe(Number.MAX_SAFE_INTEGER);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        expect(savePlayerLeveling(initialPlayerLeveling())).toBe(false);
    });
});

describe('live player leveling', () => {
    it('survives StrictMode, refresh, resumed finishes, and banked Endless moves without repeat XP', () => {
        const run = completedRun();
        const endless = startSession('standard', 'default', {});
        const { result, rerender, unmount } = renderHook(({ currentRun, session }) => usePlayerLeveling(currentRun, session),
            { initialProps: { currentRun: run, session: endless }, wrapper: ({ children }) => createElement(StrictMode, null, children) });
        expect(result.current.progress.totalXp).toBe(100);
        rerender({ currentRun: { ...run }, session: { ...endless, moves: 3 } });
        expect(result.current.progress.totalXp).toBe(105);
        unmount();
        const refreshed = renderHook(() => usePlayerLeveling(run, { ...endless, moves: 4 }));
        expect(refreshed.result.current.progress.totalXp).toBe(110);
        expect(totalPlayerXp(loadPlayerLeveling()!)).toBe(110);
    });

    it('saves a legacy grant once and keeps it when future finishes update old counters', () => {
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 8 });
        saveState(initialSave());
        const view = renderHook(() => usePlayerLeveling(null, null));
        expect(view.result.current.progress.totalXp).toBe(800);
        act(() => view.result.current.recordRun(completedRun()));
        expect(view.result.current.progress.totalXp).toBe(900);
        saveUserProgression({ ...initialUserProgression(), finishedRuns: 9 });
        view.unmount();
        expect(renderHook(() => usePlayerLeveling(null, null)).result.current.progress.totalXp).toBe(900);
        expect(window.localStorage.getItem(PROGRESSION_STORAGE_KEY)).toBeTruthy();
        expect(window.localStorage.getItem(RUN_HISTORY_STORAGE_KEY)).toBeNull();
    });

    it('reconciles another tab without losing the local award or paying shared receipts twice', () => {
        const view = renderHook(() => usePlayerLeveling(completedRun('local'), null));
        const other = awardDungeonXp(initialPlayerLeveling(), completedRun('remote'));
        savePlayerLeveling(other);
        act(() => window.dispatchEvent(new StorageEvent('storage', { key: PLAYER_LEVELING_STORAGE_KEY, newValue: JSON.stringify(other) })));
        expect(view.result.current.progress.totalXp).toBe(200);
        expect(totalPlayerXp(loadPlayerLeveling()!)).toBe(200);
    });

    it('keeps earning in memory if storage is unavailable, exposing the failure', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        const view = renderHook(() => usePlayerLeveling(completedRun(), null));
        expect(view.result.current.progress.totalXp).toBe(100);
        expect(view.result.current.persisted).toBe(false);
        act(() => view.result.current.recordRun(completedRun('new')));
        expect(view.result.current.progress.totalXp).toBe(200);
    });
});
