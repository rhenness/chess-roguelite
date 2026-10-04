import { dailyRandom } from './daily';
import { AVATARS, AVATAR_COLORS, BANNERS, type PlayerProfile } from './playerProfile';

export interface LeaderboardEntry {
    id: string;
    profile: PlayerProfile;
    score: number;
    rank: number;
}

const MOCK_NAMES = ['Quiet Gambit', 'Open File', 'Castle Keeper', 'Fork Finder', 'Endgame Study', 'Tempo',
    'Passed Pawn', 'Royal Guard', 'Check Again', 'The Outpost', 'Counterplay', 'Pin & Win',
    'Last Rank', 'Silver Rook', 'Square One', 'Minor Threat', 'Double Check', 'Center Control'];

export function rankLeaderboard(entries: Omit<LeaderboardEntry, 'rank'>[]): LeaderboardEntry[] {
    const sorted = [...entries].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    let rank = 0;
    return sorted.map((entry, index) => {
        if (index === 0 || sorted[index - 1]!.score !== entry.score) rank = index + 1;
        return { ...entry, rank };
    });
}

export function dailyLeaderboard(day: string, player: PlayerProfile, score: number | null): LeaderboardEntry[] {
    const random = dailyRandom(`standings:${day}`);
    const entries: Omit<LeaderboardEntry, 'rank'>[] = MOCK_NAMES.map((name, index) => ({
        id: `mock-${String(index).padStart(2, '0')}`,
        profile: { version: 1, displayName: name, avatarId: AVATARS[index % AVATARS.length]!.id,
            avatarBackgroundColor: AVATAR_COLORS[(index * 3) % AVATAR_COLORS.length]!.color,
            bannerId: BANNERS[index % BANNERS.length]!.id },
        score: Math.round((1200 + random() * 7800) / 25) * 25,
    }));
    if (score !== null) entries.push({ id: 'you', profile: player, score });
    return rankLeaderboard(entries);
}
