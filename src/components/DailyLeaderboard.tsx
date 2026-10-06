import { useLayoutEffect, useRef } from 'react';
import { LocateFixed } from 'lucide-react';
import type { DailyDungeon } from '../game/daily';
import type { LeaderboardEntry } from '../game/leaderboard';
import type { PlayerProfile } from '../game/playerProfile';
import { PlayerRow } from './PlayerRow';
import { formatCountdown, formatDailyDate } from './PlayMenu';
import { SKILL_TIER_LABELS } from '../config/difficulty';

export function DailyLeaderboard({ dungeon, now, entries, profile, embedded = false, active = true }: {
    dungeon: DailyDungeon; now: number; entries: LeaderboardEntry[]; profile: PlayerProfile;
    embedded?: boolean; active?: boolean;
}) {
    const list = useRef<HTMLOListElement>(null);
    const scrollPosition = useRef(0);
    const own = entries.find(entry => entry.id === 'you');
    const status = dungeon.attempt?.status;

    function jumpToMe() {
        window.requestAnimationFrame(() => list.current?.querySelector('[data-player-id="you"]')?.scrollIntoView({
            behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest',
        }));
    }

    useLayoutEffect(() => {
        if (active && list.current) list.current.scrollTop = scrollPosition.current;
    }, [active]);

    return <div className="daily-leaderboard">
        {!embedded && <><div className="daily-view-heading"><h2 id="daily-leaderboard-title">Daily leaderboard</h2></div>
            <div className="daily-menu-meta"><span>{formatDailyDate(dungeon.day)}</span><span className="daily-countdown">{now >= dungeon.expiresAt ? 'Closed' : formatCountdown(dungeon.expiresAt, now)}</span></div></>}
        <ol className="leaderboard-list" ref={list} aria-label="Daily standings" data-page-scroll="standings" tabIndex={0} onScroll={() => {
            if (active) scrollPosition.current = list.current?.scrollTop ?? 0;
        }}>
            {entries.map(entry => <li key={entry.id} data-player-id={entry.id} className={entry.id === 'you' ? 'your-standing' : undefined}
                aria-label={`Rank ${entry.rank}, ${entry.profile.displayName}${entry.id === 'you' ? ', you' : ''}, ${entry.score.toLocaleString()} points, ${SKILL_TIER_LABELS[entry.skillTier ?? 'intermediate']}`}>
                <PlayerRow profile={entry.profile} rank={entry.rank} score={entry.score} skillTier={entry.skillTier ?? 'intermediate'} />
            </li>)}
        </ol>
        <div className="leaderboard-footer"><div className="leaderboard-pinned" aria-label="Your standing">
            <PlayerRow profile={profile} rank={own?.rank} score={own?.score}
                skillTier={dungeon.attempt?.skillTier ?? own?.skillTier}
                status={status === 'active' ? 'In progress' : status === 'expired' ? 'Expired' : 'Not entered'} />
        </div>
            {own && <button className="leaderboard-jump" aria-label="Jump to me" title="Jump to me" onClick={jumpToMe}><LocateFixed size={18} aria-hidden="true" /></button>}
        </div>
    </div>;
}
