export type PieceSetId = 'default' | 'obsidian' | 'gilded';

export const PIECE_SETS = {
    default: { name: 'Default', startingHealth: 3, initialMultiplier: 11, initialBonusSquares: null, unlockAfterRuns: 0, storageKey: 'knightfall.multipliers.v1' },
    obsidian: { name: 'Obsidian Order', startingHealth: 2, initialMultiplier: 13, initialBonusSquares: null, unlockAfterRuns: 3, storageKey: 'knightfall.multipliers.obsidian.v1' },
    gilded: { name: 'Gilded Court', startingHealth: 3, initialMultiplier: 15, initialBonusSquares: ['d4', 'e4', 'd5', 'e5'], unlockAfterRuns: 8, storageKey: 'knightfall.multipliers.gilded.v1' },
} as const;

export const PIECE_SET_IDS = Object.keys(PIECE_SETS) as PieceSetId[];
