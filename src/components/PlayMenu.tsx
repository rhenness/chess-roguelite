import { ChevronRight, Clock3, Coins, DoorOpen, Play, Trophy } from 'lucide-react';
import type { DailyDungeon } from '../game/daily';
import './DailyDungeon.css';
import './PlayMenu.css';

export const formatDailyDate = (day: string) => new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${day}T12:00:00Z`));
export function formatCountdown(expiresAt: number, now: number): string {
    const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60]
        .map(value => String(value).padStart(2, '0')).join(':');
}

export function PlayMenu({ daily, now, onRegular, onDaily, continuation, dailyRank, available }: {
    daily: DailyDungeon | undefined; now: number; available: boolean; dailyRank?: number;
    onRegular: () => void; onDaily: () => void;
    continuation?: { mode: 'regular' | 'daily'; level: number; onContinue: () => void };
}) {
    const status = daily?.attempt?.status;
    const score = daily?.attempt?.payout?.finalScore;
    return <section className="play-page main-menu" aria-labelledby="play-title">
        <div className="menu-identity">
            <img src={`${import.meta.env.BASE_URL}knight.svg`} alt="" width="72" height="80" />
            <h1 id="play-title" tabIndex={-1} data-page-focus>Knightfall</h1>
        </div>
        <div className="menu-actions">
            {continuation && <div className="menu-continue-slot">
                <button className="menu-continue menu-action" aria-label="Continue" aria-describedby="menu-run-context" onClick={continuation.onContinue}>
                    <Play size={22} aria-hidden="true" />
                    <span><strong>Continue</strong><span id="menu-run-context" className="menu-run-context">{continuation.mode === 'daily' ? 'Daily dungeon' : 'Regular run'} · Floor {continuation.level}</span></span>
                    <ChevronRight size={20} aria-hidden="true" />
                </button>
            </div>}
            <button className={`menu-new-run menu-action${continuation ? '' : ' menu-primary'}`} disabled={!available} onClick={onRegular}>
                <Play size={20} aria-hidden="true" /><strong>New run</strong><ChevronRight size={20} aria-hidden="true" />
            </button>
            <button className="menu-daily menu-action" aria-label="Daily dungeon" aria-describedby="menu-daily-summary" disabled={!daily} onClick={onDaily}>
                <DoorOpen size={24} aria-hidden="true" />
                <span className="menu-daily-content"><strong>Daily dungeon</strong>
                    <span id="menu-daily-summary" className="menu-daily-meta">
                        {score !== undefined ? <>{dailyRank !== undefined && <span aria-label={`Rank ${dailyRank}`}><Trophy size={14} aria-hidden="true" />#{dailyRank}</span>}<span aria-label={`Final score: ${score}`}>{score.toLocaleString()}</span></>
                            : status === 'active' ? <span>In progress</span> : status === 'finished' ? <span>Finished</span> : status === 'expired' ? <span>Expired</span>
                                : <span className="daily-reward-badge" aria-label="5 times coins"><Coins size={14} aria-hidden="true" />×5</span>}
                        {daily && <span aria-label="Time until daily dungeon closes"><Clock3 size={14} aria-hidden="true" />{now >= daily.expiresAt ? 'Closed' : formatCountdown(daily.expiresAt, now)}</span>}
                    </span>
                </span>
                <ChevronRight size={20} aria-hidden="true" />
            </button>
        </div>
        {!available && <p className="empty-state" role="status">No scored, playable floors.</p>}
    </section>;
}
