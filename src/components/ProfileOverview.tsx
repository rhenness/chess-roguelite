import { useMemo } from 'react';
import { DoorOpen, Flame, Infinity as InfinityIcon, Pencil, Play } from 'lucide-react';
import type { PlayerProfile } from '../game/playerProfile';
import { profileStats, type RunHistory } from '../game/runHistory';
import type { EndlessRecord } from '../features/endless/types';
import { PlayerRow } from './PlayerRow';
import './ProfileOverview.css';

export function ProfileOverview({ profile, history, endlessRecords, onEdit, onPlay, asPage = false }: {
    profile: PlayerProfile; history: RunHistory; endlessRecords: readonly EndlessRecord[];
    onEdit: () => void; onPlay: () => void; asPage?: boolean;
}) {
    const stats = useMemo(() => profileStats(history), [history]);
    const hasAdventures = history.runs.length > 0 || endlessRecords.length > 0;
    const bestEndless = (mode: EndlessRecord['mode']) => endlessRecords.filter(record => record.mode === mode)
        .reduce<EndlessRecord | null>((best, record) => !best || record.score > best.score ? record : best, null);
    const highScores = [
        { mode: 'Regular', label: 'Best regular score', record: stats.bestRegular, Icon: Play, unit: 'points' },
        { mode: 'Dungeon', label: 'Best Dungeon score', record: stats.bestDaily, Icon: DoorOpen, unit: 'points' },
        { mode: 'Endless', label: 'Best Endless score', record: bestEndless('standard'), Icon: InfinityIcon, unit: 'points' },
        { mode: 'Hardcore', label: 'Best Hardcore streak', record: bestEndless('hardcore'), Icon: Flame, unit: 'moves' },
    ];

    return <div className="profile-overview">
        {asPage ? <h1 id="profile-page-title" className="profile-sr-only" tabIndex={-1} data-page-focus>Your profile</h1>
            : <h2 id="profile-title" className="profile-sr-only">Your profile</h2>}
        <div className="profile-overview-body" data-page-scroll="profile">
            <section className="profile-card" aria-label="Player card">
                <PlayerRow profile={profile} showRank={false} label="Player identity" actions={
                    <button className="profile-edit" onClick={onEdit} aria-label="Edit profile" title="Edit profile" autoFocus data-modal-focus><Pencil size={17} aria-hidden="true" /></button>
                } />
                <dl className="profile-highlights" aria-label="High scores">
                    {highScores.map(({ mode, label, record, Icon, unit }) => <div key={mode}>
                        <dt><Icon size={22} aria-hidden="true" /><span className="profile-sr-only">{label}</span></dt>
                        <dd aria-label={record ? `${record.score.toLocaleString()} ${unit}` : 'No score yet'}>{record ? record.score.toLocaleString() : '—'}</dd>
                        <span>{mode}</span>
                    </div>)}
                </dl>
                <a className="profile-brand" href="#/play" aria-label="Knightfall home" onClick={event => { event.preventDefault(); onPlay(); }}>
                    <img src={`${import.meta.env.BASE_URL}knight.svg`} alt="" width="18" height="20" /><strong>Knightfall</strong>
                </a>
            </section>
            {!hasAdventures && <button className="profile-play" onClick={onPlay}><Play size={15} aria-hidden="true" />Play</button>}
        </div>
    </div>;
}
