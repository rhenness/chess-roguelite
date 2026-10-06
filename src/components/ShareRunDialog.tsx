import { useMemo } from 'react';
import { Coins, Flame, Footprints, Layers3, Swords, Trophy } from 'lucide-react';
import type { PlayerProfile } from '../game/playerProfile';
import { QUALITY_LABELS, QUALITY_ORDER } from '../game/run';
import { shareRunText, type ShareRunData, type ShareStatIcon } from '../game/shareRun';
import { PlayerRow } from './PlayerRow';
import './ProfileEditor.css';
import { gameShareUrl, ShareCardDialog } from './ShareCardDialog';
export { gameShareUrl } from './ShareCardDialog';

const STAT_ICONS = { floors: Layers3, moves: Footprints, coins: Coins, streak: Flame, games: Swords } satisfies Record<ShareStatIcon, unknown>;
const CARD_STYLES = [
    { id: 'profile', name: 'Player card', description: 'Your banner, your score, your run.' },
    { id: 'spotlight', name: 'Spotlight', description: 'Put your score in the spotlight.' },
    { id: 'decisions', name: 'Decision breakdown', description: 'Show how you played, move by move.' },
] as const;
type CardStyle = (typeof CARD_STYLES)[number]['id'];

export function RunShareCard({ result, profile, url, style = 'profile' }: { result: ShareRunData; profile: PlayerProfile; url: string; style?: CardStyle }) {
    const score = result.score.toLocaleString();
    const scoreSize = style === 'decisions' ? score.length > 12 ? 24 : score.length > 9 ? 32 : 44
        : score.length > 12 ? 40 : score.length > 9 ? 52 : 76;
    const decisions = <dl className="run-share-decisions" aria-label="Decision counts">{QUALITY_ORDER.map(quality =>
        <div key={quality} className={`run-share-quality-${quality}`}><dt>{QUALITY_LABELS[quality]}</dt><dd>{result.decisionCounts[quality].toLocaleString()}</dd></div>
    )}</dl>;
    return <article className={`run-share-card run-share-style-${style}`} aria-label={`${result.modeLabel} run card`}>
        <PlayerRow profile={profile} showRank={false} label="Player identity" />
        <div className="run-share-body">
            <div className="run-share-meta"><strong>{result.modeLabel}</strong><span>{result.date}</span></div>
            <div className="run-share-highlight"><div className="run-share-outcome">{result.outcome}</div>
            <div className="run-share-score" style={{ fontSize: scoreSize }}>
                {score}
            </div>
            <span className="run-share-score-label">{result.scoreLabel}</span>
            <div className="run-share-best">{result.personalBest && <><Trophy size={15} aria-hidden="true" />Personal best</>}</div>
            </div>
            {style === 'decisions' && decisions}
            {result.stats.length > 0 && <dl className="run-share-stats">{result.stats.map(stat => {
                const Icon = STAT_ICONS[stat.icon];
                return <div key={stat.label}><dt><Icon size={23} aria-hidden="true" /><span>{stat.label}</span></dt><dd>{stat.value}</dd></div>;
            })}</dl>}
            {style !== 'decisions' && decisions}
        </div>
        <footer className="run-share-brand"><div><img src={`${import.meta.env.BASE_URL}knight.svg`} width="19" height="21" alt="" /><strong>Knightfall</strong></div>
            <span>{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
        </footer>
    </article>;
}

export function ShareRunDialog({ result, profile }: { result: ShareRunData; profile: PlayerProfile }) {
    const url = gameShareUrl();
    const cards = useMemo(() => CARD_STYLES.map(style => ({ ...style,
        backgroundColor: style.id === 'spotlight' ? '#16392f' : '#fafbf9',
        card: <RunShareCard result={result} profile={profile} url={url} style={style.id} />,
    })), [result, profile, url]);
    return <ShareCardDialog cards={cards} titleId="share-run-title" title="Share your run" subject="run"
        fileName={`${result.mode}-${result.id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48)}`}
        shareTitle={`Knightfall · ${result.modeLabel}`} text={shareRunText(result, profile.displayName, url)} />;
}
