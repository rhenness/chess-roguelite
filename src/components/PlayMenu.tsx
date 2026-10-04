import { Clock3, DoorOpen, Play } from 'lucide-react';
import type { DailyDungeon } from '../game/daily';
import './DailyDungeon.css';

export const formatDailyDate = (day: string) => new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${day}T12:00:00Z`));
export function formatCountdown(expiresAt: number, now: number): string {
    const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60]
        .map(value => String(value).padStart(2, '0')).join(':');
}

export function PlayMenu({ daily, now, onRegular, onDaily, onResumeRegular, onResumeDaily, available }: {
    daily: DailyDungeon | undefined; now: number; available: boolean;
    onRegular: () => void; onDaily: () => void;
    onResumeRegular?: () => void; onResumeDaily: () => void;
}) {
    const status = daily?.attempt?.status;
    return <section className="play-page" aria-labelledby="play-title">
        <h1 id="play-title" tabIndex={-1} data-page-focus>Play</h1>
        <div className="mode-options">
            <article className="mode-option">
                <Play size={28} aria-hidden="true" />
                <h2><button className="mode-select" disabled={!available} onClick={onRegular}>Regular run</button></h2>
                {onResumeRegular && <div className="mode-actions"><button className="primary-small" onClick={onResumeRegular}>Resume regular run</button></div>}
            </article>
            <article className="mode-option daily-mode-option">
                <DoorOpen size={28} aria-hidden="true" />
                <h2><button className="mode-select" disabled={!daily} onClick={onDaily}>Daily dungeon</button></h2>
                <div className="mode-meta">
                    <span className="daily-reward-badge">5× coins</span>
                    {daily && <span><Clock3 size={14} aria-hidden="true" />{formatCountdown(daily.expiresAt, now)}</span>}
                    {status === 'finished' && <span>Attempt finished</span>}
                    {status === 'expired' && <span>Attempt expired</span>}
                </div>
                {status === 'active' && <div className="mode-actions"><button className="primary-small" onClick={onResumeDaily}>Resume dungeon</button></div>}
            </article>
        </div>
        {!available && <p className="empty-state" role="status">No scored, playable levels.</p>}
    </section>;
}
