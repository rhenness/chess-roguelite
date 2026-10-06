import { dailyRandom } from './daily';
import { AVATARS, AVATAR_COLORS, BANNERS, type PlayerProfile } from './playerProfile';
import { SKILL_TIERS, SKILL_TIER_CONFIG, type SkillTier } from '../config/difficulty';

export interface LeaderboardEntry {
    id: string;
    profile: PlayerProfile;
    score: number;
    rank: number;
    skillTier?: SkillTier;
}

const MOCK_NAMES = ['Quiet Gambit', 'Open File', 'Castle Keeper', 'Fork Finder', 'Endgame Study', 'Tempo',
    'Passed Pawn', 'Royal Guard', 'Check Again', 'The Outpost', 'Counterplay', 'Pin & Win',
    'Last Rank', 'Silver Rook', 'Square One', 'Minor Threat', 'Double Check', 'Center Control'];

function mockScore(skillTier: SkillTier, random: () => number): number {
    const { floorCount, rules } = SKILL_TIER_CONFIG[skillTier].run;
    // Bundled floors have four decisions. Short attempts are more common than full clears.
    const decisions = 1 + Math.floor(random() ** 1.6 * floorCount * 4);
    const bestMoves = Math.round(decisions * (0.65 + random() * 0.3));
    const baseScore = bestMoves * rules.points.best + (decisions - bestMoves) * rules.points.good;
    // Most payout squares are unboosted; larger starting bonuses are less common.
    const landing = random();
    const multiplier = landing < 0.7 ? 10 : landing < 0.9 ? 11 : landing < 0.98 ? 13 : 15;
    return Math.round(baseScore * multiplier / 10);
}

export function rankLeaderboard(entries: Omit<LeaderboardEntry, 'rank'>[]): LeaderboardEntry[] {
    const sorted = [...entries].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    let rank = 0;
    return sorted.map((entry, index) => {
        if (index === 0 || sorted[index - 1]!.score !== entry.score) rank = index + 1;
        return { ...entry, rank };
    });
}

export function dailyLeaderboard(day: string, player: PlayerProfile, score: number | null, skillTier: SkillTier = 'intermediate'): LeaderboardEntry[] {
    const random = dailyRandom(`standings:${day}`);
    const entries: Omit<LeaderboardEntry, 'rank'>[] = MOCK_NAMES.map((name, index) => ({
        id: `mock-${String(index).padStart(2, '0')}`,
        profile: { version: 1, displayName: name, avatarId: AVATARS[index % AVATARS.length]!.id,
            avatarBackgroundColor: AVATAR_COLORS[(index * 3) % AVATAR_COLORS.length]!.color,
            bannerId: BANNERS[index % BANNERS.length]!.id },
        score: mockScore(SKILL_TIERS[index % SKILL_TIERS.length]!, random),
        skillTier: SKILL_TIERS[index % SKILL_TIERS.length]!,
    }));
    if (score !== null) entries.push({ id: 'you', profile: player, score, skillTier });
    return rankLeaderboard(entries);
}
