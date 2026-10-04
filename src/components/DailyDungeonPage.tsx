import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Clock3, Coins, Heart, Sparkles } from 'lucide-react';
import { restoreDailyRun, type DailyDungeon } from '../game/daily';
import type { LeaderboardEntry } from '../game/leaderboard';
import { PIECE_SETS, type PieceSetId } from '../game/pieceSets';
import type { PlayerProfile } from '../game/playerProfile';
import type { UserProgression } from '../game/progression';
import { DailyLeaderboard } from './DailyLeaderboard';
import { DailyResults } from './DailyResults';
import { DailyRewards } from './DailyRewards';
import { PieceSetPicker } from './PieceSetPicker';
import { formatCountdown, formatDailyDate } from './PlayMenu';

export function DailyDungeonPage({ dungeon, today, now, progression, defaultStartingHealth, selected, onSelected,
    onUpgrade, onEnter, onResume, onToday, entries, profile, persisted }: {
    dungeon: DailyDungeon; today: string; now: number; progression: UserProgression; defaultStartingHealth: number;
    selected: PieceSetId; onSelected: (set: PieceSetId) => void; onUpgrade: (set: PieceSetId, button: HTMLButtonElement) => void;
    onEnter: () => void; onResume: () => void; onToday: () => void;
    entries: LeaderboardEntry[]; profile: PlayerProfile; persisted: boolean;
}) {
    const attempt = dungeon.attempt;
    const restored = useMemo(() => dungeon.attempt && dungeon.attempt.status !== 'expired' ? restoreDailyRun(dungeon) : null, [dungeon]);
    const closed = now >= dungeon.expiresAt;
    const rank = entries.find(entry => entry.id === 'you')?.rank;
    const [tab, setTab] = useState<'dungeon' | 'leaderboard'>('dungeon');
    const dungeonScroll = useRef<HTMLDivElement>(null);
    const savedDungeonScroll = useRef(0);
    useLayoutEffect(() => {
        if (tab === 'dungeon' && dungeonScroll.current) dungeonScroll.current.scrollTop = savedDungeonScroll.current;
    }, [tab]);
    return <section className="daily-page" aria-labelledby="daily-page-title">
        <header className="page-heading">
            <h1 id="daily-page-title" tabIndex={-1} data-page-focus>Daily dungeon</h1>
            <div className="daily-page-meta"><span>{formatDailyDate(dungeon.day)}</span>
                <span className="daily-countdown"><Clock3 size={15} aria-hidden="true" />{closed ? 'Closed' : formatCountdown(dungeon.expiresAt, now)}</span></div>
        </header>
        <div className="daily-tabs" role="tablist" aria-label="Daily dungeon" onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 'dungeon' : event.key === 'End' ? 'leaderboard' : tab === 'dungeon' ? 'leaderboard' : 'dungeon';
            if (tab === 'dungeon') savedDungeonScroll.current = dungeonScroll.current?.scrollTop ?? 0;
            setTab(next);
            event.currentTarget.querySelector<HTMLButtonElement>(`#daily-${next}-tab`)?.focus();
        }}>
            {(['dungeon', 'leaderboard'] as const).map(value => <button key={value} id={`daily-${value}-tab`} role="tab" aria-selected={tab === value}
                aria-controls={`daily-${value}-panel`} tabIndex={tab === value ? 0 : -1} onClick={() => {
                    if (tab === 'dungeon') savedDungeonScroll.current = dungeonScroll.current?.scrollTop ?? 0;
                    setTab(value);
                }}>{value === 'dungeon' ? 'Dungeon' : 'Leaderboard'}</button>)}
        </div>
        <div id="daily-dungeon-panel" role="tabpanel" aria-labelledby="daily-dungeon-tab" className="daily-tab-panel" hidden={tab !== 'dungeon'}>
            <div className="daily-attempt-panel" ref={dungeonScroll}>
                {!attempt && !closed ? <>
                    <div className="daily-entry-details"><span>{dungeon.levels.length} levels</span><span>One attempt</span><span className="daily-reward-badge" aria-label="5 times coins"><Coins size={14} aria-hidden="true" />5×</span></div>
                    <PieceSetPicker showHeading={false} selectionOnly selectedSet={selected} onSelect={onSelected} onUpgrade={onUpgrade}
                        progression={progression} defaultStartingHealth={defaultStartingHealth} />
                    <p className="daily-clear-reward"><Sparkles size={15} aria-hidden="true" />+0.1× on clear</p>
                    <DailyRewards />
                </> : attempt?.status === 'active' && restored && !closed ? <>
                    <div className="daily-attempt-status"><h2>Dungeon in progress</h2><span>{PIECE_SETS[attempt.setId].name}</span></div>
                    <dl className="daily-progress-stats"><div><dt>Level</dt><dd>{restored.levelIndex + 1} / {restored.levels.length}</dd></div><div><dt>Health</dt><dd><Heart size={15} aria-hidden="true" />{restored.health}</dd></div><div><dt>Score</dt><dd>{restored.score.toLocaleString()}</dd></div></dl>
                </> : attempt?.status === 'finished' && restored && attempt.payout && rank !== undefined ? <>
                    <DailyResults run={restored} payout={attempt.payout} rank={rank} />
                </> : <div className="daily-attempt-status"><h2>{attempt?.status === 'expired' ? 'Attempt expired' : 'Dungeon closed'}</h2>{attempt?.status === 'expired' && <span>No rewards earned</span>}</div>}
                {!persisted && <p className="daily-storage-warning" role="status">Progress is only saved for this session. Browser storage is unavailable.</p>}
            </div>
            {(!attempt && !closed || attempt?.status === 'active' && !closed || dungeon.day !== today) && <div className="daily-action-bar">
                {!attempt && !closed && <><span className="coin-balance" aria-label={`Coins: ${progression.coins}`}><Coins size={17} aria-hidden="true" />{progression.coins.toLocaleString()}</span><button className="primary-small" onClick={onEnter}>Enter dungeon</button></>}
                {attempt?.status === 'active' && !closed && <button className="primary-small" onClick={onResume}>Resume dungeon</button>}
                {dungeon.day !== today && <button className="primary-small" onClick={onToday}>Today's dungeon</button>}
            </div>}
        </div>
        <div id="daily-leaderboard-panel" role="tabpanel" aria-labelledby="daily-leaderboard-tab" className="daily-tab-panel" hidden={tab !== 'leaderboard'}>
            <DailyLeaderboard embedded active={tab === 'leaderboard'} dungeon={dungeon} now={now} entries={entries} profile={profile} />
        </div>
    </section>;
}
