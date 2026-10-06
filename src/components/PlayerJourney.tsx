import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { profileAsset, type PlayerProfile } from '../game/playerProfile';
import { LEVELS_PER_TIER, PLAYER_LEVEL_THRESHOLDS, PLAYER_TIERS, type playerLevelProgress } from '../game/playerLeveling';
import { journeyScenery, JOURNEY_PALETTES } from './playerJourneyArt';
import './PlayerJourney.css';

type Progress = ReturnType<typeof playerLevelProgress>;
const POSITIONS = [[96, 512], [167, 468], [238, 424], [309, 380], [238, 290], [309, 246], [380, 202], [451, 158]] as const;
const SHOOTING_STARS = [
    { x: 258, y: 62, duration: 16, delay: 2 },
    { x: 432, y: 282, duration: 23, delay: 9 },
] as const;

function JourneyTile({ level, x, y, progress, profile, palette, selected, onSelect }: {
    level: number; x: number; y: number; progress: Progress; profile: PlayerProfile;
    palette: readonly string[]; selected: boolean; onSelect: (level: number) => void;
}) {
    const current = level === progress.level;
    const reached = level < progress.level;
    const [top, light, mid, dark, gleam] = current || reached
        ? ['#c8dc99', '#92b972', '#628c59', '#3a6548', '#e8edbe'] : palette;
    const remaining = Math.max(0, PLAYER_LEVEL_THRESHOLDS[level - 1]! - progress.totalXp);
    const status = current ? 'Current level' : reached ? 'Reached' : `${remaining.toLocaleString()} XP to go`;
    return <g className="journey-tile" transform={`translate(${x} ${y})`} role="button" tabIndex={0}
        data-player-level={level} aria-label={`Level ${level}, ${status}`} aria-current={current ? 'step' : undefined}
        aria-pressed={selected} onClick={() => onSelect(level)} onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(level); }
        }} onFocus={event => event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })}>
        <title>{`Level ${level} · ${status}`}</title>
        <rect x="-50" y="-30" width="100" height="110" fill="transparent" />
        <ellipse className={current ? 'journey-current-shadow' : undefined} cy="75" rx="28" ry="8" fill="#04181044" />
        <g className={current ? 'journey-current-float' : undefined}>
            {current && <ellipse cy="12" rx="65" ry="56" fill={`url(#journey-pawn-glow-${progress.tierIndex})`} />}
            <polygon points="-42 0,0 25,0 65,-28 29" fill={light} />
            <polygon points="0 25,42 0,28 29,0 65" fill={mid} />
            <polygon points="-42 0,-28 29,0 65,-12 24" fill={mid} opacity=".4" />
            <polygon points="12 24,28 29,0 65" fill={dark} opacity=".5" />
            <polygon className="journey-tile-top" points="0 -25,42 0,0 25,-42 0" fill={top}
                stroke={selected ? '#f6dc9d' : gleam} strokeWidth={current || selected ? 2.5 : 1} />
            <polygon points="0 -19,32 0,0 19,-32 0" fill={light} opacity=".35" />
            {reached ? <path d="M -11 -1 l 7 7 l 16 -13" fill="none" stroke="#edf5dc" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
                : !current && <><ellipse cy="-2" rx="20" ry="14" fill="#254e4699" /><text y="4" textAnchor="middle" className="journey-number">{level}</text></>}
            {current && <g className="journey-pawn" aria-hidden="true">
                <ellipse cy="-5" rx="21" ry="7" fill="#3a633655" /><ellipse cy="-11" rx="20" ry="8" fill="#e3e8bc" />
                <path d="M -15 -14 Q -8 -23 -8 -38 L 8 -38 Q 8 -23 15 -14Z" fill="#c7d991" />
                <ellipse cy="-39" rx="11" ry="4" fill="#e5ecc7" /><circle cy="-52" r="11" fill="#d5e5aa" />
                <circle cy="-95" r="20" fill="#e5e4c5" /><circle cy="-95" r="16" fill={profile.avatarBackgroundColor} />
                <image href={profileAsset('avatars', profile.avatarId)} x="-13" y="-108" width="26" height="26" />
                <path d="M -5 -74 l 5 6 l 5 -6" fill="#e5e4c5" />
                <text x="23" y="17" textAnchor="middle" className="journey-current-number">{level}</text>
            </g>}
        </g>
    </g>;
}

