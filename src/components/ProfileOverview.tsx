import { useMemo } from 'react';
import { Pencil, Play, Share2 } from 'lucide-react';
import type { PlayerProfile } from '../game/playerProfile';
import type { RunHistory } from '../game/runHistory';
import { profileHighScores } from '../game/shareProfile';
import type { EndlessRecord } from '../features/endless/types';
import { ProfileCard } from './ProfileCard';
import './ProfileOverview.css';

export function ProfileOverview({ profile, history, endlessRecords, onEdit, onPlay, onShare, asPage = false }: {
    profile: PlayerProfile; history: RunHistory; endlessRecords: readonly EndlessRecord[];
    onEdit: () => void; onPlay: () => void; onShare: (trigger: HTMLButtonElement) => void; asPage?: boolean;
}) {
    const highScores = useMemo(() => profileHighScores(history, endlessRecords), [history, endlessRecords]);
    const hasAdventures = history.runs.length > 0 || endlessRecords.length > 0;

    return <div className="profile-overview">
        {asPage ? <h1 id="profile-page-title" className="profile-sr-only" tabIndex={-1} data-page-focus>Your profile</h1>
            : <h2 id="profile-title" className="profile-sr-only">Your profile</h2>}
        <div className="profile-overview-body" data-page-scroll="profile">
            <ProfileCard profile={profile} highScores={highScores} onPlay={onPlay} actions={<div className="profile-card-actions">
                    <button className="profile-edit" onClick={event => onShare(event.currentTarget)} aria-label="Share profile" title="Share profile"><Share2 size={17} aria-hidden="true" /></button>
                    <button className="profile-edit" onClick={onEdit} aria-label="Edit profile" title="Edit profile" autoFocus data-modal-focus><Pencil size={17} aria-hidden="true" /></button>
                </div>} />
            {!hasAdventures && <button className="profile-play" onClick={onPlay}><Play size={15} aria-hidden="true" />Play</button>}
        </div>
    </div>;
}
