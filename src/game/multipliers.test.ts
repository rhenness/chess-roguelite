import { afterEach, describe, expect, it } from 'vitest';
import {
    applyPayoutUpgrade, BOARD_SQUARES, createPayout, initialMultiplierProfile,
    loadMultiplierProfile, MULTIPLIER_STORAGE_KEY, payoutPath, saveMultiplierProfile,
} from './multipliers';

afterEach(() => window.localStorage.removeItem(MULTIPLIER_STORAGE_KEY));

describe('persistent square multipliers', () => {
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
