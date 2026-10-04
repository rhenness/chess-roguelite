import { afterEach, describe, expect, it } from 'vitest';
import { PIECE_SET_IDS, PIECE_SETS } from './pieceSets';
import {
    applyPayoutUpgrade, BOARD_SQUARES, createPayout, initialMultiplierProfile,
    loadMultiplierProfile, MULTIPLIER_STORAGE_KEY, payoutPath, saveMultiplierProfile,
} from './multipliers';

afterEach(() => {
    PIECE_SET_IDS.forEach(id => window.localStorage.removeItem(PIECE_SETS[id].storageKey));
});

describe('persistent square multipliers', () => {
    it('starts Gilded with four x1.5 squares in the center and pays that multiplier', () => {
        const profile = initialMultiplierProfile('gilded');
        expect(BOARD_SQUARES.filter(square => profile.board[square] === 15)).toEqual(['d4', 'e4', 'd5', 'e5']);
        expect(Object.values(profile.board).filter(value => value === 10)).toHaveLength(60);
        const payout = createPayout(profile.board, 100, true, () => BOARD_SQUARES.indexOf('d4') / 64);
        expect(payout).toMatchObject({ square: 'd4', multiplier: 15, finalScore: 150 });
        expect(createPayout(profile.board, 100, false, () => 0)).toMatchObject({ square: 'a1', finalScore: 100 });
        const upgraded = applyPayoutUpgrade(profile, payout);
        expect(upgraded.board.d4).toBe(16);
        expect(upgraded.initialLayout).toBe(profile.initialLayout);
        saveMultiplierProfile(upgraded, 'gilded');
        expect(loadMultiplierProfile('gilded')).toEqual(upgraded);
        expect(loadMultiplierProfile()).toEqual(initialMultiplierProfile());
    });

    it.each(['checkerboard', 'corners'] as const)('migrates the old Gilded %s once and preserves earned upgrades', layout => {
        const defaultProfile = initialMultiplierProfile();
        saveMultiplierProfile(defaultProfile);
        const previous = initialMultiplierProfile();
        if (layout === 'corners') {
            previous.initialLayout = 'gilded-sparse-v1';
            for (const square of BOARD_SQUARES) previous.board[square] = ['b2', 'g2', 'b7', 'g7'].includes(square) ? 15 : 10;
        }
        previous.board.d4 += 2;
        previous.board.e4 += 1;
        previous.board.c3 += 3;
        previous.lastUpgradeId = 'earned-before-layout-change';
        saveMultiplierProfile(previous, 'gilded');
        const migrated = loadMultiplierProfile('gilded');
        expect(migrated.board.d4).toBe(17);
        expect(migrated.board.e4).toBe(16);
        expect(migrated.board.d5).toBe(15);
        expect(migrated.board.e5).toBe(15);
        expect(migrated.board.c3).toBe(13);
        expect(migrated.board.b2).toBe(10);
        expect(migrated.board.g7).toBe(10);
        expect(migrated.lastUpgradeId).toBe(previous.lastUpgradeId);
        expect(Object.values(migrated.board).reduce((sum, value) => sum + value, 0)).toBe(666);
        expect(loadMultiplierProfile('gilded')).toEqual(migrated);
        expect(loadMultiplierProfile()).toEqual(defaultProfile);
    });

    it('starts Obsidian at x1.0/x1.3 and saves each set independently without losing existing default upgrades', () => {
        const original = initialMultiplierProfile();
        const upgradedDefault = applyPayoutUpgrade(original, createPayout(original.board, 100, true, () => 0));
        saveMultiplierProfile(upgradedDefault);
        const obsidian = initialMultiplierProfile('obsidian');
        expect(Object.values(obsidian.board).filter(value => value === 13)).toHaveLength(32);
        expect(Object.values(obsidian.board).filter(value => value === 10)).toHaveLength(32);
        expect(loadMultiplierProfile('obsidian')).toEqual(obsidian);
        const upgradedObsidian = applyPayoutUpgrade(obsidian, createPayout(obsidian.board, 100, true, () => 0));
        saveMultiplierProfile(upgradedObsidian, 'obsidian');
        expect(loadMultiplierProfile('obsidian').board.a1).toBe(14);
        expect(loadMultiplierProfile()).toEqual(upgradedDefault);
        window.localStorage.setItem(PIECE_SETS.obsidian.storageKey, '{invalid');
        expect(loadMultiplierProfile('obsidian')).toEqual(obsidian);
        expect(loadMultiplierProfile()).toEqual(upgradedDefault);
    });

    it('starts with alternating x1.0 and x1.1 on all 64 squares', () => {
        const { board } = initialMultiplierProfile();
        expect(Object.keys(board)).toHaveLength(64);
        expect(Object.values(board).filter(value => value === 11)).toHaveLength(32);
        expect(Object.values(board).filter(value => value === 10)).toHaveLength(32);
        expect(board.a1).toBe(11);
        expect(board.b1).toBe(10);
        expect(board.a2).toBe(10);
        expect(board.b2).toBe(11);
    });

    it('pays the old multiplier and awards exactly one persistent upgrade, including when both squares match', () => {
        const profile = initialMultiplierProfile();
        const result = createPayout(profile.board, 123, true, () => 0);
        expect(result).toMatchObject({ square: 'a1', multiplier: 11, finalScore: 135,
            upgrade: { square: 'a1', before: 11, after: 12 } });
        const upgraded = applyPayoutUpgrade(profile, result);
        expect(upgraded.board.a1).toBe(12);
        expect(profile.board.a1).toBe(11);
        expect(BOARD_SQUARES.filter(square => upgraded.board[square] !== profile.board[square])).toEqual(['a1']);
        expect(applyPayoutUpgrade(upgraded, result)).toBe(upgraded);
        saveMultiplierProfile(upgraded);
        expect(loadMultiplierProfile()).toEqual(upgraded);
    });

    it('still gives a payout without an upgrade, and safely recovers from invalid saved data', () => {
        const profile = initialMultiplierProfile();
        const payout = createPayout(profile.board, 100, false, () => 0.02);
        expect(payout).toMatchObject({ square: 'b1', multiplier: 10, finalScore: 100, upgrade: null });
        expect(applyPayoutUpgrade(profile, payout)).toBe(profile);
        window.localStorage.setItem(MULTIPLIER_STORAGE_KEY, JSON.stringify({ version: 1, board: { a1: 999 } }));
        expect(loadMultiplierProfile()).toEqual(profile);
        window.localStorage.setItem(MULTIPLIER_STORAGE_KEY, '{bad JSON');
        expect(loadMultiplierProfile()).toEqual(profile);
    });

    it('ends the animation path on its predetermined square without consecutive repeated highlights', () => {
        const path = payoutPath('a1', () => 0);
        expect(path).toHaveLength(24);
        expect(path.at(-1)).toBe('a1');
        expect(path.every((square, index) => BOARD_SQUARES.includes(square) && square !== path[index - 1])).toBe(true);
    });
});
