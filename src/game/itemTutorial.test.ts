import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeLevel } from '../test/levels';
import { activateItem } from './items';
import { startRun } from './run';
import { beginPlayTutorial, finishPlayTutorial, PLAY_TUTORIAL_STORAGE_KEY, savePlayTutorial } from './playTutorial';
import { finishItemTutorial, initialItemTutorial, ITEM_TUTORIAL_STORAGE_KEY, loadItemTutorial,
    observeItemTutorial, saveItemTutorial } from './itemTutorial';

afterEach(() => {
    localStorage.removeItem(ITEM_TUTORIAL_STORAGE_KEY);
    localStorage.removeItem(PLAY_TUTORIAL_STORAGE_KEY);
    vi.restoreAllMocks();
});

describe('first inventory tutorial', () => {
    it('stays pending through empty or finished runs and teaches inventory in a later playable run', () => {
        const state = initialItemTutorial();
        const first = startRun([makeLevel()]);
        expect(observeItemTutorial(state, first, true)).toBe(state);
        expect(observeItemTutorial(state, { ...first, phase: 'finished' }, true)).toBe(state);
        const second = startRun([makeLevel()], undefined, Math.random, { 'triple-crown': 1 });
        expect(observeItemTutorial(state, second, false)).toBe(state);
        expect(observeItemTutorial(state, { ...second, phase: 'checkpoint' }, true)).toBe(state);
        const lesson = observeItemTutorial(state, second, true);
        expect(lesson).toMatchObject({ status: 'active', step: 'item', runId: second.id });
        expect(observeItemTutorial(lesson, activateItem(second, 'triple-crown'), true).step).toBe('ready');
    });

    it('persists dismissals and resumes an active lesson after refresh', () => {
        const run = startRun([makeLevel()], undefined, Math.random, { 'healing-potion': 1 });
        const lesson = observeItemTutorial(initialItemTutorial(), run, true);
        saveItemTutorial(lesson);
        expect(loadItemTutorial()).toEqual(lesson);
        const done = finishItemTutorial(lesson);
        saveItemTutorial(done);
        expect(loadItemTutorial()).toEqual(done);
        expect(observeItemTutorial(done, run, true)).toBe(done);
    });

    it('retains a pending lesson when only the basic play guide was skipped or ended before items', () => {
        const run = startRun([makeLevel()]);
        for (const step of ['welcome', 'carryover', 'waiting-checkpoint'] as const) {
            savePlayTutorial(finishPlayTutorial({ ...beginPlayTutorial(run), step }));
            expect(loadItemTutorial()).toEqual(initialItemTutorial());
        }
    });

    it('migrates an item lesson in progress and remembers previously completed item guidance', () => {
        const legacy = { ...beginPlayTutorial(startRun([makeLevel()])), step: 'item' as const, itemUsesAtPrompt: 2 };
        savePlayTutorial(legacy);
        expect(loadItemTutorial()).toMatchObject({ status: 'active', step: 'item', runId: legacy.runId, itemUsesAtPrompt: 2 });
        savePlayTutorial(finishPlayTutorial(legacy));
        expect(loadItemTutorial().status).toBe('done');
    });

    it('ignores corrupt storage and continues in memory when saving is unavailable', () => {
        localStorage.setItem(ITEM_TUTORIAL_STORAGE_KEY, '{broken');
        expect(loadItemTutorial()).toEqual(initialItemTutorial());
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
        expect(() => saveItemTutorial(initialItemTutorial())).not.toThrow();
    });
});