export const PlayerJourney = memo(function PlayerJourney({ progress, profile }: { progress: Progress; profile: PlayerProfile }) {
    const scroll = useRef<HTMLDivElement>(null);
    const [selected, setSelected] = useState<number | null>(null);
    const [returnDirection, setReturnDirection] = useState<'up' | 'down' | null>(null);
    const updateReturnDirection = useCallback(() => {
        const region = scroll.current;
        const pawn = region?.querySelector('.journey-pawn');
        if (!region || !pawn) return;
        const bounds = pawn.getBoundingClientRect();
        const viewport = region.getBoundingClientRect();
        if (!viewport.height) { setReturnDirection(null); return; }
        const center = (bounds.top + bounds.bottom) / 2;
        setReturnDirection(center < viewport.top + 14 ? 'up' : center > viewport.bottom - 14 ? 'down' : null);
    }, []);
    const returnToPlayer = useCallback((smooth = true) => {
        const region = scroll.current;
        const pawn = region?.querySelector('.journey-pawn');
        if (!region || !pawn) return;
        const bounds = pawn.getBoundingClientRect();
        const viewport = region.getBoundingClientRect();
        const top = region.scrollTop + (bounds.top + bounds.bottom) / 2 - viewport.top - region.clientHeight / 2;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (region.scrollTo) region.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduce ? 'smooth' : 'instant' });
        else region.scrollTop = Math.max(0, top);
        updateReturnDirection();
    }, [updateReturnDirection]);
    useLayoutEffect(() => {
        const position = () => {
            const region = scroll.current;
            const area = region?.querySelector<HTMLElement>(`[data-journey-tier="${progress.tierIndex}"]`);
            const pawn = region?.querySelector('.journey-pawn');
            if (!region || !area || !pawn) return;
            region.scrollTop = Math.max(0, area.offsetTop + (area.offsetHeight - region.clientHeight) / 2);
            const bounds = pawn.getBoundingClientRect();
            const viewport = region.getBoundingClientRect();
            const center = (bounds.top + bounds.bottom) / 2;
            if (viewport.height && (center < viewport.top + 14 || center > viewport.bottom - 14)) returnToPlayer(false);
            else updateReturnDirection();
        };
        position();
        setSelected(null);
        const resize = position;
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
        if (scroll.current) observer?.observe(scroll.current);
        window.addEventListener('resize', resize);
        return () => { observer?.disconnect(); window.removeEventListener('resize', resize); };
    }, [progress.level, progress.tierIndex, returnToPlayer, updateReturnDirection]);

    const selectedTier = selected === null ? null : PLAYER_TIERS[Math.floor((selected - 1) / LEVELS_PER_TIER)];
    const remaining = selected === null ? 0 : Math.max(0, PLAYER_LEVEL_THRESHOLDS[selected - 1]! - progress.totalXp);
    return <section className="player-journey" aria-label="Player level journey">
        <div className="journey-scroll" ref={scroll} role="region" aria-label="Scroll through player levels" tabIndex={0}
            onKeyDown={event => { if (event.key === 'Escape') setSelected(null); }}
            onScroll={updateReturnDirection}>
            {[...PLAYER_TIERS].reverse().map((tier, reverseIndex) => {
                const tierIndex = PLAYER_TIERS.length - 1 - reverseIndex;
                const base = tierIndex * LEVELS_PER_TIER;
                const palette = JOURNEY_PALETTES[tierIndex]!;
                const next = JOURNEY_PALETTES[Math.min(7, tierIndex + 1)]!;
                return <div className="journey-area" data-journey-tier={tierIndex} key={tier}>
                    <svg viewBox="0 0 640 600" role="group" aria-label={`${tier}, levels ${base + 1} through ${base + 8}`}>
                        <defs>
                            <radialGradient id={`journey-ambient-${tierIndex}`}><stop stopColor="#adc892" stopOpacity=".12" /><stop offset="1" stopColor="#adc892" stopOpacity="0" /></radialGradient>
                            <radialGradient id={`journey-pawn-glow-${tierIndex}`}><stop stopColor="#d3dd8e" stopOpacity=".35" /><stop offset="1" stopColor="#d3dd8e" stopOpacity="0" /></radialGradient>
                            <linearGradient id={`journey-star-trail-${tierIndex}`} x1="-28" y1="-14" x2="0" y2="0" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#d7e1b8" stopOpacity="0" /><stop offset="1" stopColor="#e8edce" stopOpacity=".8" />
                            </linearGradient>
                        </defs>
                        <ellipse aria-hidden="true" cx="321" cy="304" rx="292" ry="270" fill={`url(#journey-ambient-${tierIndex})`} />
                        <g className="journey-shooting-stars" aria-hidden="true">
                            {SHOOTING_STARS.map(({ x, y, duration, delay }, i) => <g key={i} transform={`translate(${x} ${y})`}>
                                <g className="journey-shooting-star" style={{ animationDuration: `${duration}s`, animationDelay: `${delay + tierIndex * .7}s` }}>
                                    <path d="M -28 -14 L 0 0" fill="none" stroke={`url(#journey-star-trail-${tierIndex})`} strokeWidth="1.6" strokeLinecap="round" />
                                    <circle r="1.5" fill="#edf2d6" />
                                    <path d="M -3 0 H 3 M 0 -3 V 3" stroke="#edf2d6" strokeWidth=".8" />
                                </g>
                            </g>)}
                        </g>
                        <g aria-hidden="true" dangerouslySetInnerHTML={{ __html: journeyScenery(palette, next) }} />
                        <g aria-hidden="true">
                            <path d="M 96 512 L 167 468 L 238 424 L 309 380 L 238 290 L 309 246 L 380 202 L 451 158 L 522 114" fill="none" stroke="#aebc9028" strokeWidth="2" strokeDasharray="2 12" />
                            <text x="522" y="43" textAnchor="middle" className="journey-gate-label" fill={next[4]}>{PLAYER_TIERS[tierIndex + 1] ?? 'Legend'}</text>
                            <text x="522" y="61" textAnchor="middle" className="journey-gate-level">{tierIndex < 7 ? `Lv. ${base + 9}` : 'Lv. 64'}</text>
                            <g transform="translate(522 96)"><path d="M -17 25 v -30 a 17 17 0 0 1 34 0 v 30" fill="#203d32" stroke={next[0]} strokeWidth="6" /><path d="M -23 31 h 46" stroke={next[4]} strokeWidth="5" /><path d="M -7 23 v -24 a 7 7 0 0 1 14 0 v 24" fill="#172c27" /><circle cy="-12" r="3" fill={next[4]} /></g>
                            <text x="53" y="574" className="journey-tier-name">{tier.toUpperCase()}</text>
                        </g>
                        {[...POSITIONS].map(([x, y], i) => ({ x, y, level: base + i + 1 })).reverse().map(tile =>
                            <JourneyTile key={tile.level} {...tile} progress={progress} profile={profile} palette={palette}
                                selected={selected === tile.level} onSelect={setSelected} />)}
                    </svg>
                </div>;
            })}
        </div>
        {returnDirection && <button type="button" className={`journey-return journey-return-${returnDirection}`}
            aria-label="Return to current level" title={`Level ${progress.level}`} onClick={() => { setSelected(null); returnToPlayer(); }}>
            {returnDirection === 'up' ? <ChevronUp size={21} aria-hidden="true" /> : <ChevronDown size={21} aria-hidden="true" />}
        </button>}
        {selected !== null && <aside className="journey-detail" aria-live="polite">
            <button type="button" aria-label="Close level details" onClick={() => setSelected(null)}><X size={15} aria-hidden="true" /></button>
            <span>{selectedTier}</span><strong>Level {selected}</strong>
            <span>{selected < progress.level ? 'Reached' : selected === progress.level ? 'Current level' : `${remaining.toLocaleString()} XP to go`}</span>
        </aside>}
    </section>;
});
