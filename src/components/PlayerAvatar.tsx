import { profileAsset, type PlayerProfile } from '../game/playerProfile';

export function PlayerAvatar({ profile }: { profile: Pick<PlayerProfile, 'avatarId' | 'avatarBackgroundColor'> }) {
    return <span className="player-avatar" style={{ backgroundColor: profile.avatarBackgroundColor }} aria-hidden="true">
        <img src={profileAsset('avatars', profile.avatarId)} alt="" width="64" height="64" />
    </span>;
}
