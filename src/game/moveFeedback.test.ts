import { describe, expect, it } from 'vitest';
import { centipawnLoss, formatMoveEvaluation } from './moveFeedback';
import type { EvaluationScore } from '../types/level';

const cp = (value: number): EvaluationScore => ({ type: 'cp', value });
const mate = (value: number): EvaluationScore => ({ type: 'mate', value });

describe('move evaluation feedback', () => {
    it.each([
        [cp(85), '+85 cp'], [cp(-85), '−85 cp'], [cp(0), '0 cp'],
        [mate(3), '+M3'], [mate(-3), '−M3'], [null, '—'], [undefined, '—'],
    ] as const)('formats %j as %s', (score, expected) => {
        expect(formatMoveEvaluation(score)).toBe(expected);
    });

    it('compares actual cp values and keeps loss nonnegative', () => {
        expect(centipawnLoss(cp(85), cp(100))).toBe(15);
        expect(centipawnLoss(cp(-85), cp(-70))).toBe(15);
        expect(centipawnLoss(cp(0), cp(0))).toBe(0);
        expect(centipawnLoss(cp(101), cp(100))).toBe(0);
    });

    it.each([
        [mate(3), cp(100)], [cp(85), mate(3)], [mate(-3), mate(-2)],
        [null, cp(100)], [cp(85), undefined],
    ] as const)('omits cp loss for mate or unavailable scores (%j, %j)', (score, best) => {
        expect(centipawnLoss(score, best)).toBeNull();
    });
});
