import type { EngineEvaluation, EvaluationScore, MoveQuality } from '../../types/level.js';
import type { MoveOption, GenerationProfileConfig } from '../../config/generation.js';

function comparable(score: EvaluationScore): number {
    if (score.type === 'cp') return Math.max(-100_000_000, Math.min(100_000_000, score.value));
    return score.value > 0 ? 1_000_000_000 - score.value : -1_000_000_000 - score.value;
}

/** Candidates arrive in Stockfish rank order, all evaluated from the player's side. */
export function selectCandidates(candidates: EngineEvaluation[], options?: readonly MoveOption[]): { quality: MoveQuality; evaluation: EngineEvaluation }[] {
    if (!candidates.length) throw new Error('No candidates available at a nonterminal decision.');
    if (options) {
        const rules = options.slice(0, Math.min(options.length, candidates.length));
        const baseline = comparable(candidates[0]!.score);
        let previous = -1;
        return rules.map((rule, i) => {
            const start = previous + 1;
            const end = candidates.length - (rules.length - i);
            let selected = rule.pick === 'best' ? 0 : rule.pick === 'worst' ? end : start;
            if (rule.pick === 'closestLoss') {
                for (let index = start + 1; index <= end; index++) {
                    if (Math.abs(baseline - comparable(candidates[index]!.score) - rule.targetLossCp)
                        < Math.abs(baseline - comparable(candidates[selected]!.score) - rule.targetLossCp)) selected = index;
                }
            }
            previous = selected;
            return { quality: rule.quality, evaluation: candidates[selected]! };
        });
    }
    const qualities: MoveQuality[] = ['best', 'good', 'inaccuracy', 'bad'];
    if (candidates.length < 4) return candidates.map((evaluation, i) => ({ quality: qualities[i]!, evaluation }));
    const baseline = comparable(candidates[0]!.score);
    const closest = (start: number, end: number, target: number) => {
        let selected = start;
        for (let i = start + 1; i <= end; i++) {
            if (Math.abs(baseline - comparable(candidates[i]!.score) - target)
                < Math.abs(baseline - comparable(candidates[selected]!.score) - target)) selected = i;
        }
        return selected;
    };
    // Reserve space for later labels so every selected move is distinct and ordered.
    const good = closest(1, candidates.length - 3, 50);
    const inaccuracy = closest(good + 1, candidates.length - 2, 150);
    return [0, good, inaccuracy, candidates.length - 1].map((index, i) => ({
        quality: qualities[i]!, evaluation: candidates[index]!,
    }));
}

/** Opponent lines are ranked best-first, but their stored scores favor the player. */
export function selectOpponentReply(candidates: EngineEvaluation[], random: () => number = Math.random,
    settings?: GenerationProfileConfig['opponentMoves']): EngineEvaluation {
    const opponentCandidates = candidates.map(candidate => ({
        ...candidate, score: { ...candidate.score, value: -candidate.score.value },
    }));
    const selected = selectCandidates(opponentCandidates, settings ? [
        { quality: 'best', pick: 'best' },
        { quality: 'good', pick: 'closestLoss', targetLossCp: settings.goodTargetLossCp },
        { quality: 'inaccuracy', pick: 'closestLoss', targetLossCp: settings.inaccuracyTargetLossCp },
        { quality: 'bad', pick: 'worst' },
    ] : undefined);
    // The existing "bad" category represents a blunder; integer weights avoid boundary rounding.
    const weights = settings?.weights ?? { best: 40, good: 40, inaccuracy: 18, bad: 2 };
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Random value must be between 0 (inclusive) and 1 (exclusive).');
    const total = selected.reduce((sum, candidate) => sum + weights[candidate.quality], 0);
    // A forced move can have a quality excluded by the profile's normal reply mix.
    if (total === 0) return candidates[0]!;
    let remaining = roll * total;
    for (const candidate of selected) {
        remaining -= weights[candidate.quality];
        if (remaining < 0) return candidates[opponentCandidates.indexOf(candidate.evaluation)]!;
    }
    return candidates[opponentCandidates.indexOf(selected.at(-1)!.evaluation)]!;
}
