import { describe, expect, it } from 'vitest';
import { dailyLeaderboard, rankLeaderboard } from './leaderboard';
import { initialPlayerProfile } from './playerProfile';

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
});
