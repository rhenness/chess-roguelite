import { useMemo } from 'react';
import { Clock3, Flag, Heart, Layers3, Ticket } from 'lucide-react';
import { restoreDailyRun, type DailyDungeon } from '../game/daily';
import { PIECE_SETS, type PieceSetId } from '../game/pieceSets';
import type { UserProgression } from '../game/progression';
import type { ShareRunHandler } from '../game/shareRun';
import { DailyResults } from './DailyResults';
import { DailyRewards } from './DailyRewards';
import { PieceSetPicker } from './PieceSetPicker';
import { formatCountdown, formatDailyDate } from './PlayMenu';
import './DailyDungeonContent.css';

export function DailyDungeonPage({ dungeon, today, now, progression, defaultStartingHealth, selected, onSelected,
    onUpgrade, onEnter, onResume, onToday, rank, persisted, onShare }: {
    dungeon: DailyDungeon; today: string; now: number; progression: UserProgression; defaultStartingHealth: number;
    selected: PieceSetId; onSelected: (set: PieceSetId) => void; onUpgrade: (set: PieceSetId, button: HTMLButtonElement) => void;
    onEnter: () => void; onResume: () => void; onToday: () => void;
    rank?: number; persisted: boolean;
    onShare?: ShareRunHandler;
}) {
    const attempt = dungeon.attempt;
    const restored = useMemo(() => dungeon.attempt && dungeon.attempt.status !== 'expired' ? restoreDailyRun(dungeon) : null, [dungeon]);
    const closed = now >= dungeon.expiresAt;
    return <section className="daily-page" aria-labelledby="daily-page-title">
        <header className="page-heading">
            <h1 id="daily-page-title" tabIndex={-1} data-page-focus>Daily dungeon</h1>
            <div className="daily-page-meta"><span>{formatDailyDate(dungeon.day)}</span>
                <span className="daily-countdown"><Clock3 size={15} aria-hidden="true" />{closed ? 'Closed' : formatCountdown(dungeon.expiresAt, now)}</span></div>
        </header>
        <div className="daily-dungeon-content">
            <div className="daily-attempt-panel" data-page-scroll="dungeon">
                {!attempt && !closed ? <>
                    <div className="daily-entry-details"><span><Layers3 size={14} aria-hidden="true" />{dungeon.levels.length} floors</span><span><Ticket size={14} aria-hidden="true" />One attempt</span></div>
                    <DailyRewards />
                    <div className="daily-supplies"><strong>Daily supplies</strong><span>Triple Crown · King’s Guard · Healing Potion</span></div>
                    <h2 className="daily-set-heading">Choose your set</h2>
                    <PieceSetPicker compact showHeading={false} selectionOnly selectedSet={selected} onSelect={onSelected} onUpgrade={onUpgrade}
                        progression={progression} defaultStartingHealth={defaultStartingHealth} />
                </> : attempt?.status === 'active' && restored && !closed ? <>
                    <div className="daily-run-card">
                    <div className="daily-attempt-status"><Flag size={24} aria-hidden="true" /><h2>Dungeon in progress</h2><span>{PIECE_SETS[attempt.setId].name}</span></div>
                    <dl className="daily-progress-stats"><div><dt>Floor</dt><dd>{restored.levelIndex + 1} / {restored.levels.length}</dd></div><div><dt>Health</dt><dd><Heart size={15} aria-hidden="true" />{restored.health}</dd></div><div><dt>Score</dt><dd>{restored.score.toLocaleString()}</dd></div></dl>
                    <div className="daily-run-progress" role="progressbar" aria-label="Dungeon progress" aria-valuemin={1} aria-valuemax={restored.levels.length} aria-valuenow={restored.levelIndex + 1}>
                        {restored.levels.map((level, index) => <span key={level.id} className={index < restored.levelIndex ? 'past' : index === restored.levelIndex ? 'current' : 'future'} />)}
                    </div>
                    </div>
                </> : attempt?.status === 'finished' && restored && attempt.payout && rank !== undefined ? <>
                    <DailyResults run={restored} payout={attempt.payout} rank={rank} onShare={onShare} finishedAt={attempt.finishedAt ?? undefined} />
                </> : <div className="daily-attempt-status"><h2>{attempt?.status === 'expired' ? 'Attempt expired' : 'Dungeon closed'}</h2>{attempt?.status === 'expired' && <span>No rewards earned</span>}</div>}
                {!persisted && <p className="daily-storage-warning" role="status">Progress is only saved for this session. Browser storage is unavailable.</p>}
            </div>
            {(!attempt && !closed || attempt?.status === 'active' && !closed || dungeon.day !== today) && <div className="daily-action-bar">
                {!attempt && !closed && <button className="primary-small" onClick={onEnter}>Enter dungeon</button>}
                {attempt?.status === 'active' && !closed && <button className="primary-small" onClick={onResume}>Resume dungeon</button>}
                {dungeon.day !== today && <button className="primary-small" onClick={onToday}>Today's dungeon</button>}
            </div>}
        </div>
    </section>;
}
