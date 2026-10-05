import { describe, expect, it } from 'vitest';
import { makeLevel } from '../test/levels';
import { sampleRunLevels } from './levels';
import { dailyRandom } from './daily';

const template = makeLevel();
function poolWithCounts(groups: [number, number][]) {
    return groups.flatMap(([difficultyScore, count]) => Array.from({ length: count }, (_, index) =>
        ({ ...template, id: `difficulty-${difficultyScore}-${index}`, difficultyScore })));
}

describe('difficulty distribution', () => {
    it.each([0, .999])('covers all ten bands despite a dense middle with random %s', value => {
        const pool = poolWithCounts([[0, 1], [10, 30], [20, 1], [30, 30], [40, 1], [50, 30], [60, 1], [70, 1], [80, 1], [99, 1]]);
        const original = [...pool];
        const selected = sampleRunLevels(pool, 10, () => value);
        expect(selected.map(level => level.difficultyScore)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 99]);
        expect(new Set(selected.map(level => level.id)).size).toBe(10);
        expect(pool).toEqual(original);
    });
    it('balances extra slots across populated bands when other bands are empty', () => {
        const pool = poolWithCounts([[0, 8], [50, 8], [99, 8]]);
        for (let day = 1; day <= 20; day++) {
            const selected = sampleRunLevels(pool, 10, dailyRandom(`2026-10-${String(day).padStart(2, '0')}`));
            const counts = [0, 50, 99].map(difficultyScore => selected.filter(level => level.difficultyScore === difficultyScore).length);
            expect(counts.reduce((sum, count) => sum + count, 0)).toBe(10);
            expect(Math.max(...counts) - Math.min(...counts)).toBe(1);
            expect(new Set(selected.map(level => level.id)).size).toBe(10);
        }
    });
    it('uses sparse bands fully and fills the rest without repeating a level', () => {
        const selected = sampleRunLevels(poolWithCounts([[0, 1], [50, 20], [99, 1]]), 10, () => .5);
        expect(selected.map(level => level.difficultyScore)).toEqual([0, 50, 50, 50, 50, 50, 50, 50, 50, 99]);
        expect(new Set(selected.map(level => level.id)).size).toBe(10);
    });
    it('uses score widths rather than equal-sized groups of levels', () => {
        const selected = sampleRunLevels(poolWithCounts([[34, 1], [38, 1], [42, 1], [46, 25], [50, 25], [53, 25], [57, 1], [61, 1], [65, 1], [71, 1]]), 10, () => 0);
        expect(selected.map(level => level.difficultyScore)).toEqual([34, 38, 42, 46, 50, 53, 57, 61, 65, 71]);
    });
    it('handles a single difficulty, small pools, duplicate IDs, and unscored levels', () => {
        const same = poolWithCounts([[45, 15]]);
        expect(new Set(sampleRunLevels(same, 10, () => 0).map(level => level.id)).size).toBe(10);
        const small = poolWithCounts([[80, 2], [10, 1]]);
        expect(sampleRunLevels([...small, small[0]!, { ...template, id: 'unscored', difficultyScore: -1 }], 10))
            .toEqual([small[2], small[0], small[1]]);
    });
    it('is deterministic for daily seeds and independent of pool order', () => {
        const pool = poolWithCounts(Array.from({ length: 10 }, (_, index) => [index * 10, 4]));
        const first = sampleRunLevels(pool, 10, dailyRandom('2026-10-04'));
        const second = sampleRunLevels([...pool].reverse(), 10, dailyRandom('2026-10-04'));
        const nextDay = sampleRunLevels(pool, 10, dailyRandom('2026-10-05'));
        expect(second).toEqual(first);
        expect(nextDay.map(level => level.id)).not.toEqual(first.map(level => level.id));
    });
});
