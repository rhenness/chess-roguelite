import type { GeneratedLevel } from './level.js';

/** Historical mappings stay fixed when current generation recipes change. */
export const LEGACY_PROFILE_IDS = {
    beginner: '2-options-4-depth-10', intermediate: '4-options-4-depth-10', expert: '4-options-4-depth-20',
} as const;
const legacyQualities = {
    beginner: ['best', 'bad'],
    intermediate: ['best', 'good', 'inaccuracy', 'bad'],
    expert: ['best', 'good', 'inaccuracy', 'inaccuracy'],
} as const;

/** Validate stored recipe facts without consulting today's generation config. */
export function isGenerationMetadata(value: unknown): value is GeneratedLevel['generation'] & {
    profileId: string; profileVersion: number; targetOptionCount: 2 | 4;
    playerQualities: NonNullable<GeneratedLevel['generation']['playerQualities']>;
} {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const generation = value as Record<string, unknown>;
    return (generation.targetOptionCount === 2 || generation.targetOptionCount === 4)
        && typeof generation.profileId === 'string'
        && new RegExp(`^${generation.targetOptionCount}-options-(?:0|[1-9][0-9]*)-depth-[1-9][0-9]*$`).test(generation.profileId)
        && Number.isSafeInteger(generation.profileVersion) && Number(generation.profileVersion) > 0
        && Array.isArray(generation.playerQualities)
        && generation.playerQualities.length === generation.targetOptionCount
        && generation.playerQualities[0] === 'best'
        && generation.playerQualities.filter(quality => quality === 'best').length === 1
        && generation.playerQualities.every(quality => ['best', 'good', 'inaccuracy', 'bad'].includes(quality));
}

/** Version 1 stored the numeric rating as "difficulty". */
export type LegacyGeneratedLevel = Omit<GeneratedLevel, 'schemaVersion' | 'difficultyScore'> & {
    schemaVersion: 1;
    difficulty: number;
};

export function normalizeLevel(level: GeneratedLevel | LegacyGeneratedLevel): GeneratedLevel;
export function normalizeLevel(value: unknown): unknown;
/** Normalize legacy metadata without changing the input or its decision tree. */
export function normalizeLevel(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    let level = value as Record<string, unknown>;
    if (level.schemaVersion === 1) {
        if (!Object.hasOwn(level, 'difficulty') || Object.hasOwn(level, 'difficultyScore')) return value;
        const { difficulty, ...metadata } = level;
        level = { ...metadata, schemaVersion: 2, difficultyScore: difficulty };
    }
    if (level.schemaVersion !== 2 || !level.generation || typeof level.generation !== 'object'
        || Array.isArray(level.generation)) return level;
    const generation = level.generation as Record<string, unknown>;
    // Profile names originally omitted the default decision depth (four).
    // Keep these archived snapshots and saved runs readable without rewriting them.
    if (typeof generation.profileId === 'string' && /^[24]-options-[1-9][0-9]*$/.test(generation.profileId)) {
        return { ...level, generation: { ...generation,
            profileId: generation.profileId.replace('-options-', '-options-4-depth-'),
        } };
    }
    // Never repair partial or conflicting modern metadata with legacy defaults.
    if (['profileId', 'profileVersion', 'targetOptionCount', 'playerQualities'].some(key => Object.hasOwn(generation, key))) return level;
    const tier = level.skillTier === undefined ? 'intermediate' : level.skillTier;
    if (typeof tier !== 'string' || !Object.hasOwn(LEGACY_PROFILE_IDS, tier)) return level;
    const legacyTier = tier as keyof typeof LEGACY_PROFILE_IDS;
    const { skillTier: _legacyTier, ...metadata } = level;
    const { configVersion, ...settings } = generation;
    const playerQualities = [...legacyQualities[legacyTier]];
    return { ...metadata, generation: { ...settings,
        profileId: LEGACY_PROFILE_IDS[legacyTier], profileVersion: configVersion === undefined ? 1 : configVersion,
        targetOptionCount: playerQualities.length, playerQualities,
    } };
}
