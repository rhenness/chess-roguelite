import type { MoveQuality } from '../types/level.js';

export type SkillTier = 'beginner' | 'intermediate' | 'expert';
export type SkillTierFolder = '1-beginner' | '2-intermediate' | '3-expert';

/** Bump when tier generation rules change; recorded on generated levels. */
export const SKILL_TIER_CONFIG_VERSION = 1;
export const SKILL_TIERS: readonly SkillTier[] = ['beginner', 'intermediate', 'expert'];

export function isSkillTier(value: unknown): value is SkillTier {
    return typeof value === 'string' && SKILL_TIERS.includes(value as SkillTier);
}

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

/** Shared settings for offline level generation and runtime tier selection. */
export interface SkillTierConfig {
    readonly skillTier: SkillTier;
    /** Project-relative folder used by both generation and level selection. */
    readonly levelFolder: `src/levels/${SkillTierFolder}`;

    readonly treeGeneration: {
        /** Player decisions per floor, distinct from Stockfish search depth. */
        readonly decisionDepth: number;
        /** Array length determines option count; qualities may repeat. */
        readonly playerOptions: readonly MoveOption[];
    };

    readonly opponentMoves: {
        readonly goodTargetLossCp: number;
        readonly inaccuracyTargetLossCp: number;
        /** Relative selection weights; zero excludes a quality. */
        readonly weights: Readonly<Record<MoveQuality, number>>;
    };

    readonly run: {
        readonly floorCount: number;
        /** Inclusive difficulty-score bounds within this tier's level folder. */
        readonly difficultyScoreRange: readonly [minimum: number, maximum: number];
        readonly rules: {
            readonly startingHealth: number;
            readonly damage: Readonly<Record<MoveQuality, number>>;
            /** Base points by quality; negative values represent penalties. */
            readonly points: Readonly<Record<MoveQuality, number>>;
        };
    };
}

/** Shape of SKILL_TIER_CONFIG, with an entry for every tier. */
export type SkillTierConfigMap = Readonly<Record<SkillTier, SkillTierConfig>>;

// Proposed settings from docs/difficulty-config.md. Player loss targets and
// opponent weights are starting values to tune during playtesting; targets
// influence ambiguity but do not guarantee a particular evaluation gap.
// Point values for qualities a tier does not offer are zero.

export const BEGINNER_CONFIG = {
    skillTier: 'beginner',
    levelFolder: 'src/levels/1-beginner',
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
    run: {
        floorCount: 10,
        difficultyScoreRange: [0, 100],
        rules: {
            startingHealth: 3,
            damage: { best: 0, good: 0, inaccuracy: 1, bad: 2 },
            points: { best: 50, good: 0, inaccuracy: 0, bad: 0 },
        },
    },
} as const satisfies SkillTierConfig;

export const INTERMEDIATE_CONFIG = {
    skillTier: 'intermediate',
    levelFolder: 'src/levels/2-intermediate',
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
    run: {
        floorCount: 10,
        difficultyScoreRange: [0, 100],
        rules: {
            startingHealth: 3,
            damage: { best: 0, good: 0, inaccuracy: 1, bad: 2 },
            points: { best: 100, good: 75, inaccuracy: 25, bad: -25 },
        },
    },
} as const satisfies SkillTierConfig;

export const EXPERT_CONFIG = {
    skillTier: 'expert',
    levelFolder: 'src/levels/3-expert',
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
    run: {
        floorCount: 10,
        difficultyScoreRange: [0, 100],
        rules: {
            startingHealth: 3,
            damage: { best: 0, good: 0, inaccuracy: 1, bad: 2 },
            points: { best: 150, good: 100, inaccuracy: -25, bad: 0 },
        },
    },
} as const satisfies SkillTierConfig;

export const SKILL_TIER_CONFIG = {
    beginner: BEGINNER_CONFIG,
    intermediate: INTERMEDIATE_CONFIG,
    expert: EXPERT_CONFIG,
} as const satisfies SkillTierConfigMap;
