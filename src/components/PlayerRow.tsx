import { profileAsset, type PlayerProfile } from '../game/playerProfile';
import { PlayerAvatar } from './PlayerAvatar';

export function PlayerRow({ profile, rank, score, status, label }: {
    profile: PlayerProfile; rank?: number; score?: number; status?: string; label?: string;
}) {
    return <div className={`profile-row-preview banner-${profile.bannerId}`} aria-label={label}
        style={{ backgroundImage: `url("${profileAsset('banners', profile.bannerId)}")` }}>
        <span className="profile-preview-rank" aria-hidden="true">{rank ? `#${rank}` : '-'}</span>
        <PlayerAvatar profile={profile} />
        <strong className="profile-preview-name">{profile.displayName}</strong>
        <span className="profile-preview-score">{score === undefined ? status : score.toLocaleString()}</span>
    </div>;
}
