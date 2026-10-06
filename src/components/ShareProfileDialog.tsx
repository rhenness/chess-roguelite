import { useMemo } from 'react';
import type { PlayerProfile } from '../game/playerProfile';
import { shareProfileText, type ProfileHighScore } from '../game/shareProfile';
import { ProfileCard } from './ProfileCard';
import { gameShareUrl, ShareCardDialog } from './ShareCardDialog';
import './ProfileEditor.css';

export function ShareProfileDialog({ profile, highScores }: { profile: PlayerProfile; highScores: readonly ProfileHighScore[] }) {
    const url = gameShareUrl();
    const cards = useMemo(() => [{ id: 'profile', name: 'Player card',
        card: <ProfileCard profile={profile} highScores={highScores} url={url} />,
    }], [profile, highScores, url]);
    return <ShareCardDialog cards={cards} titleId="share-profile-title" title="Share your profile" subject="profile"
        fileName="player" shareTitle={`Knightfall · ${profile.displayName}`} text={shareProfileText(profile.displayName, highScores, url)} />;
}
