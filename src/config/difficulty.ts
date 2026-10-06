import type { MoveQuality } from '../types/level.js';

export type SkillTier = 'beginner' | 'intermediate' | 'expert';
export const SKILL_TIERS: readonly SkillTier[] = ['beginner', 'intermediate', 'expert'];
export const SKILL_TIER_LABELS: Readonly<Record<SkillTier, string>> = {
    beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert',
};

export function isSkillTier(value: unknown): value is SkillTier {
    return typeof value === 'string' && SKILL_TIERS.includes(value as SkillTier);
}

/** Runtime selection and gameplay rules, independent of generation recipes. */
export interface SkillTierConfig {
    readonly skillTier: SkillTier;
    readonly targetOptionCount: 2 | 4;
    readonly run: {
        readonly floorCount: number;
        /** Inclusive difficulty-score bounds within the shared option-count pool. */
        readonly difficultyScoreRange: readonly [minimum: number, maximum: number];
        readonly rules: {
            readonly startingHealth: number;
            readonly damage: Readonly<Record<MoveQuality, number>>;
            /** Base points by quality; negative values represent penalties. */
            readonly points: Readonly<Record<MoveQuality, number>>;
        };
    };
}

export type SkillTierConfigMap = Readonly<Record<SkillTier, SkillTierConfig>>;

// Playtesting bands: intermediate and expert intentionally overlap at 58-68.

export const BEGINNER_CONFIG = {
    skillTier: 'beginner',
    targetOptionCount: 2,
    run: {
        floorCount: 10,
        difficultyScoreRange: [0, 39],
        rules: {
            startingHealth: 3,
            damage: { best: 0, good: 0, inaccuracy: 1, bad: 2 },
            points: { best: 50, good: 0, inaccuracy: 0, bad: 0 },
        },
    },
} as const satisfies SkillTierConfig;

export const INTERMEDIATE_CONFIG = {
    skillTier: 'intermediate',
    targetOptionCount: 4,
    run: {
        floorCount: 10,
        difficultyScoreRange: [45, 68],
        rules: {
            startingHealth: 3,
            damage: { best: 0, good: 0, inaccuracy: 1, bad: 2 },
            points: { best: 100, good: 75, inaccuracy: 25, bad: -25 },
        },
    },
} as const satisfies SkillTierConfig;

export const EXPERT_CONFIG = {
    skillTier: 'expert',
    targetOptionCount: 4,
    run: {
        floorCount: 10,
        difficultyScoreRange: [58, 100],
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
