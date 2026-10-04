import type { Square } from 'chess.js';
import { BOARD_SQUARES, type MultiplierBoard, type SquareUpgrade } from './multipliers';
import { PIECE_SET_IDS, PIECE_SETS, type PieceSetId } from './pieceSets';
import type { UserProgression } from './progression';
import type { RunState } from './run';
import { DAILY_COIN_MULTIPLIER } from './daily';

export const COIN_SCORE_STEP = 25;
export const RUN_COMPLETION_COINS = 20;
export const SQUARE_UPGRADE_BASE_COST = 30;
export const SQUARE_UPGRADE_COST_STEP = 10;

/** Paid increments sit alongside the existing free-upgrade boards. */
export type PaidUpgradeCounts = Partial<Record<PieceSetId, Partial<Record<Square, number>>>>;

export function isPaidUpgradeCounts(value: unknown): value is PaidUpgradeCounts {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.entries(value).every(([set, counts]) => PIECE_SET_IDS.includes(set as PieceSetId)
        && counts && typeof counts === 'object' && !Array.isArray(counts)
        && Object.entries(counts).every(([square, count]) => BOARD_SQUARES.includes(square as Square)
            && typeof count === 'number' && Number.isSafeInteger(count) && count >= 0));
}

export function normalRunCoinReward(run: RunState): number {
    if (run.phase !== 'finished' || !run.result) return 0;
    const completed = run.result === 'complete' && run.levelsCompleted === run.levels.length;
    return Math.min(Number.MAX_SAFE_INTEGER,
        Math.floor(run.score / COIN_SCORE_STEP) + (completed ? RUN_COMPLETION_COINS : 0));
}

export function applyPaidUpgrades(board: MultiplierBoard, counts: Partial<Record<Square, number>> = {}): MultiplierBoard {
    return Object.fromEntries(BOARD_SQUARES.map(square => [square,
        Math.min(Number.MAX_SAFE_INTEGER, board[square] + (counts[square] ?? 0)),
    ])) as MultiplierBoard;
}

export function runCoinReward(run: RunState): number {
    return Math.min(Number.MAX_SAFE_INTEGER, normalRunCoinReward(run) * (run.daily ? DAILY_COIN_MULTIPLIER : 1));
}

export const squareUpgradePrice = (counts: Partial<Record<Square, number>> | undefined, square: Square): number =>
    Math.min(Number.MAX_SAFE_INTEGER, SQUARE_UPGRADE_BASE_COST + (counts?.[square] ?? 0) * SQUARE_UPGRADE_COST_STEP);

/** A wallet debit and its upgrade form one immutable, persistable transaction. */
export function purchaseMultiplierUpgrade(profile: UserProgression, set: PieceSetId, square: Square, baseBoard: MultiplierBoard): {
    profile: UserProgression; upgrade: SquareUpgrade; cost: number;
} | null {
    if (profile.finishedRuns < PIECE_SETS[set].unlockAfterRuns || !BOARD_SQUARES.includes(square)) return null;
    const counts = profile.paidUpgrades[set];
    const cost = squareUpgradePrice(counts, square);
    const before = baseBoard[square] + (counts?.[square] ?? 0);
    if (profile.coins < cost || before >= Number.MAX_SAFE_INTEGER) return null;
    return {
        profile: {
            ...profile, coins: profile.coins - cost,
            paidUpgrades: { ...profile.paidUpgrades, [set]: { ...counts, [square]: (counts?.[square] ?? 0) + 1 } },
        },
        upgrade: { square, before, after: before + 1 }, cost,
    };
}
