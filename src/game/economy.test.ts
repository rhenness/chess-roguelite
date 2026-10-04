import { afterEach, describe, expect, it } from 'vitest';
import { decision, makeLevel } from '../test/levels';
import { advancePlayback, chooseMove, DEFAULT_RULES, startRun } from './run';
import { initialUserProgression, loadUserProgression, PROGRESSION_STORAGE_KEY, recordFinishedRun, saveUserProgression } from './progression';
import { applyPaidUpgrades, purchaseMultiplierUpgrade, runCoinReward, squareUpgradePrice } from './economy';
import { applyPayoutUpgrade, createPayout, initialMultiplierProfile } from './multipliers';

afterEach(() => { window.localStorage.removeItem(PROGRESSION_STORAGE_KEY); });

describe('coins and paid square upgrades', () => {
    it('multiplies the whole normal coin reward by five for daily runs, including completion', () => {
        const level = makeLevel();
        const completed = advancePlayback(advancePlayback(chooseMove(startRun([level]), decision(level).choices[0]!.playerMove.uci)));
        const daily = { ...completed, daily: { day: '2026-10-04', expiresAt: Date.parse('2026-10-05T00:00:00Z') } };
        expect(runCoinReward(completed)).toBe(24);
        expect(runCoinReward(daily)).toBe(120);
        expect(runCoinReward({ ...daily, result: 'defeat', score: 74, levelsCompleted: 0 })).toBe(10);
        expect(runCoinReward({ ...daily, phase: 'decision', result: null })).toBe(0);
    });
    it('earns coins once from base score and adds the completion bonus only for successful runs', () => {
        const level = makeLevel();
        const run = startRun([level]);
        const reveal = chooseMove(run, decision(level).choices[0]!.playerMove.uci);
        expect(runCoinReward(run)).toBe(0);
        expect(runCoinReward(reveal)).toBe(0);
        const complete = advancePlayback(advancePlayback(reveal));
        expect(runCoinReward(complete)).toBe(24);
        const initial = { ...initialUserProgression(), coins: 30, paidUpgrades: { default: { a1: 1 } } };
        const saved = recordFinishedRun(initial, complete);
        expect(saved.coins).toBe(54);
        expect(saved.paidUpgrades).toEqual(initial.paidUpgrades);
        expect(recordFinishedRun(saved, complete)).toBe(saved);
        // A larger score payout never becomes a larger coin reward.
        expect(createPayout({ ...initialMultiplierProfile().board, a1: 50 }, complete.score, false, () => 0).finalScore).toBe(500);
        expect(runCoinReward(complete)).toBe(24);
        expect(runCoinReward({ ...complete, levelsCompleted: 0 })).toBe(4);
        const defeat = chooseMove(startRun([level], { ...DEFAULT_RULES, startingHealth: 1 }), decision(level).choices[3]!.playerMove.uci);
        expect(runCoinReward({ ...defeat, score: 74 })).toBe(2);
        expect(runCoinReward(defeat)).toBe(0);
    });

    it('debits coins and records exactly one selected increment together, with a higher repeat price', () => {
        const base = initialMultiplierProfile().board;
        const initial = { ...initialUserProgression(), coins: 80 };
        const first = purchaseMultiplierUpgrade(initial, 'default', 'a1', base)!;
        expect(first.upgrade).toEqual({ square: 'a1', before: 11, after: 12 });
        expect(first.profile.coins).toBe(50);
        expect(first.profile.paidUpgrades).toEqual({ default: { a1: 1 } });
        expect(initial.coins).toBe(80);
        expect(base.a1).toBe(11);
        expect(squareUpgradePrice(first.profile.paidUpgrades.default, 'a1')).toBe(40);
        expect(squareUpgradePrice(first.profile.paidUpgrades.default, 'b1')).toBe(30);
        const second = purchaseMultiplierUpgrade(first.profile, 'default', 'a1', base)!;
        expect(second.profile.coins).toBe(10);
        expect(second.upgrade.after).toBe(13);
        expect(purchaseMultiplierUpgrade(second.profile, 'default', 'a1', base)).toBeNull();
        saveUserProgression(second.profile);
        expect(loadUserProgression()).toEqual(second.profile);
        expect(applyPaidUpgrades(base, loadUserProgression().paidUpgrades.default).a1).toBe(13);
    });

    it('blocks locked sets and keeps paid upgrades separate despite sharing a wallet', () => {
        const initial = { ...initialUserProgression(), coins: 90 };
        const obsidian = initialMultiplierProfile('obsidian');
        expect(purchaseMultiplierUpgrade(initial, 'obsidian', 'a1', obsidian.board)).toBeNull();
        const first = purchaseMultiplierUpgrade({ ...initial, finishedRuns: 8 }, 'obsidian', 'a1', obsidian.board)!;
        const gilded = initialMultiplierProfile('gilded');
        const second = purchaseMultiplierUpgrade(first.profile, 'gilded', 'd4', gilded.board)!;
        expect(second.profile.coins).toBe(30);
        expect(second.profile.paidUpgrades).toEqual({ obsidian: { a1: 1 }, gilded: { d4: 1 } });
        expect(applyPaidUpgrades(obsidian.board, second.profile.paidUpgrades.obsidian).a1).toBe(14);
        expect(applyPaidUpgrades(gilded.board, second.profile.paidUpgrades.gilded).d4).toBe(16);
        expect(applyPaidUpgrades(initialMultiplierProfile().board, second.profile.paidUpgrades.default).a1).toBe(11);
    });

    it('combines paid increments and free upgrades without counting either twice', () => {
        const free = initialMultiplierProfile();
        const counts = { a1: 2 };
        const board = applyPaidUpgrades(free.board, counts);
        const payout = createPayout(board, 100, true, () => 0);
        expect(payout).toMatchObject({ multiplier: 13, finalScore: 130, upgrade: { before: 13, after: 14 } });
        const upgradedFree = applyPayoutUpgrade(free, payout);
        expect(upgradedFree.board.a1).toBe(12);
        expect(applyPaidUpgrades(upgradedFree.board, counts).a1).toBe(14);
        expect(applyPayoutUpgrade(upgradedFree, payout)).toBe(upgradedFree);
        // Free upgrades and the set's starting bonus do not increase paid prices.
        expect(squareUpgradePrice(counts, 'a1')).toBe(50);
        expect(squareUpgradePrice(undefined, 'd4')).toBe(30);
    });
});
