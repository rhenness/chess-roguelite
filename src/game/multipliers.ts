import type { Square } from 'chess.js';

export const MULTIPLIER_STORAGE_KEY = 'knightfall.multipliers.v1';
export const PAYOUT_NOTICE_DURATION = 1500;
export const PAYOUT_HOPS = 24;
export const BOARD_SQUARES: Square[] = Array.from({ length: 64 }, (_, index) =>
    `${'abcdefgh'[index % 8]}${Math.floor(index / 8) + 1}` as Square);

/** Multipliers are integer tenths: 10 means x1.0, 11 means x1.1. */
export type MultiplierBoard = Record<Square, number>;
export interface MultiplierProfile {
    version: 1;
    board: MultiplierBoard;
    lastUpgradeId: string | null;
}
export interface SquareUpgrade {
    square: Square;
    before: number;
    after: number;
}
export interface PayoutResult {
    id: string;
    square: Square;
    multiplier: number;
    baseScore: number;
    finalScore: number;
    upgrade: SquareUpgrade | null;
}

let nextPayoutId = 0;

export function initialMultiplierProfile(): MultiplierProfile {
    const board = Object.fromEntries(BOARD_SQUARES.map((square, index) =>
        [square, (index % 8 + Math.floor(index / 8)) % 2 === 0 ? 11 : 10])) as MultiplierBoard;
    return { version: 1, board, lastUpgradeId: null };
}

export function loadMultiplierProfile(): MultiplierProfile {
    try {
        const source = window.localStorage.getItem(MULTIPLIER_STORAGE_KEY);
        if (source) {
            const profile = JSON.parse(source) as MultiplierProfile;
            if (profile.version === 1 && profile.board && BOARD_SQUARES.every(square =>
                Number.isSafeInteger(profile.board[square]) && profile.board[square] >= 10)
                && (profile.lastUpgradeId === null || typeof profile.lastUpgradeId === 'string')) return profile;
        }
    } catch { /* Keep the game playable if storage is unavailable or its data is invalid. */ }
    return initialMultiplierProfile();
}

export function saveMultiplierProfile(profile: MultiplierProfile): void {
    try { window.localStorage.setItem(MULTIPLIER_STORAGE_KEY, JSON.stringify(profile)); }
    catch { /* The current session still keeps its upgrades in memory. */ }
}

export const formatMultiplier = (tenths: number): string => `×${(tenths / 10).toFixed(1)}`;
const pickSquare = (random: () => number): Square => BOARD_SQUARES[Math.floor(random() * BOARD_SQUARES.length)]!;

/** Choose once from the pre-upgrade board; visual hopping never changes the outcome. */
export function createPayout(board: MultiplierBoard, baseScore: number, earnsUpgrade: boolean, random = Math.random): PayoutResult {
    if (!Number.isSafeInteger(baseScore) || baseScore < 0) throw new Error('Payout score must be a nonnegative safe integer.');
    const square = pickSquare(random);
    const multiplier = board[square];
    const upgradeSquare = earnsUpgrade ? pickSquare(random) : null;
    return {
        id: `payout-${Date.now()}-${++nextPayoutId}`,
        square, multiplier, baseScore, finalScore: Math.round(baseScore * multiplier / 10),
        upgrade: upgradeSquare ? { square: upgradeSquare, before: board[upgradeSquare], after: board[upgradeSquare] + 1 } : null,
    };
}

export function applyPayoutUpgrade(profile: MultiplierProfile, payout: PayoutResult): MultiplierProfile {
    if (!payout.upgrade || profile.lastUpgradeId === payout.id) return profile;
    return {
        version: 1, lastUpgradeId: payout.id,
        board: { ...profile.board, [payout.upgrade.square]: profile.board[payout.upgrade.square] + 1 },
    };
}

export function payoutPath(landingSquare: Square, random = Math.random): Square[] {
    const path: Square[] = [];
    for (let index = 0; index < PAYOUT_HOPS - 1; index++) {
        const candidates = BOARD_SQUARES.filter(square => square !== path.at(-1)
            && (index !== PAYOUT_HOPS - 2 || square !== landingSquare));
        path.push(candidates[Math.floor(random() * candidates.length)]!);
    }
    return [...path, landingSquare];
}

export const payoutHopDelay = (step: number): number => 45 + Math.round(230 * (step / (PAYOUT_HOPS - 1)) ** 3);
