import type { MoveQuality } from '../types/level.js';

export type TargetOptionCount = 2 | 4;

/** The existing "bad" move quality represents a blunder. */
export type MoveOption =
    | { readonly quality: 'best'; readonly pick: 'best' }
    | { readonly quality: 'bad'; readonly pick: 'worst' }
    | {
          readonly quality: Exclude<MoveQuality, 'best'>;
          readonly pick: 'closestLoss';
          /** Target evaluation loss from the best move, in centipawns. */
          readonly targetLossCp: number;
      };

/** A recipe aims at a difficulty; only the scorer determines the result. */
export interface GenerationProfileConfig {
    readonly profileVersion: number;
    readonly levelFolder: `src/levels/${TargetOptionCount}-options-${number}-depth`;
    readonly treeGeneration: {
        readonly decisionDepth: number; // How many moves the player must play to clear the floor.
        readonly playerOptions: readonly MoveOption[]; // How many options a player has on each turn.
    };
    readonly opponentMoves: {
        readonly goodTargetLossCp: number;
        readonly inaccuracyTargetLossCp: number;
        readonly weights: Readonly<Record<MoveQuality, number>>;
    };
}

// Higher recipe numbers aim for harder trees within the same option count and depth.
// Leave gaps (10, 20, 30) so another recipe can be inserted at 15.
// Bump a recipe's profileVersion when its generation settings change.

export const TWO_OPTIONS_4_DEPTH_10 = {
    profileVersion: 1,
    levelFolder: 'src/levels/2-options-4-depth',
    treeGeneration: {
        decisionDepth: 4,
        playerOptions: [
            { quality: 'best', pick: 'best' },
            { quality: 'bad', pick: 'worst' },
        ],
    },
    opponentMoves: {
        goodTargetLossCp: 50,
        inaccuracyTargetLossCp: 150,
        weights: { best: 0, good: 40, inaccuracy: 40, bad: 20 },
    },
} as const satisfies GenerationProfileConfig;

export const FOUR_OPTIONS_4_DEPTH_10 = {
    profileVersion: 1,
    levelFolder: 'src/levels/4-options-4-depth',
    treeGeneration: {
        decisionDepth: 4,
        playerOptions: [
            { quality: 'best', pick: 'best' },
            { quality: 'good', pick: 'closestLoss', targetLossCp: 50 },
            { quality: 'inaccuracy', pick: 'closestLoss', targetLossCp: 150 },
            { quality: 'bad', pick: 'worst' },
        ],
    },
    opponentMoves: {
        goodTargetLossCp: 50,
        inaccuracyTargetLossCp: 150,
        weights: { best: 40, good: 40, inaccuracy: 18, bad: 2 },
    },
} as const satisfies GenerationProfileConfig;

export const FOUR_OPTIONS_4_DEPTH_20 = {
    profileVersion: 1,
    levelFolder: 'src/levels/4-options-4-depth',
    treeGeneration: {
        decisionDepth: 4,
        playerOptions: [
            { quality: 'best', pick: 'best' },
            { quality: 'good', pick: 'closestLoss', targetLossCp: 25 },
            { quality: 'inaccuracy', pick: 'closestLoss', targetLossCp: 50 },
            { quality: 'inaccuracy', pick: 'closestLoss', targetLossCp: 100 },
        ],
    },
    opponentMoves: {
        goodTargetLossCp: 50,
        inaccuracyTargetLossCp: 150,
        weights: { best: 60, good: 40, inaccuracy: 0, bad: 0 },
    },
} as const satisfies GenerationProfileConfig;

export const FOUR_OPTIONS_4_DEPTH_30 = {
    profileVersion: 1,
    levelFolder: 'src/levels/4-options-4-depth',
    treeGeneration: {
        decisionDepth: 4,
        playerOptions: [
            { quality: 'best', pick: 'best' },
            { quality: 'good', pick: 'closestLoss', targetLossCp: 10 },
            { quality: 'inaccuracy', pick: 'closestLoss', targetLossCp: 25 },
            { quality: 'inaccuracy', pick: 'closestLoss', targetLossCp: 50 },
        ],
    },
    opponentMoves: {
        goodTargetLossCp: 50,
        inaccuracyTargetLossCp: 150,
        weights: { best: 100, good: 0, inaccuracy: 0, bad: 0 },
    },
} as const satisfies GenerationProfileConfig;

export const FOUR_OPTIONS_4_DEPTH_40 = {
    profileVersion: 1,
    levelFolder: 'src/levels/4-options-4-depth',
    treeGeneration: {
        decisionDepth: 4,
        playerOptions: [
            { quality: 'best', pick: 'best' },
            { quality: 'good', pick: 'closestLoss', targetLossCp: 5 },
            { quality: 'inaccuracy', pick: 'closestLoss', targetLossCp: 15 },
            { quality: 'inaccuracy', pick: 'closestLoss', targetLossCp: 30 },
        ],
    },
    opponentMoves: {
        goodTargetLossCp: 50,
        inaccuracyTargetLossCp: 150,
        weights: { best: 100, good: 0, inaccuracy: 0, bad: 0 },
    },
} as const satisfies GenerationProfileConfig;

export const GENERATION_PROFILES = {
    '2-options-4-depth-10': TWO_OPTIONS_4_DEPTH_10,
    '4-options-4-depth-10': FOUR_OPTIONS_4_DEPTH_10,
    '4-options-4-depth-20': FOUR_OPTIONS_4_DEPTH_20,
    '4-options-4-depth-30': FOUR_OPTIONS_4_DEPTH_30,
    '4-options-4-depth-40': FOUR_OPTIONS_4_DEPTH_40,
} as const satisfies Readonly<Record<string, GenerationProfileConfig>>;

export type GenerationProfileId = keyof typeof GENERATION_PROFILES;
export const GENERATION_PROFILE_IDS = Object.keys(
    GENERATION_PROFILES,
) as GenerationProfileId[];
export const DEFAULT_GENERATION_PROFILE: GenerationProfileId =
    '4-options-4-depth-10';

export function isGenerationProfileId(
    value: unknown,
): value is GenerationProfileId {
    return (
        typeof value === 'string' && Object.hasOwn(GENERATION_PROFILES, value)
    );
}

/** Depth overrides get their own output pool, independent of the recipe's default. */
export function generationLevelFolder(
    profileId: GenerationProfileId,
    decisionDepth?: number,
): string {
    const profile = GENERATION_PROFILES[profileId];
    return `src/levels/${profile.treeGeneration.playerOptions.length}-options-${decisionDepth ?? profile.treeGeneration.decisionDepth}-depth`;
}
