import { afterEach, describe, expect, it } from 'vitest';
import { continueToNextRound, decision, makeLevel } from '../test/levels';
import { activateItem, DAILY_ITEMS, isItemInventory, type ItemInventory } from './items';
import { advancePlayback, chooseMove, DEFAULT_RULES, startRun, type RunState } from './run';
import { purchaseLoadout, runCoinReward } from './economy';
import { initialUserProgression, loadUserProgression, saveUserProgression } from './progression';
import { createDailyDungeon, enterDailyDungeon, initialDailyArchive, loadDailyArchive, recordDailyRun, restoreDailyRun, saveDailyArchive, storeDailyDungeon } from './daily';
import { initialMultiplierProfile } from './multipliers';

afterEach(() => window.localStorage.clear());
const play = (run: RunState, quality = 'best') => {
    if (run.node.kind !== 'decision') throw new Error('Expected a decision');
    return chooseMove(run, run.node.choices.find(choice => choice.quality === quality)!.playerMove.uci);
};
const settle = (run: RunState) => advancePlayback(advancePlayback(run));
const begin = (items: ItemInventory = DAILY_ITEMS) => startRun([makeLevel('items', 10, 4)], DEFAULT_RULES, Math.random, items);

describe('run consumables', () => {
    it('blocks a lethal hit before defeat while preserving the real quality and breaking a streak', () => {
        const run = activateItem({ ...begin(), health: 1, bestMoveStreak: 3 }, 'kings-guard');
        const next = play(run, 'bad');
        expect(next).toMatchObject({ health: 1, phase: 'reveal', result: null, bestMoveStreak: 0, moveCounts: { bad: 1 } });
        expect(next.lastMoveResolution).toMatchObject({ incomingDamage: 2, damageTaken: 0, damagePrevented: 2, shieldSpent: true });
        expect(next.activeEffects).toEqual([]);
        expect(next.items['kings-guard']).toBe(0);
    });
    it('spends a shield on a safe move and still allows the streak health reward', () => {
        const next = play(activateItem({ ...begin(), bestMoveStreak: 3 }, 'kings-guard'));
        expect(next.health).toBe(4);
        expect(next.lastMoveResolution).toMatchObject({ damagePrevented: 0, healthBonus: 1, shieldSpent: true });
        expect(next.activeEffects).toEqual([]);
    });
    it('boosts exactly three decisions across floors without spending charges during playback', () => {
        let run = activateItem(startRun(Array.from({ length: 4 }, (_, i) => makeLevel(`floor-${i}`, i)), DEFAULT_RULES, Math.random,
            { 'triple-crown': 1 }), 'triple-crown');
        for (let i = 0; i < 4; i++) {
            const selected = play(run);
            expect(selected.lastMoveResolution?.awardedPoints).toBe(i < 3 ? 300 : 100);
            expect(chooseMove(selected, 'invalid')).toBe(selected);
            run = settle(selected);
            expect(run.activeEffects).toEqual(selected.activeEffects);
            if (i < 3) run = continueToNextRound(run);
        }
        expect(run.score).toBe(1000);
        expect(run.itemBonusPoints).toBe(600);
        expect(runCoinReward(run)).toBe(36);
    });
    it('combines crown and shield, preventing damage while boosting Inaccuracy points', () => {
        const next = play(activateItem(activateItem(begin(), 'triple-crown'), 'kings-guard'), 'inaccuracy');
        expect(next).toMatchObject({ health: 3, score: 75, itemBonusPoints: 50 });
        expect(next.activeEffects).toHaveLength(1);
        expect(next.activeEffects[0]?.remainingMoves).toBe(2);
    });
    it('blocks repeated timed effects and activations outside a decision, without consuming copies', () => {
        const run = activateItem(begin({ 'triple-crown': 2 }), 'triple-crown');
        expect(activateItem(run, 'triple-crown')).toBe(run);
        expect(run.items['triple-crown']).toBe(1);
        const selected = play(run);
        expect(activateItem(selected, 'triple-crown')).toBe(selected);
        expect(activateItem(begin({}), 'healing-potion').health).toBe(3);
    });
    it('heals immediately without a cap and spends exactly one selected copy per activation', () => {
        const initial = { ...begin({ 'healing-potion': 2 }), health: 7 };
        const first = activateItem(initial, 'healing-potion');
        const second = activateItem(first, 'healing-potion');
        expect(first.health).toBe(8);
        expect(second.health).toBe(9);
        expect(second.items['healing-potion']).toBe(0);
        expect(activateItem(second, 'healing-potion')).toBe(second);
        expect(initial.items['healing-potion']).toBe(2);
    });
    it('does not boost checkmate bonus points for unplayed decisions', () => {
        const level = makeLevel('mate', 10, 4);
        const choice = decision(level).choices[0]!;
        choice.next = { kind: 'terminal', fen: choice.next.fen, decisionsTaken: 1, result: 'white', reason: 'checkmate' };
        const run = settle(play(activateItem(startRun([level], DEFAULT_RULES, Math.random, { 'triple-crown': 1 }), 'triple-crown')));
        expect(run.score).toBe(600);
        expect(run.itemBonusPoints).toBe(200);
        expect(run.activeEffects).toEqual([]);
        expect(run.lastMoveResolution?.expiredItems).toEqual([]);
        expect(runCoinReward(run)).toBe(36);
    });
    it('charges for the entire run loadout without storing items in permanent progression', () => {
        const initial = { ...initialUserProgression(), coins: 50, paidUpgrades: { default: { a1: 2 } } };
        const bought = purchaseLoadout(initial, { 'triple-crown': 1, 'healing-potion': 1 })!;
        expect(bought.coins).toBe(0);
        expect(purchaseLoadout(bought, { 'triple-crown': 1 })).toBeNull();
        saveUserProgression(bought);
        expect(loadUserProgression()).toEqual(bought);
        expect(bought.paidUpgrades).toEqual(initial.paidUpgrades);
        expect(bought).not.toHaveProperty('inventory');
        expect(purchaseLoadout(initial, {})).toBe(initial);
    });
    it('rejects malformed loadouts and purchases beyond three slots or the available wallet', () => {
        expect(isItemInventory({ unknown: 1 })).toBe(false);
        expect(isItemInventory({ 'healing-potion': -1 })).toBe(false);
        const profile = { ...initialUserProgression(), coins: 80 };
        expect(purchaseLoadout(profile, { 'healing-potion': -1 })).toBeNull();
        expect(purchaseLoadout(profile, { 'healing-potion': 4 })).toBeNull();
        expect(purchaseLoadout(profile, { 'triple-crown': 3 })).toBeNull();
        expect(() => begin({ 'healing-potion': 4 })).toThrow('Invalid item loadout');
    });
    it('discards unused items and active effects on defeat and completion', () => {
        const defeated = play(activateItem({ ...begin(), health: 1 }, 'triple-crown'), 'bad');
        expect(defeated).toMatchObject({ phase: 'finished', items: {}, activeEffects: [] });
        expect(activateItem(defeated, 'healing-potion')).toBe(defeated);
        const completed = settle(play(startRun([makeLevel()], DEFAULT_RULES, Math.random, DAILY_ITEMS)));
        expect(completed).toMatchObject({ phase: 'finished', items: {}, activeEffects: [] });
        expect(startRun([makeLevel()]).items).toEqual({});
    });
});

