import { describe, expect, it } from 'vitest';
import type { MoveQuality } from '../types/level';
import { continueToNextRound, decision, makeLevel } from '../test/levels';
import { advancePlayback, boardFen, chooseMove, DEFAULT_RULES, nextLevel, shuffleChoices, startRun, type RunState } from './run';

function chooseQuality(state: RunState, quality: MoveQuality): RunState {
    if (state.node.kind !== 'decision') throw new Error('Expected decision.');
    return chooseMove(state, state.node.choices.find(choice => choice.quality === quality)!.playerMove.uci);
}

function finishDecision(state: RunState, quality: MoveQuality = 'best'): RunState {
    return advancePlayback(advancePlayback(chooseQuality(state, quality)));
}

describe('run state', () => {
    it('samples ten distinct scored levels evenly across difficulty and plays them in order', () => {
        const levels = Array.from({ length: 20 }, (_, index) => makeLevel(`level-${index}`, index));
        const pool = [...levels, levels[0]!, makeLevel('unscored', -1)];
        const original = [...pool];
        const state = startRun(pool, DEFAULT_RULES, () => 0.999);
        expect(state.levels).toHaveLength(10);
        expect(new Set(state.levels.map(level => level.id)).size).toBe(10);
        expect(state.levels.map(level => level.difficulty)).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
        expect(pool).toEqual(original);
        const restarted = startRun(pool, DEFAULT_RULES, () => 0);
        expect(restarted.levels.map(level => level.difficulty)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
    });

    it('ends after the ten selected levels rather than continuing through the catalog', () => {
        const pool = Array.from({ length: 20 }, (_, index) => makeLevel(`level-${index}`, index));
        let state = startRun(pool, DEFAULT_RULES, () => 0);
        for (let index = 0; index < 10; index++) {
            state = finishDecision(state);
            if (index < 9) state = continueToNextRound(state);
        }
        expect(state).toMatchObject({ phase: 'finished', result: 'complete', levelsCompleted: 10, levelIndex: 9 });
    });

    it('awards one extra health every four consecutive Best moves across levels, without a health cap', () => {
        const pool = Array.from({ length: 8 }, (_, index) => makeLevel(`streak-${index}`, index));
        let state = startRun(pool);
        for (let index = 0; index < pool.length; index++) {
            const selected = chooseQuality(state, 'best');
            expect(selected.bestMoveStreak).toBe(index + 1);
            expect(selected.lastHealthBonus).toBe((index + 1) % 4 === 0 ? 1 : 0);
            expect(selected.health).toBe(3 + Math.floor((index + 1) / 4));
            expect(chooseQuality(selected, 'best')).toBe(selected);
            state = advancePlayback(advancePlayback(selected));
            expect(state.health).toBe(selected.health);
            if (index < pool.length - 1) state = continueToNextRound(state);
        }
        expect(state.health).toBe(5);
        expect(startRun(pool)).toMatchObject({ health: 3, bestMoveStreak: 0, lastHealthBonus: 0 });
    });

    it.each(['good', 'inaccuracy', 'bad'] as const)('%s breaks the Best streak and starts a fresh four-move bonus', quality => {
        const pool = Array.from({ length: 8 }, (_, index) => makeLevel(`streak-${index}`, index));
        let state = startRun(pool);
        for (let index = 0; index < 3; index++) state = continueToNextRound(finishDecision(state));
        expect(state.bestMoveStreak).toBe(3);
        state = continueToNextRound(finishDecision(state, quality));
        expect(state.bestMoveStreak).toBe(0);
        const healthAfterBreak = state.health;
        for (let index = 0; index < 4; index++) {
            state = finishDecision(state);
            expect(state.health).toBe(healthAfterBreak + (index === 3 ? 1 : 0));
            if (index < 3) state = continueToNextRound(state);
        }
        expect(state.bestMoveStreak).toBe(4);
        expect(state.lastHealthBonus).toBe(1);
    });

    it('starts at the easiest scored level with fresh run statistics', () => {
        const state = startRun([makeLevel('hard', 80), makeLevel('excluded', -1), makeLevel('easy', 10)]);
        expect(state).toMatchObject({ levelIndex: 0, health: 3, score: 0, decisionsMade: 0, highestDifficultyReached: 10, highestDifficultyCompleted: null, phase: 'decision' });
        expect(state.levels.map(level => level.id)).toEqual(['easy', 'hard']);
        expect(state.moveCounts).toEqual({ best: 0, good: 0, inaccuracy: 0, bad: 0 });
    });

    it.each([
        ['best', 3, 100], ['good', 3, 75], ['inaccuracy', 2, 25], ['bad', 1, 0],
    ] as const)('applies %s health and points exactly once', (quality, health, score) => {
        const initial = startRun([makeLevel()]);
        const selected = chooseQuality(initial, quality);
        expect(selected).toMatchObject({ health, score, decisionsMade: 1, phase: 'reveal' });
        expect(selected.moveCounts[quality]).toBe(1);
        expect(chooseQuality(selected, quality)).toBe(selected);
        expect(initial.health).toBe(3);
        expect(initial.score).toBe(0);
    });

    it('plays the selected player move and stored reply, then follows that exact branch', () => {
        const level = makeLevel('branched', 20, 2);
        for (const choice of decision(level).choices) {
            const initial = startRun([level]);
            const selected = chooseMove(initial, choice.playerMove.uci);
            expect(selected.history).toEqual([{ levelId: level.id, playerMove: choice.playerMove, opponentReply: null }]);
            expect(boardFen(selected)).toBe(choice.fenAfterPlayerMove);
            const reply = advancePlayback(selected);
            expect(reply.history).toEqual([{ levelId: level.id, playerMove: choice.playerMove, opponentReply: choice.opponentReply }]);
            expect(selected.history[0]?.opponentReply).toBeNull();
            expect(reply.phase).toBe('reply');
            expect(boardFen(reply)).toBe(choice.next.fen);
            const next = advancePlayback(reply);
            expect(next.history).toEqual(reply.history);
            expect(next.phase).toBe('decision');
            expect(next.node).toBe(choice.next);
            expect(boardFen(next)).toBe(choice.next.fen);
        }
    });

    it('rejects unoffered moves and playback/transition actions in the wrong phase', () => {
        const state = startRun([makeLevel()]);
        expect(chooseMove(state, 'e2e4')).toBe(state);
        expect(advancePlayback(state)).toBe(state);
        expect(nextLevel(state)).toBe(state);
    });

    it('persists health, score, counts and difficulty across nonrepeating levels', () => {
        const first = finishDecision(startRun([makeLevel('hard', 70), makeLevel('easy', 10)]), 'inaccuracy');
        expect(first).toMatchObject({ phase: 'level-ended', health: 2, score: 25, levelsCompleted: 1, highestDifficultyCompleted: 10 });
        const second = nextLevel(first);
        expect(second).toMatchObject({ phase: 'decision', health: 2, score: 25, levelIndex: 1, highestDifficultyReached: 70, lastChoice: null });
        const finished = finishDecision(second, 'good');
        expect(finished).toMatchObject({ phase: 'finished', result: 'complete', health: 2, score: 100, decisionsMade: 2, levelsCompleted: 2, highestDifficultyCompleted: 70 });
        expect(finished.moveCounts).toEqual({ best: 0, good: 1, inaccuracy: 1, bad: 0 });
        expect(finished.outcomes.map(outcome => outcome.id)).toEqual(['easy', 'hard']);
        expect(nextLevel(finished)).toBe(finished);
    });

    it('ends immediately at zero health, clamps damage, and does not play an opponent reply', () => {
        const state = finishDecision(startRun([makeLevel('easy', 10), makeLevel('hard', 50)]), 'bad');
        const next = nextLevel(state);
        const finished = chooseQuality(next, 'bad');
        expect(finished).toMatchObject({ phase: 'finished', result: 'defeat', health: 0, decisionsMade: 2, levelsCompleted: 1, highestDifficultyReached: 50, highestDifficultyCompleted: 10 });
        expect(boardFen(finished)).toBe(finished.lastChoice!.fenAfterPlayerMove);
        expect(finished.history.at(-1)?.opponentReply).toBeNull();
        expect(advancePlayback(finished)).toBe(finished);
        expect(chooseQuality(finished, 'best')).toBe(finished);
    });

    it.each(['white', 'black'] as const)('classifies wins, draws and losses relative to the %s player', playerColor => {
        for (const result of ['white', 'black', 'draw'] as const) {
            const level = makeLevel('terminal', 20, 1, playerColor);
            const choice = decision(level).choices[0]!;
            choice.next = { kind: 'terminal', fen: choice.next.fen, decisionsTaken: 1, reason: result === 'draw' ? 'draw' : 'checkmate', result };
            const finished = finishDecision(startRun([level, makeLevel('next', 50)]));
            const completed = result === 'draw' || result === playerColor;
            expect(finished.phase).toBe('level-ended');
            expect(finished.levelsCompleted).toBe(Number(completed));
            expect(finished.outcomes[0]?.status).toBe(completed ? 'completed' : 'failed');
            expect(nextLevel(finished).levelIndex).toBe(1);
            expect(finished.health).toBe(3);
        }
    });

    it('handles a terminal player move without inventing an opponent reply', () => {
        const level = makeLevel();
        const choice = decision(level).choices[0]!;
        choice.opponentReply = null;
        choice.next = { kind: 'terminal', fen: choice.fenAfterPlayerMove, decisionsTaken: 1, reason: 'checkmate', result: 'white' };
        const selected = chooseQuality(startRun([level]), 'best');
        const finished = advancePlayback(selected);
        expect(finished).toMatchObject({ phase: 'finished', result: 'complete', levelsCompleted: 1, score: 100 });
        expect(boardFen(finished)).toBe(choice.fenAfterPlayerMove);
        expect(advancePlayback(finished)).toBe(finished);
    });

    it.each(['white', 'black'] as const)('credits unplayed decisions once when the %s player mates on move two of four', playerColor => {
        const level = makeLevel('early-mate', 20, 4, playerColor);
        const secondNode = decision(level).choices[0]!.next;
        if (secondNode.kind !== 'decision') throw new Error('Expected a second decision.');
        const matingChoice = secondNode.choices[0]!;
        matingChoice.opponentReply = null;
        matingChoice.next = { kind: 'terminal', fen: matingChoice.fenAfterPlayerMove,
            decisionsTaken: 2, reason: 'checkmate', result: playerColor };
        const first = finishDecision(startRun([level]));
        const selected = chooseQuality(first, 'best');
        expect(selected.score).toBe(200);
        const finished = advancePlayback(selected);
        expect(finished).toMatchObject({ phase: 'finished', result: 'complete', score: 400,
            decisionsMade: 2, bestMoveStreak: 2, lastHealthBonus: 0, health: 3, levelsCompleted: 1 });
        expect(finished.moveCounts).toEqual({ best: 2, good: 0, inaccuracy: 0, bad: 0 });
        expect(finished.history).toHaveLength(2);
        expect(advancePlayback(finished)).toBe(finished);
        expect(nextLevel(finished)).toBe(finished);
    });

    it('uses the configured floor depth and Best points, preserving the mate bonus across floor advancement', () => {
        const level = makeLevel('early-mate', 20, 3);
        const secondNode = decision(level).choices[0]!.next;
        if (secondNode.kind !== 'decision') throw new Error('Expected a second decision.');
        const matingChoice = secondNode.choices[1]!;
        matingChoice.opponentReply = null;
        matingChoice.next = { kind: 'terminal', fen: matingChoice.fenAfterPlayerMove,
            decisionsTaken: 2, reason: 'checkmate', result: 'white' };
        const rules = { ...DEFAULT_RULES, points: { ...DEFAULT_RULES.points, best: 80, good: 50 } };
        const first = finishDecision(startRun([level, makeLevel('next', 40)], rules));
        const ended = finishDecision(first, 'good');
        expect(ended).toMatchObject({ phase: 'level-ended', score: 210, decisionsMade: 2,
            bestMoveStreak: 0, health: 3, levelsCompleted: 1 });
        expect(ended.moveCounts).toEqual({ best: 1, good: 1, inaccuracy: 0, bad: 0 });
        expect(advancePlayback(ended)).toBe(ended);
        const next = nextLevel(ended);
        expect(next).toMatchObject({ phase: 'decision', levelIndex: 1, score: 210 });
        expect(nextLevel(next)).toBe(next);
    });

    it.each([
        ['draw', 'draw'], ['stalemate', 'draw'], ['checkmate', 'black'],
    ] as const)('does not award unplayed Best points for %s resulting in %s', (reason, result) => {
        const level = makeLevel('early-end', 20, 2);
        const choice = decision(level).choices[0]!;
        choice.opponentReply = null;
        choice.next = { kind: 'terminal', fen: choice.fenAfterPlayerMove, decisionsTaken: 1, reason, result };
        const finished = finishDecision(startRun([level]));
        expect(finished.score).toBe(100);
        expect(finished.decisionsMade).toBe(1);
    });

    it('does not award a mate bonus if the selected move exhausts health', () => {
        const level = makeLevel('early-mate', 20, 2);
        const choice = decision(level).choices[3]!;
        choice.opponentReply = null;
        choice.next = { kind: 'terminal', fen: choice.fenAfterPlayerMove,
            decisionsTaken: 1, reason: 'checkmate', result: 'white' };
        const finished = finishDecision(startRun([level], { ...DEFAULT_RULES, startingHealth: 1 }), 'bad');
        expect(finished).toMatchObject({ phase: 'finished', result: 'defeat', score: 0, levelsCompleted: 0 });
    });

    it('settles a level with no decisions and resets all stats in a new run', () => {
        const pool = [makeLevel('zero', 0, 0)];
        const finished = startRun(pool);
        expect(finished).toMatchObject({ phase: 'finished', result: 'complete', levelsCompleted: 1, decisionsMade: 0, score: 0 });
        const restart = startRun([makeLevel()]);
        expect(restart).toMatchObject({ phase: 'decision', decisionsMade: 0, levelsCompleted: 0, health: 3, score: 0, outcomes: [] });
    });

    it('supports configurable rules and snapshots them for the run', () => {
        const rules = structuredClone(DEFAULT_RULES);
        rules.startingHealth = 5;
        rules.damage.bad = 3;
        rules.points.bad = 10;
        const initial = startRun([makeLevel()], rules);
        rules.damage.bad = 5;
        const selected = chooseQuality(initial, 'bad');
        expect(selected).toMatchObject({ health: 2, score: 10 });
    });

    it('reports an empty pool and rejects invalid rules', () => {
        expect(() => startRun([makeLevel('unscored', -1)])).toThrow('No scored floors');
        expect(() => startRun([makeLevel()], { ...DEFAULT_RULES, startingHealth: 0 })).toThrow('Starting health');
        expect(() => startRun([makeLevel()], { ...DEFAULT_RULES, damage: { ...DEFAULT_RULES.damage, bad: -1 } })).toThrow('Damage and points');
    });

    it('shuffles displayed moves without changing choices or revealing quality through order', () => {
        const choices = decision(makeLevel()).choices;
        const shuffled = shuffleChoices(choices, () => 0);
        expect(shuffled.map(choice => choice.quality)).toEqual(['good', 'inaccuracy', 'bad', 'best']);
        expect(choices.map(choice => choice.quality)).toEqual(['best', 'good', 'inaccuracy', 'bad']);
        expect(new Set(shuffled)).toEqual(new Set(choices));
    });
});
