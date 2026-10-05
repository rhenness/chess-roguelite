import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeLevel } from '../test/levels';
import { advancePlayback, chooseMove, DEFAULT_RULES, startRun } from './run';
import { advancePlayTutorial, beginPlayTutorial, finishPlayTutorial, initialPlayTutorial, loadPlayTutorial,
    observePlayTutorial, PLAY_TUTORIAL_STORAGE_KEY, savePlayTutorial } from './playTutorial';

afterEach(() => { window.localStorage.removeItem(PLAY_TUTORIAL_STORAGE_KEY); vi.restoreAllMocks(); });

describe('play tutorial progress', () => {
    it('preserves the run while explanations advance and waits for an actual move', () => {
        const run = startRun([makeLevel('guide', 10, 2)]);
        const original = structuredClone(run);
        const welcome = beginPlayTutorial(run);
        const piece = advancePlayTutorial(welcome, run);
        expect(piece.step).toBe('piece');
        expect(advancePlayTutorial(piece, run)).toBe(piece);
        expect(observePlayTutorial(piece, run)).toBe(piece);
        const played = chooseMove(run, run.node.kind === 'decision' ? run.node.choices[0]!.playerMove.uci : '');
        const feedback = observePlayTutorial(piece, played);
        expect(feedback.step).toBe('feedback');
        expect(advancePlayTutorial(feedback, played).step).toBe('health');
        expect(run).toEqual(original);
    });

    it('persists the associated run, current step, and action counts across refresh', () => {
        const state = { ...beginPlayTutorial(startRun([makeLevel()])), step: 'feedback' as const };
        savePlayTutorial(state);
        expect(loadPlayTutorial()).toEqual(state);
        savePlayTutorial(finishPlayTutorial(state));
        expect(loadPlayTutorial().status).toBe('done');
    });

    it('rejects corrupt progress and keeps storage failures from preventing play', () => {
        for (const source of ['{broken', 'null', JSON.stringify({ ...initialPlayTutorial(), status: 'active' }),
            JSON.stringify({ ...initialPlayTutorial(), step: 'unknown' }), JSON.stringify({ ...initialPlayTutorial(), startingDecision: -1 })]) {
            window.localStorage.setItem(PLAY_TUTORIAL_STORAGE_KEY, source);
            expect(loadPlayTutorial()).toEqual(initialPlayTutorial());
        }
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
        expect(() => savePlayTutorial(initialPlayTutorial())).not.toThrow();
    });

    it('asks for a piece again when transient destination selection is lost on refresh', () => {
        const state = { ...beginPlayTutorial(startRun([makeLevel()])), step: 'destination' as const };
        savePlayTutorial(state);
        expect(loadPlayTutorial()).toEqual({ ...state, step: 'piece' });
    });

    it('retires old checkpoint guidance without replaying the basic play lessons', () => {
        const run = startRun(Array.from({ length: 10 }, (_, index) => makeLevel(`checkpoint-${index}`, index)));
        const state = { ...beginPlayTutorial(run), step: 'checkpoint' };
        window.localStorage.setItem(PLAY_TUTORIAL_STORAGE_KEY, JSON.stringify(state));
        const restored = loadPlayTutorial();
        expect(restored.status).toBe('done');
        expect(observePlayTutorial(restored, { ...run, phase: 'checkpoint' })).toBe(restored);
        expect(observePlayTutorial(restored, run)).toBe(restored);
        expect(observePlayTutorial(restored, { ...run, items: { 'healing-potion': 1 } })).toBe(restored);
    });

    it('ignores another run and a dungeon while the guided regular run is paused', () => {
        const run = startRun([makeLevel()]);
        const state = beginPlayTutorial(run);
        expect(observePlayTutorial(state, startRun([makeLevel()]))).toBe(state);
        expect(observePlayTutorial(state, { ...run, daily: { day: '2026-10-05', expiresAt: 0 } })).toBe(state);
    });

    it('allows a finished short run to proceed to the normal payout after the play lessons', () => {
        const run = startRun([makeLevel()]);
        const finished = advancePlayback(advancePlayback(chooseMove(run, run.node.kind === 'decision' ? run.node.choices[0]!.playerMove.uci : '')));
        const state = { ...beginPlayTutorial(run), step: 'carryover' as const };
        expect(advancePlayTutorial(state, finished).status).toBe('done');
        // Replaying the guide during the last move's animation cannot wait for a nonexistent next move.
        const replay = { ...beginPlayTutorial(finished), step: 'piece' as const };
        expect(observePlayTutorial(replay, finished).status).toBe('done');
    });
});
