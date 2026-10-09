import type { EvaluationScore } from '../types/level';

/** Scores are already normalized to the player who made the move. */
export function formatMoveEvaluation(score: EvaluationScore | null | undefined): string {
    if (!score) return '—';
    const sign = score.value > 0 ? '+' : score.value < 0 ? '−' : '';
    return score.type === 'mate'
        ? `${sign}M${Math.abs(score.value)}`
        : `${sign}${Math.abs(score.value)} cp`;
}

export function centipawnLoss(score: EvaluationScore | null | undefined,
    best: EvaluationScore | null | undefined): number | null {
    return score?.type === 'cp' && best?.type === 'cp' ? Math.max(0, best.value - score.value) : null;
}
