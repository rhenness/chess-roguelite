import type { Square } from 'chess.js';
import { PIECE_SETS, type PieceSetId } from './pieceSets';

export const MULTIPLIER_STORAGE_KEY = PIECE_SETS.default.storageKey;
export const PAYOUT_NOTICE_DURATION = 1500;
export const PAYOUT_HOPS = 24;
export const BOARD_SQUARES: Square[] = Array.from(
    { length: 64 },
    (_, index) =>
        `${'abcdefgh'[index % 8]}${Math.floor(index / 8) + 1}` as Square,
);

/** Multipliers are integer tenths: 10 means x1.0, 11 means x1.1. */
export type MultiplierBoard = Record<Square, number>;
export interface MultiplierProfile {
    version: 1;
    board: MultiplierBoard;
    lastUpgradeId: string | null;
    lastDailyUpgradeDay?: string;
    initialLayout?: 'gilded-sparse-v1' | 'gilded-center-v1';
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
const GILDED_LAYOUT = 'gilded-center-v1' as const;
const PREVIOUS_GILDED_BONUS_SQUARES: readonly Square[] = [
    'b2',
    'g2',
    'b7',
    'g7',
];
const checkerboardBonus = (index: number): boolean =>
    ((index % 8) + Math.floor(index / 8)) % 2 === 0;

export function initialMultiplierProfile(
    set: PieceSetId = 'default',
): MultiplierProfile {
    const definition = PIECE_SETS[set];
    const board = Object.fromEntries(
        BOARD_SQUARES.map((square, index) => {
            const boosted = definition.initialBonusSquares
                ? definition.initialBonusSquares.some(
                      (bonusSquare) => bonusSquare === square,
                  )
                : checkerboardBonus(index);
            return [square, boosted ? definition.initialMultiplier : 10];
        }),
    ) as MultiplierBoard;
    return {
        version: 1,
        board,
        lastUpgradeId: null,
        ...(set === 'gilded' ? { initialLayout: GILDED_LAYOUT } : {}),
    };
}

/** Replace earlier Gilded seeds while retaining every earned +0.1 upgrade. */
export function migrateMultiplierProfile(
    profile: MultiplierProfile,
    set: PieceSetId,
): MultiplierProfile {
    if (set !== 'gilded' || profile.initialLayout === GILDED_LAYOUT)
        return profile;
    const initial = initialMultiplierProfile('gilded');
    const board = Object.fromEntries(
        BOARD_SQUARES.map((square, index) => {
            const previousInitial =
                profile.initialLayout === 'gilded-sparse-v1'
                    ? PREVIOUS_GILDED_BONUS_SQUARES.includes(square)
                        ? 15
                        : 10
                    : checkerboardBonus(index)
                      ? 11
                      : 10;
            const earned = Math.max(0, profile.board[square] - previousInitial);
            return [square, initial.board[square] + earned];
        }),
    ) as MultiplierBoard;
    const migrated: MultiplierProfile = {
        ...profile,
        board,
        initialLayout: GILDED_LAYOUT,
    };
    saveMultiplierProfile(migrated, 'gilded');
    return migrated;
}

export function loadMultiplierProfile(
    set: PieceSetId = 'default',
): MultiplierProfile {
    try {
        const source = window.localStorage.getItem(PIECE_SETS[set].storageKey);
        if (source) {
            const profile = JSON.parse(source) as MultiplierProfile;
            if (
                profile.version === 1 &&
                profile.board &&
                BOARD_SQUARES.every(
                    (square) =>
                        Number.isSafeInteger(profile.board[square]) &&
                        profile.board[square] >= 10,
                ) &&
                (profile.lastUpgradeId === null ||
                    typeof profile.lastUpgradeId === 'string')
            ) {
                return migrateMultiplierProfile(profile, set);
            }
        }
    } catch {
        /* Keep the game playable if storage is unavailable or its data is invalid. */
    }
    return initialMultiplierProfile(set);
}

export function saveMultiplierProfile(
    profile: MultiplierProfile,
    set: PieceSetId = 'default',
): void {
    try {
        window.localStorage.setItem(
            PIECE_SETS[set].storageKey,
            JSON.stringify(profile),
        );
    } catch {
        /* The current session still keeps its upgrades in memory. */
    }
}

export const formatMultiplier = (tenths: number): string =>
    `${(tenths / 10).toFixed(1)}x`;
const pickSquare = (random: () => number): Square =>
    BOARD_SQUARES[Math.floor(random() * BOARD_SQUARES.length)]!;

/** Choose once from the pre-upgrade board; visual hopping never changes the outcome. */
export function createPayout(
    board: MultiplierBoard,
    baseScore: number,
    earnsUpgrade: boolean,
    random = Math.random,
): PayoutResult {
    if (!Number.isSafeInteger(baseScore) || baseScore < 0)
        throw new Error('Payout score must be a nonnegative safe integer.');
    const square = pickSquare(random);
    const multiplier = board[square];
    const upgradeSquare = earnsUpgrade ? pickSquare(random) : null;
    return {
        id: `payout-${Date.now()}-${++nextPayoutId}`,
        square,
        multiplier,
        baseScore,
        finalScore: Math.round((baseScore * multiplier) / 10),
        upgrade: upgradeSquare
            ? {
                  square: upgradeSquare,
                  before: board[upgradeSquare],
                  after: board[upgradeSquare] + 1,
              }
            : null,
    };
}

export function applyPayoutUpgrade(
    profile: MultiplierProfile,
    payout: PayoutResult,
    dailyDay?: string,
): MultiplierProfile {
    if (!payout.upgrade || profile.lastUpgradeId === payout.id) return profile;
    if (dailyDay && typeof profile.lastDailyUpgradeDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(profile.lastDailyUpgradeDay)
        && profile.lastDailyUpgradeDay >= dailyDay) return profile;
    return {
        ...profile,
        version: 1,
        lastUpgradeId: payout.id,
        ...(dailyDay ? { lastDailyUpgradeDay: dailyDay } : {}),
        board: {
            ...profile.board,
            [payout.upgrade.square]: profile.board[payout.upgrade.square] + 1,
        },
    };
}

export function payoutPath(
    landingSquare: Square,
    random = Math.random,
): Square[] {
    const path: Square[] = [];
    for (let index = 0; index < PAYOUT_HOPS - 1; index++) {
        const candidates = BOARD_SQUARES.filter(
            (square) =>
                square !== path.at(-1) &&
                (index !== PAYOUT_HOPS - 2 || square !== landingSquare),
        );
        path.push(candidates[Math.floor(random() * candidates.length)]!);
    }
    return [...path, landingSquare];
}

export const payoutHopDelay = (step: number): number =>
    45 + Math.round(230 * (step / (PAYOUT_HOPS - 1)) ** 3);
