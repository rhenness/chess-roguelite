import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Clock3, Coins, DoorOpen, Infinity, LockKeyhole, Play, Trophy } from 'lucide-react';
import type { DailyDungeon } from '../game/daily';
import type { SkillTier } from '../config/difficulty';
import { SkillTierPicker } from './SkillTierPicker';
import './DailyDungeon.css';
import './PlayMenu.css';

const MENU_SUBTITLES = [
    'One more floor. One more fork.',
    'Trust your knight. Mostly.',
    'Every pawn has a dark side.',
    'Check yourself before you wreck yourself.',
    'The dungeon plays for keeps.',
    'Good knights. Bad decisions.',
    'Your next blunder awaits.',
    'Small board. Big consequences.',
    'Fortune favors the fork.',
    'Keep calm and castle on.',
    'No pressure. Just your entire run.',
    'A horse walks into a dungeon...',
];

export const formatDailyDate = (day: string) => new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${day}T12:00:00Z`));
export function formatCountdown(expiresAt: number, now: number): string {
    const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60]
        .map(value => String(value).padStart(2, '0')).join(':');
}

export function PlayMenu({ daily, now, onRegular, onDaily, onEndless, regularFloor, dailyFloor, endlessMove, dailyRank, available, locked = false, skillSelection }: {
    daily: DailyDungeon | undefined; now: number; available: boolean; dailyRank?: number;
    locked?: boolean;
    onRegular: () => void; onDaily: () => void;
    onEndless: () => void; endlessMove?: number;
    regularFloor?: number; dailyFloor?: number;
    skillSelection?: {
        value: SkillTier | null; onChange: (tier: SkillTier) => void; onContinue: () => void; available: boolean;
    };
}) {
    const [subtitle] = useState(() => MENU_SUBTITLES[Math.floor(Math.random() * MENU_SUBTITLES.length)]);
    const title = useRef<HTMLHeadingElement>(null);
    const choosingSkill = !!skillSelection;
    useEffect(() => { if (!choosingSkill) title.current?.focus({ preventScroll: true }); }, [choosingSkill]);
    const status = daily?.attempt?.status;
    const score = daily?.attempt?.payout?.finalScore;
    return <section className="play-page main-menu" aria-labelledby="play-title">
        <div className="menu-identity">
            <img src={`${import.meta.env.BASE_URL}knight.svg`} alt="" width="72" height="80" />
            <h1 id="play-title" ref={title} tabIndex={-1} data-page-focus>Knightfall</h1>
            <p id="play-subtitle" className="menu-subtitle">{choosingSkill ? 'Choose your skill level' : subtitle}</p>
        </div>
        {skillSelection ? <div className="menu-skill-selection">
            <SkillTierPicker labelledBy="play-subtitle" value={skillSelection.value} onChange={skillSelection.onChange} />
            {skillSelection.value && !skillSelection.available && <p className="empty-state" role="status">No floors are available for this skill level yet. Choose another skill level.</p>}
            <button className="menu-action menu-primary" disabled={!skillSelection.value || !skillSelection.available} onClick={skillSelection.onContinue}>
                <strong>Continue</strong><ChevronRight size={20} aria-hidden="true" />
            </button>
        </div> : <><div className="menu-actions">
            <button className="menu-regular menu-action menu-primary" aria-label="Regular run" aria-describedby={regularFloor !== undefined ? 'menu-regular-status' : undefined} disabled={!available} onClick={onRegular}>
                <Play size={20} aria-hidden="true" /><span className="menu-daily-content"><strong>Regular run</strong>
                    {regularFloor !== undefined && <span id="menu-regular-status" className="menu-daily-meta">In progress · Floor {regularFloor}</span>}
                </span><ChevronRight size={20} aria-hidden="true" />
            </button>
            <button className="menu-daily menu-action" aria-label="Daily dungeon" aria-describedby={locked ? 'menu-unlock-hint' : 'menu-daily-summary'} disabled={locked || !daily} onClick={onDaily}>
                <DoorOpen size={24} aria-hidden="true" />
                <span className="menu-daily-content"><strong>Daily dungeon</strong>
                    <span id="menu-daily-summary" className="menu-daily-meta">
                        {score !== undefined ? <>{dailyRank !== undefined && <span aria-label={`Rank ${dailyRank}`}><Trophy size={14} aria-hidden="true" />#{dailyRank}</span>}<span aria-label={`Final score: ${score}`}>{score.toLocaleString()}</span></>
                            : status === 'active' ? <span>In progress{dailyFloor !== undefined && ` · Floor ${dailyFloor}`}</span> : status === 'finished' ? <span>Finished</span> : status === 'expired' ? <span>Unavailable</span>
                                : <span className="daily-reward-badge" aria-label="5 times coins"><Coins size={14} aria-hidden="true" />×5</span>}
                        {daily && <span aria-label="Time until daily dungeon resets"><Clock3 size={14} aria-hidden="true" />{formatCountdown(daily.expiresAt, now)}</span>}
                    </span>
                </span>
                {locked ? <LockKeyhole size={20} aria-hidden="true" /> : <ChevronRight size={20} aria-hidden="true" />}
            </button>
            <button className="menu-action menu-endless" aria-label="Endless" aria-describedby={locked ? 'menu-unlock-hint' : endlessMove !== undefined ? 'menu-endless-status' : undefined} disabled={locked} onClick={onEndless}>
                <Infinity size={24} aria-hidden="true" /><span className="menu-daily-content"><strong>Endless</strong>
                    {endlessMove !== undefined && <span id="menu-endless-status" className="menu-daily-meta">In progress · Move {endlessMove}</span>}</span>
                {locked ? <LockKeyhole size={20} aria-hidden="true" /> : <ChevronRight size={20} aria-hidden="true" />}
            </button>
        </div>
        {locked && <p id="menu-unlock-hint" className="menu-unlock-hint">Finish your first regular run to unlock more modes and navigation.</p>}
        {!available && <p className="empty-state" role="status">No scored, playable floors.</p>}
        </>}
    </section>;
}
