import type { MoveQuality } from '../../types/level.js';

export interface ScoringConfig {
    depths: number[];
    multiPv: number;
    timeoutMs: number;
    nodeWeights: { ambiguity: number; depthToSeparation: number; subtlety: number; uniqueness: number };
    levelWeights: { mean: number; peak: number };
    peakPercentile: number;
    branchProbabilities: Record<MoveQuality, number>;
    /** Per-decision depth multiplier; 1 disables the discount. */
    depthDiscount: number;
    ambiguityScaleCp: number;
    separationLossCp: number;
    acceptableLossCp: number;
    storedEvaluationWeight: number;
    normalization: { cpLimit: number; mateBase: number; mateDistanceStep: number; mateDistanceCap: number };
    subtlety: { quiet: number; check: number; capture: number; recapture: number; promotion: number; evasion: number };
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
    depths: [4, 6, 8, 10],
    multiPv: 256,
    timeoutMs: 120_000,
    nodeWeights: { ambiguity: 0.35, depthToSeparation: 0.25, subtlety: 0.20, uniqueness: 0.20 },
    levelWeights: { mean: 0.80, peak: 0.20 },
    peakPercentile: 0.90,
    branchProbabilities: { best: 0.40, good: 0.35, inaccuracy: 0.20, bad: 0.05 },
    depthDiscount: 0.50,
    ambiguityScaleCp: 100,
    separationLossCp: 80,
    acceptableLossCp: 50,
    storedEvaluationWeight: 0.50,
    normalization: { cpLimit: 10_000, mateBase: 20_000, mateDistanceStep: 50, mateDistanceCap: 100 },
    subtlety: { quiet: 100, check: 20, capture: 35, recapture: 15, promotion: 10, evasion: 30 },
};

/** A JSON config can override individual nested values; reject typos and invalid numbers. */
export function resolveScoringConfig(overrides: unknown = {}): ScoringConfig {
    const merge = (base: Record<string, unknown>, patch: unknown, path: string): Record<string, unknown> => {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error(`${path} must be an object.`);
        const result = structuredClone(base);
        for (const [key, value] of Object.entries(patch)) {
            if (!Object.hasOwn(base, key)) throw new Error(`Unknown scoring option: ${path}.${key}`);
            const current = base[key];
            result[key] = current && typeof current === 'object' && !Array.isArray(current)
                ? merge(current as Record<string, unknown>, value, `${path}.${key}`) : value;
        }
        return result;
    };
    const config = merge(DEFAULT_SCORING_CONFIG as unknown as Record<string, unknown>, overrides, 'config') as unknown as ScoringConfig;
    const range = (name: string, value: number, min: number, max = Number.MAX_VALUE, integer = false) => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
            || (integer && !Number.isInteger(value))) throw new Error(`${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
    };
    if (!Array.isArray(config.depths) || config.depths.length < 2) throw new Error('depths must contain at least two increasing search depths.');
    config.depths.forEach((depth, i) => {
        range('depths', depth, 1, 128, true);
        if (i && depth <= config.depths[i - 1]!) throw new Error('depths must be strictly increasing.');
    });
    range('multiPv', config.multiPv, 2, 256, true);
    range('timeoutMs', config.timeoutMs, 1, 2_147_483_647, true);
    for (const [name, weights] of Object.entries({ nodeWeights: config.nodeWeights, levelWeights: config.levelWeights,
        branchProbabilities: config.branchProbabilities })) {
        for (const [key, value] of Object.entries(weights)) range(`${name}.${key}`, value, name === 'branchProbabilities' ? Number.EPSILON : 0, 1);
        if (Math.abs(Object.values(weights).reduce((sum, value) => sum + value, 0) - 1) > 1e-9) throw new Error(`${name} must sum to 1.`);
    }
    range('peakPercentile', config.peakPercentile, Number.EPSILON, 1);
    range('depthDiscount', config.depthDiscount, Number.EPSILON, 1);
    range('storedEvaluationWeight', config.storedEvaluationWeight, 0, 1);
    range('ambiguityScaleCp', config.ambiguityScaleCp, Number.EPSILON);
    range('separationLossCp', config.separationLossCp, Number.EPSILON);
    range('acceptableLossCp', config.acceptableLossCp, 0);
    for (const [key, value] of Object.entries(config.normalization)) range(`normalization.${key}`, value, Number.EPSILON);
    const n = config.normalization;
    if (n.mateBase - n.mateDistanceStep * n.mateDistanceCap <= n.cpLimit) throw new Error('Mate scores must remain outside the centipawn range.');
    for (const [key, value] of Object.entries(config.subtlety)) range(`subtlety.${key}`, value, 0, 100);
    return config;
}
