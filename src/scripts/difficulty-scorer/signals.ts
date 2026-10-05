import { Chess } from 'chess.js';
import type { EngineEvaluation, EvaluationScore } from '../../types/level.js';
import { applyUci } from '../tree-generator/chess.js';
import type { ScoringConfig } from './config.js';

export const clamp = (value: number): number => Math.max(0, Math.min(100, value));

export function normalizeScore(score: EvaluationScore, config: ScoringConfig): number {
    const n = config.normalization;
    if (score.type === 'cp') return Math.max(-n.cpLimit, Math.min(n.cpLimit, score.value));
    // Faster wins rank higher; slower losses rank higher. Mate zero means already mated.
    return (score.value > 0 ? 1 : -1)
        * (n.mateBase - Math.min(Math.abs(score.value), n.mateDistanceCap) * n.mateDistanceStep);
}

function candidateScores(lines: EngineEvaluation[], bestMove: string, config: ScoringConfig): { best: number; others: number[] } {
    const best = lines.find(line => line.pv[0] === bestMove);
    if (!best) throw new Error(`Analysis is missing the stored best move ${bestMove}.`);
    return { best: normalizeScore(best.score, config), others: lines.filter(line => line !== best).map(line => normalizeScore(line.score, config)) };
}

/** Average alternative plausibility: zero loss => 100; large losses approach zero. */
export function moveAmbiguity(lines: EngineEvaluation[], bestMove: string, config: ScoringConfig): number {
    const { best, others } = candidateScores(lines, bestMove, config);
    if (!others.length) return 0;
    return clamp(100 * others.reduce((sum, score) => sum + Math.exp(-Math.max(0, best - score) / config.ambiguityScaleCp), 0) / others.length);
}

/** Separation must persist at every subsequent depth, including the final depth. */
export function depthToSeparation(analyses: EngineEvaluation[][], bestMove: string, config: ScoringConfig): number {
    const separated = analyses.map(lines => {
        const { best, others } = candidateScores(lines, bestMove, config);
        return others.every(score => best - score >= config.separationLossCp);
    });
    const index = separated.findIndex((_, i) => separated.slice(i).every(Boolean));
    if (index < 0) return 100;
    const first = config.depths[0]!;
    const last = config.depths.at(-1)!;
    return clamp(100 * (config.depths[index]! - first) / (last - first));
}

export function bestMoveSubtlety(fen: string, bestMove: string, previousOpponentMove: string | undefined, config: ScoringConfig): number {
    const board = new Chess(fen);
    const evasion = board.isCheck();
    const move = applyUci(board, bestMove);
    const scores = [config.subtlety.quiet];
    if (evasion) scores.push(config.subtlety.evasion);
    if (/[+#]/.test(move.san)) scores.push(config.subtlety.check);
    if (move.captured) {
        scores.push(config.subtlety.capture);
        if (previousOpponentMove?.slice(2, 4) === move.to) scores.push(config.subtlety.recapture);
    }
    if (move.promotion) scores.push(config.subtlety.promotion);
    return Math.min(...scores);
}

/** One acceptable move => 100, two => 50, four => 25. */
export function moveUniqueness(lines: EngineEvaluation[], config: ScoringConfig): number {
    const scores = lines.map(line => normalizeScore(line.score, config));
    const best = Math.max(...scores);
    const close = scores.filter(score => best - score <= config.acceptableLossCp).length;
    if (!close) throw new Error('Uniqueness analysis has no comparable moves.');
    return clamp(100 / close);
}

export interface WeightedDifficulty { difficultyScore: number; reachProbability: number; decisionsTaken: number }

export function aggregateDifficulty(nodes: WeightedDifficulty[], config: ScoringConfig): number {
    if (!nodes.length) return 0;
    const weighted = nodes.map(node => ({ difficultyScore: node.difficultyScore,
        weight: node.reachProbability * config.depthDiscount ** node.decisionsTaken }));
    const totalWeight = weighted.reduce((sum, node) => sum + node.weight, 0);
    const mean = weighted.reduce((sum, node) => sum + node.difficultyScore * node.weight, 0) / totalWeight;
    const ordered = weighted.sort((a, b) => a.difficultyScore - b.difficultyScore);
    let cumulative = 0;
    let peak = ordered.at(-1)!.difficultyScore;
    for (const node of ordered) {
        cumulative += node.weight;
        if (cumulative >= config.peakPercentile * totalWeight) { peak = node.difficultyScore; break; }
    }
    return Math.round(clamp(config.levelWeights.mean * mean + config.levelWeights.peak * peak));
}
