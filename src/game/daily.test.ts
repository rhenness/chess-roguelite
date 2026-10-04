import { afterEach, describe, expect, it } from 'vitest';
import { decision, makeLevel } from '../test/levels';
import { initialMultiplierProfile } from './multipliers';
import { advancePlayback, chooseMove, DEFAULT_RULES, nextLevel, type RunState } from './run';
import {
    createDailyDungeon, DAILY_STORAGE_KEY, dailyDeadline, enterDailyDungeon, expireDailyDungeon,
    initialDailyArchive, loadDailyArchive, recordDailyRun, restoreDailyRun, saveDailyArchive, storeDailyDungeon, utcDay,
} from './daily';

const now = Date.parse('2026-10-04T12:00:00Z');
const pool = Array.from({ length: 14 }, (_, i) => makeLevel(`daily-${i}`, i));
const board = initialMultiplierProfile().board;
const best = (run: RunState) => {
    if (run.node.kind !== 'decision') throw new Error('Expected decision.');
    return chooseMove(run, run.node.choices[0]!.playerMove.uci);
};
afterEach(() => window.localStorage.removeItem(DAILY_STORAGE_KEY));

describe('daily dungeon', () => {
    it('counts a final decision before the deadline even when reply playback finishes later', () => {
        const entered = enterDailyDungeon(createDailyDungeon([makeLevel()], now), 'default', DEFAULT_RULES, board, now);
        const chosen = best(entered.run);
        const saved = recordDailyRun(entered.dungeon, chosen, entered.dungeon.expiresAt - 1, () => 0);
        expect(saved.attempt?.status).toBe('finished');
        expect(expireDailyDungeon(saved, entered.dungeon.expiresAt)).toBe(saved);
        expect(restoreDailyRun(saved)?.phase).toBe('finished');
    });
    it('uses UTC boundaries and selects the same ten levels independent of pool order', () => {
        const first = createDailyDungeon(pool, now);
        const second = createDailyDungeon([...pool].reverse(), now + 3600000);
        expect(first.levels.map(level => level.id)).toEqual(second.levels.map(level => level.id));
        expect(first.levels).toHaveLength(10);
        expect(new Set(first.levels.map(level => level.id)).size).toBe(10);
        expect(first.expiresAt).toBe(Date.parse('2026-10-05T00:00:00Z'));
        expect(utcDay(Date.parse('2026-10-04T23:59:59Z'))).toBe('2026-10-04');
        expect(utcDay(first.expiresAt)).toBe('2026-10-05');
        expect(createDailyDungeon(pool, first.expiresAt).levels.map(level => level.id)).not.toEqual(first.levels.map(level => level.id));
    });

    it('freezes the selected levels, rules, and multipliers and consumes an attempt at entry', () => {
        const multipliers = { ...board, a1: 30 };
        const rules = { ...DEFAULT_RULES, startingHealth: 2 };
        const entered = enterDailyDungeon(createDailyDungeon(pool, now), 'obsidian', rules, multipliers, now);
        multipliers.a1 = 90;
        rules.startingHealth = 9;
        expect(entered.dungeon.attempt?.multipliers.a1).toBe(30);
        expect(entered.run.health).toBe(2);
        expect(entered.dungeon.attempt?.rules.startingHealth).toBe(2);
        expect(() => enterDailyDungeon(entered.dungeon, 'default', DEFAULT_RULES, board, now)).toThrow('already been used');
        expect(() => enterDailyDungeon(createDailyDungeon(pool, now), 'default', DEFAULT_RULES, board, dailyDeadline('2026-10-04'))).toThrow('expired');
    });

    it('replays checkpoints through move reveal, reply, transitions, and the next decision', () => {
        const entered = enterDailyDungeon(createDailyDungeon(pool, now), 'default', DEFAULT_RULES, board, now);
        let run = best(entered.run);
        for (let i = 0; i < 4; i++) {
            const saved = recordDailyRun(entered.dungeon, run, now);
            expect(restoreDailyRun(saved)).toEqual(run);
            run = run.phase === 'level-ended' ? nextLevel(run) : advancePlayback(run);
        }
    });

    it('persists compact checkpoints and preserves a draw when new catalog levels are added', () => {
        const entered = enterDailyDungeon(createDailyDungeon(pool, now), 'default', DEFAULT_RULES, board, now);
        const saved = recordDailyRun(entered.dungeon, best(entered.run), now);
        expect(saveDailyArchive(storeDailyDungeon(initialDailyArchive(), saved))).toBe(true);
        const source = window.localStorage.getItem(DAILY_STORAGE_KEY)!;
        expect(source).not.toContain('fenAfterPlayerMove');
        const restored = loadDailyArchive([...pool, makeLevel('new-level')]).days[saved.day]!;
        expect(restored.levels.map(level => level.id)).toEqual(saved.levels.map(level => level.id));
        expect(restoreDailyRun(restored)).toEqual(restoreDailyRun(saved));
    });

    it('expires at the exact deadline, rejects late finishes, and never expires a finished attempt', () => {
        const entered = enterDailyDungeon(createDailyDungeon(pool, now), 'default', DEFAULT_RULES, board, now);
        const deadline = entered.dungeon.expiresAt;
        expect(expireDailyDungeon(entered.dungeon, deadline - 1)).toBe(entered.dungeon);
        const expired = expireDailyDungeon(entered.dungeon, deadline);
        expect(expired.attempt?.status).toBe('expired');
        expect(restoreDailyRun(expired)).toBeNull();
        const lethal = enterDailyDungeon(createDailyDungeon(pool, now), 'default', { ...DEFAULT_RULES, startingHealth: 1 }, board, now);
        const run = chooseMove(lethal.run, decision(lethal.run.levels[0]!).choices[3]!.playerMove.uci);
        expect(recordDailyRun(lethal.dungeon, run, deadline).attempt?.status).toBe('expired');
        const finished = recordDailyRun(lethal.dungeon, run, deadline - 1, () => 0);
        expect(finished.attempt?.status).toBe('finished');
        expect(expireDailyDungeon(finished, deadline)).toBe(finished);
    });

    it('uses a personal random payout once and restores the same finished score', () => {
        const entered = enterDailyDungeon(createDailyDungeon(pool, now), 'default', DEFAULT_RULES, { ...board, a1: 50 }, now);
        let run = entered.run;
        for (let index = 0; index < 10; index++) {
            run = advancePlayback(advancePlayback(best(run)));
            if (index < 9) run = nextLevel(run);
        }
        const finished = recordDailyRun(entered.dungeon, run, now, () => 0);
        expect(finished.attempt?.payout).toMatchObject({ square: 'a1', multiplier: 50, baseScore: 1000, finalScore: 5000 });
        expect(recordDailyRun(finished, run, now, () => 0.5)).toBe(finished);
        saveDailyArchive(storeDailyDungeon(initialDailyArchive(), finished));
        const restored = loadDailyArchive(pool).days[finished.day]!;
        expect(restored.attempt?.payout).toEqual(finished.attempt?.payout);
        expect(restoreDailyRun(restored)).toEqual(run);
    });

    it('keeps a malformed attempt consumed and recovers from broken archive JSON', () => {
        const entered = enterDailyDungeon(createDailyDungeon(pool, now), 'default', DEFAULT_RULES, board, now);
        entered.dungeon.attempt!.checkpoint.moves.push({ levelId: entered.run.levels[0]!.id, uci: 'a1a8' });
        saveDailyArchive(storeDailyDungeon(initialDailyArchive(), entered.dungeon));
        expect(loadDailyArchive(pool).days['2026-10-04']?.attempt?.status).toBe('expired');
        window.localStorage.setItem(DAILY_STORAGE_KEY, '{broken');
        expect(loadDailyArchive(pool)).toEqual(initialDailyArchive());
    });
});
