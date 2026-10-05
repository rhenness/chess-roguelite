import { describe, expect, it } from 'vitest';
import { makeLevel } from '../test/levels';
import { createCheckpointRewards } from './checkpointRewards';
import { activateItem, DAILY_ITEMS } from './items';
import { advancePlayback, chooseCheckpointItem, chooseMove, DEFAULT_RULES, nextLevel, startRun, type RunState } from './run';
import { checkpointRun, restoreRunCheckpoint } from './runCheckpoint';
import { createDailyDungeon, enterDailyDungeon, recordDailyRun, restoreDailyRun } from './daily';
import { initialMultiplierProfile } from './multipliers';
import { loadRegularRun, saveRegularRun } from './regular';

const pool = Array.from({ length: 10 }, (_, index) => makeLevel(`reward-${index}`, index));
const finishRound = (run: RunState) => {
    if (run.node.kind !== 'decision') throw new Error('Expected a decision');
    return advancePlayback(advancePlayback(chooseMove(run, run.node.choices[0]!.playerMove.uci)));
};
const firstCheckpoint = (run: RunState) => nextLevel(finishRound(nextLevel(finishRound(nextLevel(finishRound(run))))));
const offers = (run: RunState) => run.checkpointRewards.find(reward => reward.afterRound === run.levelIndex + 1)!.offers;

