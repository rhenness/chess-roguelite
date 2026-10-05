import { Clock3 } from 'lucide-react';
import type { DailyDungeon } from '../game/daily';
import type { LeaderboardEntry } from '../game/leaderboard';
import type { PlayerProfile } from '../game/playerProfile';
import { DailyLeaderboard } from './DailyLeaderboard';
import { formatCountdown, formatDailyDate } from './PlayMenu';

export function LeaderboardsPage({ dungeon, now, entries, profile }: {
    dungeon: DailyDungeon | undefined; now: number; entries: LeaderboardEntry[]; profile: PlayerProfile;
}) {
    return <section className="leaderboards-page" aria-labelledby="leaderboards-page-title">
        <header className="page-heading">
            <h1 id="leaderboards-page-title" tabIndex={-1} data-page-focus>Leaderboards</h1>
            {dungeon && <div className="daily-page-meta"><span>Daily dungeon · {formatDailyDate(dungeon.day)}</span>
                <span className="daily-countdown"><Clock3 size={15} aria-hidden="true" />{now >= dungeon.expiresAt ? 'Closed' : formatCountdown(dungeon.expiresAt, now)}</span></div>}
        </header>
        {dungeon ? <DailyLeaderboard embedded dungeon={dungeon} now={now} entries={entries} profile={profile} />
            : <p className="empty-state" role="status">No leaderboard available.</p>}
    </section>;
}
