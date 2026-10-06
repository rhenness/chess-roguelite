import { describe, expect, it } from 'vitest';
import { dailyLeaderboard, rankLeaderboard } from './leaderboard';
import { initialPlayerProfile } from './playerProfile';
import { SKILL_TIER_CONFIG } from '../config/difficulty';

describe('daily leaderboard', () => {
    it('keeps mock players stable for a day and includes the real multiplied score', () => {
        const profile = initialPlayerProfile();
        const first = dailyLeaderboard('2026-10-04', profile, 12500);
        expect(first).toEqual(dailyLeaderboard('2026-10-04', profile, 12500));
        expect(first[0]).toMatchObject({ id: 'you', rank: 1, score: 12500 });
        expect(first.filter(entry => entry.id !== 'you')).not.toEqual(dailyLeaderboard('2026-10-05', profile, null));
        expect(dailyLeaderboard('2026-10-04', profile, null)).toHaveLength(18);
    });

    it('shares ranks for tied scores without using speed or profile names', () => {
        const profile = initialPlayerProfile();
        const entries = [{ id: 'a', profile, score: 100 }, { id: 'b', profile, score: 100 }, { id: 'c', profile, score: 50 }];
        expect(rankLeaderboard(entries).map(entry => entry.rank)).toEqual([1, 1, 3]);
        expect(entries.map(entry => entry.score)).toEqual([100, 100, 50]);
    });

    it('uses tier scoring and plausible payouts, including short attempts', () => {
        const profile = initialPlayerProfile();
        const entries = Array.from({ length: 28 }, (_, index) =>
            dailyLeaderboard(`2026-10-${String(index + 1).padStart(2, '0')}`, profile, null)).flat();
        for (const entry of entries) {
            const { floorCount, rules } = SKILL_TIER_CONFIG[entry.skillTier!].run;
            expect(Number.isSafeInteger(entry.score)).toBe(true);
            expect(entry.score).toBeGreaterThanOrEqual(0);
            expect(entry.score).toBeLessThanOrEqual(floorCount * 4 * rules.points.best * 1.5);
        }
        expect(entries.some(entry => entry.score < 1200)).toBe(true);
        expect(entries.some(entry => entry.score % 25 !== 0)).toBe(true);
        const average = (tier: string) => {
            const scores = entries.filter(entry => entry.skillTier === tier);
            return scores.reduce((total, entry) => total + entry.score, 0) / scores.length;
        };
        expect(average('beginner')).toBeLessThan(average('intermediate'));
        expect(average('intermediate')).toBeLessThan(average('expert'));
    });
});