describe('checkpoint rewards', () => {
    it('draws two distinct items after 3 and 6, only when another round remains', () => {
        for (const random of [() => 0, () => 0.999]) {
            const rewards = createCheckpointRewards(10, random);
            expect(rewards.map(reward => reward.afterRound)).toEqual([3, 6]);
            rewards.forEach(reward => expect(new Set(reward.offers).size).toBe(2));
            expect(createCheckpointRewards(3, random)).toEqual([]);
            expect(createCheckpointRewards(6, random).map(reward => reward.afterRound)).toEqual([3]);
        }
    });

    it('blocks play until a choice, adds one charge beyond the entry limit, and cannot claim twice', () => {
        const checkpoint = firstCheckpoint(startRun(pool, DEFAULT_RULES, () => 0, { 'triple-crown': 3 }));
        expect(checkpoint).toMatchObject({ phase: 'checkpoint', levelIndex: 2, score: 300, health: 3, bestMoveStreak: 3 });
        expect(nextLevel(checkpoint)).toBe(checkpoint);
        expect(advancePlayback(checkpoint)).toBe(checkpoint);
        expect(chooseMove(checkpoint, 'a2a3')).toBe(checkpoint);
        expect(activateItem(checkpoint, 'triple-crown')).toBe(checkpoint);
        expect(chooseCheckpointItem(checkpoint, 'healing-potion')).toBe(checkpoint);
        const next = chooseCheckpointItem(checkpoint, 'triple-crown');
        expect(next).toMatchObject({ phase: 'decision', levelIndex: 3, items: { 'triple-crown': 4 },
            score: 300, health: 3, bestMoveStreak: 3, decisionsMade: 3, activeEffects: [] });
        expect(chooseCheckpointItem(next, 'triple-crown')).toBe(next);
    });

    it('does not heal or spend effect duration at a checkpoint', () => {
        let run = startRun(pool, DEFAULT_RULES, () => 0.999, { 'triple-crown': 1 });
        run = nextLevel(finishRound(nextLevel(finishRound(run))));
        run = activateItem(run, 'triple-crown');
        const checkpoint = nextLevel(finishRound(run));
        const next = chooseCheckpointItem(checkpoint, 'healing-potion');
        expect(next.health).toBe(checkpoint.health);
        expect(next.items['healing-potion']).toBe(1);
        expect(next.activeEffects).toEqual(checkpoint.activeEffects);
        expect(next.activeEffects[0]?.remainingMoves).toBe(2);
    });

    it('offers exactly two checkpoints across all ten rounds and clears supplies at completion', () => {
        let run = startRun(pool);
        const checkpoints: number[] = [];
        for (let round = 1; round <= 10; round++) {
            run = finishRound(run);
            if (round === 10) break;
            run = nextLevel(run);
            if (run.phase === 'checkpoint') {
                checkpoints.push(round);
                run = chooseCheckpointItem(run, offers(run)[0]);
            }
        }
        expect(checkpoints).toEqual([3, 6]);
        expect(run).toMatchObject({ phase: 'finished', result: 'complete', items: {}, score: 1000, levelsCompleted: 10 });
    });

    it('does not offer a checkpoint on lethal defeat', () => {
        let run = nextLevel(finishRound(nextLevel(finishRound(startRun(pool)))));
        const bad = run.node.kind === 'decision' && run.node.choices.find(choice => choice.quality === 'bad')!;
        if (!bad) throw new Error('Expected bad move');
        run = chooseMove({ ...run, health: 1 }, bad.playerMove.uci);
        expect(nextLevel(run)).toBe(run);
        expect(run.phase).toBe('finished');
        expect(chooseCheckpointItem(run, 'triple-crown')).toBe(run);
    });

    it('restores a pending reward and a confirmed reward before any next-round move', () => {
        const pending = firstCheckpoint(startRun(pool, DEFAULT_RULES, () => 0, DAILY_ITEMS));
        const claimed = chooseCheckpointItem(pending, offers(pending)[0]);
        for (const run of [pending, claimed, activateItem(claimed, 'triple-crown')]) {
            const saved = checkpointRun(run);
            expect(restoreRunCheckpoint(pool, DEFAULT_RULES, DAILY_ITEMS, saved)).toEqual({ ...run, id: expect.any(String) });
            saveRegularRun({ run, set: 'default', initialItems: DAILY_ITEMS });
            expect(loadRegularRun(pool)?.run).toEqual(run);
        }
    });

    it('replays all five activations, including rewards used at both checkpoint boundaries', () => {
        let run = startRun(pool, DEFAULT_RULES, () => 0, { 'healing-potion': 3 });
        for (let count = 0; count < 3; count++) run = activateItem(run, 'healing-potion');
        run = firstCheckpoint(run);
        run = activateItem(chooseCheckpointItem(run, 'triple-crown'), 'triple-crown');
        run = firstCheckpoint(run);
        run = activateItem(chooseCheckpointItem(run, 'kings-guard'), 'kings-guard');
        expect(run.itemUses).toHaveLength(5);
        for (const state of [run, chooseMove(run, run.node.kind === 'decision' ? run.node.choices[0]!.playerMove.uci : '')]) {
            expect(restoreRunCheckpoint(pool, DEFAULT_RULES, { 'healing-potion': 3 }, checkpointRun(state)))
                .toEqual({ ...state, id: expect.any(String) });
        }
    });

    it('rejects duplicate offers, unoffered selections, future claims, and missing claims', () => {
        const run = firstCheckpoint(startRun(pool, DEFAULT_RULES, () => 0));
        const saved = checkpointRun(run);
        const invalidRewards = [
            [{ afterRound: 3, offers: ['triple-crown', 'triple-crown'], selected: null }, saved.checkpointRewards![1]!],
            saved.checkpointRewards!.map(reward => ({ ...reward, selected: 'healing-potion' })),
            saved.checkpointRewards!.map(reward => ({ ...reward, selected: reward.offers[0] })),
        ];
        for (const checkpointRewards of invalidRewards) {
            expect(() => restoreRunCheckpoint(pool, DEFAULT_RULES, {}, { ...saved,
                checkpointRewards: checkpointRewards as typeof saved.checkpointRewards })).toThrow();
        }
        const claimed = checkpointRun(chooseCheckpointItem(run, 'triple-crown'));
        claimed.checkpointRewards![0]!.selected = null;
        expect(() => restoreRunCheckpoint(pool, DEFAULT_RULES, {}, claimed)).toThrow();
    });

    it('preserves legacy runs without introducing checkpoints', () => {
        let run = startRun(pool, DEFAULT_RULES, Math.random, {}, []);
        for (let round = 0; round < 4; round++) run = nextLevel(finishRound(run));
        const saved = checkpointRun(run);
        delete saved.checkpointRewards;
        const restored = restoreRunCheckpoint(pool, DEFAULT_RULES, {}, saved);
        expect(restored).toEqual({ ...run, id: expect.any(String) });
        expect(restored.checkpointRewards).toEqual([]);
    });

    it('shares date-seeded dungeon offers and resumes both pending and claimed choices', () => {
        const now = Date.parse('2026-10-05T12:00:00Z');
        const dungeon = createDailyDungeon(pool, now);
        const first = enterDailyDungeon(dungeon, 'default', DEFAULT_RULES, initialMultiplierProfile().board, now);
        const second = enterDailyDungeon(dungeon, 'obsidian', { ...DEFAULT_RULES, startingHealth: 2 }, initialMultiplierProfile().board, now);
        expect(first.run.checkpointRewards).toEqual(second.run.checkpointRewards);
        const pending = firstCheckpoint(first.run);
        for (const run of [pending, chooseCheckpointItem(pending, offers(pending)[0])]) {
            expect(restoreDailyRun(recordDailyRun(first.dungeon, run, now))).toEqual(run);
        }
        const corrupted = recordDailyRun(first.dungeon, pending, now);
        corrupted.attempt!.checkpoint.checkpointRewards![0]!.offers.reverse();
        expect(() => restoreDailyRun(corrupted)).toThrow('Invalid daily reward offers');
    });
});