describe('daily item replay', () => {
    const now = Date.parse('2026-10-04T12:00:00Z');
    it('restores activations before and after moves, including unused charges at a decision', () => {
        const pool = [makeLevel('daily-items', 10, 4)];
        const entered = enterDailyDungeon(createDailyDungeon(pool, now), 'default', DEFAULT_RULES, initialMultiplierProfile().board, now);
        let run = activateItem(entered.run, 'triple-crown');
        run = settle(play(run));
        run = activateItem(run, 'kings-guard');
        run = activateItem(run, 'healing-potion');
        const dungeon = recordDailyRun(entered.dungeon, run, now);
        saveDailyArchive(storeDailyDungeon(initialDailyArchive(), dungeon));
        const restored = restoreDailyRun(loadDailyArchive(pool).days[dungeon.day]!)!;
        expect(restored).toMatchObject({ health: run.health, score: run.score, items: run.items,
            itemUses: run.itemUses, activeEffects: run.activeEffects, phase: 'decision', itemBonusPoints: run.itemBonusPoints });
        const blocked = play(restored, 'bad');
        expect(blocked.health).toBe(run.health);
        expect(blocked.lastMoveResolution?.damagePrevented).toBe(2);
    });
    it.each(['reveal', 'reply', 'finished'] as const)('restores item-modified %s checkpoints', phase => {
        const pool = [makeLevel('daily-phase', 10, 1)];
        const entered = enterDailyDungeon(createDailyDungeon(pool, now), 'default', DEFAULT_RULES, initialMultiplierProfile().board, now);
        let run = play(activateItem(entered.run, 'triple-crown'));
        if (phase !== 'reveal') run = advancePlayback(run);
        if (phase === 'finished') run = advancePlayback(run);
        // recordDailyRun settles final decisions immediately; exercise presentation phases directly as well.
        const dungeon = phase === 'finished' ? recordDailyRun(entered.dungeon, run, now) : {
            ...entered.dungeon, attempt: { ...entered.dungeon.attempt!, checkpoint: {
                moves: run.history.map(move => ({ levelId: move.levelId, uci: move.playerMove.uci })),
                itemUses: run.itemUses, levelIndex: run.levelIndex, phase: run.phase,
            } },
        };
        const restored = restoreDailyRun(dungeon)!;
        expect(restored.phase).toBe(phase);
        expect(restored.score).toBe(300);
        expect(restored.activeEffects).toEqual(run.activeEffects);
    });
    it('keeps legacy attempts item-free and rejects invalid activation ordering', () => {
        const pool = [makeLevel('legacy', 10, 3)];
        const entered = enterDailyDungeon(createDailyDungeon(pool, now), 'default', DEFAULT_RULES, initialMultiplierProfile().board, now);
        const legacy = { ...entered.dungeon, attempt: { ...entered.dungeon.attempt!, itemRulesVersion: undefined } };
        expect(restoreDailyRun(legacy)?.items).toEqual({});
        const invalid = { ...entered.dungeon, attempt: { ...entered.dungeon.attempt!, checkpoint: {
            ...entered.dungeon.attempt!.checkpoint, itemUses: [{ itemId: 'kings-guard' as const, beforeDecision: 5, levelIndex: 0 }],
        } } };
        expect(() => restoreDailyRun(invalid)).toThrow('Invalid saved item ordering');
    });
});
