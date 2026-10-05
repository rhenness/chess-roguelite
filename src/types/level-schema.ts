import type { GeneratedLevel } from './level.js';

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
    const level = value as Record<string, unknown>;
    if (level.schemaVersion !== 1 || !Object.hasOwn(level, 'difficulty')
        || Object.hasOwn(level, 'difficultyScore')) return value;
    const { difficulty, ...metadata } = level;
    return { ...metadata, schemaVersion: 2, difficultyScore: difficulty };
}
