import type { ReactNode } from 'react';
import { profileAsset, type PlayerProfile } from '../game/playerProfile';
import { PlayerAvatar } from './PlayerAvatar';

export function PlayerRow({ profile, rank, score, status, label, showRank = true, actions }: {
    profile: PlayerProfile; rank?: number; score?: number; status?: string; label?: string; showRank?: boolean; actions?: ReactNode;
}) {
    return <div className={`profile-row-preview banner-${profile.bannerId}`} aria-label={label}
        style={{ backgroundImage: `url("${profileAsset('banners', profile.bannerId)}")` }}>
        {showRank && <span className="profile-preview-rank" aria-hidden="true">{rank ? `#${rank}` : '-'}</span>}
        <PlayerAvatar profile={profile} />
        <strong className="profile-preview-name">{profile.displayName}</strong>
        {(score !== undefined || status !== undefined) && <span className="profile-preview-score">{score === undefined ? status : score.toLocaleString()}</span>}
        {actions}
    </div>;
}
