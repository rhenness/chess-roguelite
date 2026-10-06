import type { ReactNode } from 'react';
import { DoorOpen, Flame, Infinity as InfinityIcon, Play } from 'lucide-react';
import type { PlayerProfile } from '../game/playerProfile';
import type { ProfileHighScore } from '../game/shareProfile';
import { PlayerRow } from './PlayerRow';
import './ProfileOverview.css';

const ICONS = { Regular: Play, Dungeon: DoorOpen, Endless: InfinityIcon, Hardcore: Flame };

export function ProfileCard({ profile, highScores, actions, onPlay, url }: {
    profile: PlayerProfile; highScores: readonly ProfileHighScore[]; actions?: ReactNode; onPlay?: () => void; url?: string;
}) {
    const brand = <><img src={`${import.meta.env.BASE_URL}knight.svg`} alt="" width="18" height="20" /><strong>Knightfall</strong></>;
    return <section className={`profile-card${url ? ' run-share-card profile-share-card' : ''}`} aria-label="Player card">
        <PlayerRow profile={profile} showRank={false} label="Player identity" actions={actions} />
        <dl className="profile-highlights" aria-label="High scores">
            {highScores.map(({ mode, label, score, unit }) => {
                const Icon = ICONS[mode];
                return <div key={mode}>
                    <dt><Icon size={22} aria-hidden="true" /><span className="profile-sr-only">{label}</span></dt>
                    <dd aria-label={score !== null ? `${score.toLocaleString()} ${unit}` : 'No score yet'}>{score !== null ? score.toLocaleString() : '—'}</dd>
                    <span>{mode}</span>
                </div>;
            })}
        </dl>
        {url ? <footer className="run-share-brand"><div>{brand}</div><span>{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span></footer>
            : <a className="profile-brand" href="#/play" aria-label="Knightfall home" onClick={event => { event.preventDefault(); onPlay?.(); }}>{brand}</a>}
    </section>;
}
