import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeLevel } from '../test/levels';
import { activateItem, type ItemInventory } from './items';
import { advancePlayback, chooseMove, DEFAULT_RULES, nextLevel, startRun, type RunState } from './run';
import { clearRegularRun, loadRegularRun, REGULAR_STORAGE_KEY, saveRegularRun } from './regular';

afterEach(() => { vi.restoreAllMocks(); window.localStorage.removeItem(REGULAR_STORAGE_KEY); });

const best = (run: RunState) => {
    if (run.node.kind !== 'decision') throw new Error('Expected a decision.');
    return chooseMove(run, run.node.choices[0]!.playerMove.uci);
};

describe('regular run storage', () => {
    it('restores every playback phase, floor transitions, totals, and the original run ID', () => {
        const pool = [makeLevel('first', 10), makeLevel('second', 30)];
        let run = startRun(pool);
        for (let step = 0; step < 10; step++) {
            expect(saveRegularRun({ run, set: 'obsidian', initialItems: {} })).toBe(true);
            expect(loadRegularRun([...pool].reverse())).toEqual({ run, set: 'obsidian', initialItems: {} });
            run = run.phase === 'decision' ? best(run) : run.phase === 'level-ended' ? nextLevel(run) : advancePlayback(run);
        }
    });

    it('restores purchased inventory, active effects, healing, and item use ordering', () => {
        const pool = [makeLevel('items', 10, 3)];
        const initialItems: ItemInventory = { 'triple-crown': 1, 'kings-guard': 1, 'healing-potion': 1 };
        let run = activateItem(startRun(pool, DEFAULT_RULES, Math.random, initialItems), 'triple-crown');
        run = advancePlayback(advancePlayback(best(run)));
        run = activateItem(activateItem(run, 'healing-potion'), 'kings-guard');
        saveRegularRun({ run, set: 'gilded', initialItems });
        expect(loadRegularRun(pool)).toEqual({ run, set: 'gilded', initialItems });
    });

    it('stores compact floor IDs and preserves the draw when new floors are added', () => {
        const pool = Array.from({ length: 14 }, (_, index) => makeLevel(`floor-${index}`, index));
        const run = best(startRun(pool, DEFAULT_RULES, () => 0));
        saveRegularRun({ run, set: 'default', initialItems: {} });
        const source = window.localStorage.getItem(REGULAR_STORAGE_KEY)!;
        expect(source).not.toContain('fenAfterPlayerMove');
        expect(source).not.toContain('"health"');
        expect(loadRegularRun([...pool, makeLevel('new')])?.run).toEqual(run);
        expect(loadRegularRun(pool.filter(level => level.id !== run.levels[0]!.id))).toBeNull();
    });

    it('ignores corrupt or incompatible saves instead of loading invalid gameplay', () => {
        const pool = [makeLevel()];
        saveRegularRun({ run: best(startRun(pool)), set: 'default', initialItems: {} });
        const valid = JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY)!);
        const invalid = [null, { ...valid, version: 2 }, { ...valid, set: 'unknown' },
            { ...valid, levelIds: [pool[0]!.id, pool[0]!.id] },
            { ...valid, initialItems: { 'triple-crown': 4 } },
            { ...valid, checkpoint: { ...valid.checkpoint, moves: [{ levelId: pool[0]!.id, uci: 'a1a8' }] } },
            { ...valid, checkpoint: { ...valid.checkpoint, levelIndex: 10 } }];
        for (const value of invalid) {
            window.localStorage.setItem(REGULAR_STORAGE_KEY, JSON.stringify(value));
            expect(loadRegularRun(pool)).toBeNull();
        }
        window.localStorage.setItem(REGULAR_STORAGE_KEY, '{broken');
        expect(loadRegularRun(pool)).toBeNull();
    });

    it('clears completed saves and handles unavailable storage', () => {
        const pool = [makeLevel()];
        const session = { run: startRun(pool), set: 'default' as const, initialItems: {} };
        saveRegularRun(session);
        expect(clearRegularRun()).toBe(true);
        expect(loadRegularRun(pool)).toBeNull();
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
        expect(saveRegularRun(session)).toBe(false);
        expect(loadRegularRun(pool)).toBeNull();
    });
});
