import { useId, useMemo, useState, type ReactNode } from 'react';
import { Pencil, TrendingUp } from 'lucide-react';
import { profileAsset, type PlayerProfile } from '../game/playerProfile';
import { formatRunDate, profileStats, runDay, scoreHistoryPoints, type RunHistory, type RunMode, type RunRecord } from '../game/runHistory';
import { PlayerAvatar } from './PlayerAvatar';
import './ProfileOverview.css';

function ScoreHistory({ history, now }: { history: RunHistory; now: number }) {
    const [mode, setMode] = useState<RunMode>('regular');
    const [range, setRange] = useState<'30' | 'all'>('30');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const gradient = useId();
    const points = useMemo(() => scoreHistoryPoints(history, mode, range, now), [history, mode, range, now]);
    const selected = points.find(point => point.id === selectedId) ?? points.at(-1);
    const time = (point: RunRecord) => Date.parse(`${runDay(point)}T12:00:00Z`);
    const firstTime = points.length ? time(points[0]!) : 0;
    const lastTime = points.length ? time(points.at(-1)!) : 0;
    const ceiling = Math.max(100, Math.ceil(Math.max(...points.map(point => point.score), 0) / 100) * 100);
    const x = (point: RunRecord) => firstTime === lastTime ? 300 : 56 + (time(point) - firstTime) / (lastTime - firstTime) * 488;
    const y = (point: RunRecord) => 180 - point.score / ceiling * 148;
    const line = points.map(point => `${x(point)},${y(point)}`).join(' ');
    const modeLabel = mode === 'daily' ? 'Daily' : 'Regular';
    const cleared = (point: RunRecord) => point.result === 'complete' && point.floorsCompleted === point.floorsTotal;

    return <section className="profile-history" aria-labelledby="score-history-title">
        <div className="profile-section-heading"><h3 id="score-history-title">Score history</h3>
            <div className="profile-segmented" role="group" aria-label="History period">
                {(['30', 'all'] as const).map(value => <button type="button" key={value} aria-pressed={range === value}
                    onClick={() => setRange(value)}>{value === '30' ? '30 days' : 'All time'}</button>)}
            </div>
        </div>
        <div className="profile-segmented profile-mode" role="group" aria-label="Score mode">
            {(['daily', 'regular'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value}
                onClick={() => setMode(value)}>{value === 'daily' ? 'Daily' : 'Regular'}</button>)}
        </div>
        <p className="profile-history-description">{mode === 'regular' ? 'Your best finished run each day.' : 'Your score from each daily attempt.'}</p>
        {!points.length ? <div className="profile-history-empty"><TrendingUp size={34} aria-hidden="true" />
            <strong>{history.runs.some(run => run.mode === mode) ? 'No scores in the last 30 days' : 'Your story starts here'}</strong>
            <p>{history.runs.some(run => run.mode === mode) ? 'Choose All time to see your earlier results.'
                : `Finish a ${mode === 'daily' ? 'daily' : 'regular'} run to start your score history.`}</p>
        </div> : <>
            <svg className="profile-score-chart" viewBox="0 0 560 226" role="group" aria-label={`${modeLabel} score history chart`}>
                <title>{modeLabel} scores over time</title>
                <desc>Dates run from left to right; scores increase upward. Select a point to view its run details.</desc>
                <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#41665b" stopOpacity="0.20" />
                    <stop offset="100%" stopColor="#41665b" stopOpacity="0.02" />
                </linearGradient></defs>
                {[0, ceiling / 2, ceiling].map(tick => <g key={tick}>
                    <line x1="56" x2="544" y1={180 - tick / ceiling * 148} y2={180 - tick / ceiling * 148} className="profile-chart-grid" />
                    <text x="46" y={184 - tick / ceiling * 148} textAnchor="end">{tick.toLocaleString(undefined, { notation: 'compact' })}</text>
                </g>)}
                <text x="56" y="15">Score</text>
                {points.length > 1 && <>
                    <path d={`M ${x(points[0]!)},180 L ${line} L ${x(points.at(-1)!)},180 Z`} fill={`url(#${gradient})`} />
                    <polyline points={line} className="profile-chart-line" />
                </>}
                {points.map(point => <g key={point.id} className="profile-chart-point" role="button" tabIndex={0} aria-pressed={selected?.id === point.id}
                    aria-label={`${formatRunDate(point)}: ${point.score.toLocaleString()} points`}
                    onMouseEnter={() => setSelectedId(point.id)} onFocus={() => setSelectedId(point.id)} onClick={() => setSelectedId(point.id)}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(point.id); } }}>
                    <title>{formatRunDate(point)}: {point.score.toLocaleString()} points</title>
                    <circle cx={x(point)} cy={y(point)} r="16" fill="transparent" stroke="none" />
                    <circle cx={x(point)} cy={y(point)} r={selected?.id === point.id ? 6 : 4.5} />
                </g>)}
                <text x={x(points[0]!)} y="208" textAnchor={points.length === 1 ? 'middle' : 'start'}>{formatRunDate(points[0]!)}</text>
                {points.length > 1 && <text x={x(points.at(-1)!)} y="208" textAnchor="end">{formatRunDate(points.at(-1)!)}</text>}
            </svg>
            {selected && <div className="profile-chart-details" role="status" aria-label="Selected run">
                <div><span>{formatRunDate(selected)}</span><strong>{selected.score.toLocaleString()} points</strong></div>
                <div><span>{selected.floorsCompleted} / {selected.floorsTotal} floors</span>
                    <strong>{cleared(selected) ? 'Cleared' : selected.result === 'defeat' ? 'Defeat' : 'Finished'}</strong></div>
            </div>}
        </>}
    </section>;
}

export function ProfileOverview({ profile, history, onEdit, now, asPage = false, children }: {
    profile: PlayerProfile; history: RunHistory; onEdit: () => void; now: number; asPage?: boolean; children?: ReactNode;
}) {
    const stats = useMemo(() => profileStats(history), [history]);
    return <div className="profile-overview">
        <header className="profile-overview-header">{asPage ? <h1 id="profile-page-title" tabIndex={-1} data-page-focus>Your profile</h1>
            : <h2 id="profile-title">Your profile</h2>}
            <div className="profile-identity" style={{ backgroundImage: `url("${profileAsset('banners', profile.bannerId)}")` }}>
                <PlayerAvatar profile={profile} />
                <strong>{profile.displayName}</strong>
                <button className="profile-edit" onClick={onEdit} autoFocus data-modal-focus><Pencil size={15} aria-hidden="true" />Edit profile</button>
            </div>
        </header>
        <div className="profile-overview-body" data-page-scroll="profile">
            <dl className="profile-stat-grid" aria-label="Lifetime stats">
                {([['Best regular score', stats.bestRegular], ['Best daily score', stats.bestDaily]] as const).map(([label, best]) =>
                    <div key={label}><dt>{label}</dt><dd>{best ? best.score.toLocaleString() : 'No runs yet'}</dd>
                        {best && <span>{formatRunDate(best)}</span>}</div>)}
                {children}
                <div><dt>Runs completed</dt><dd>{stats.runsCompleted.toLocaleString()}</dd><span>Every floor cleared</span></div>
                <div><dt>Total checkmates</dt><dd>{stats.checkmates.toLocaleString()}</dd><span>Across finished runs</span></div>
            </dl>
            <ScoreHistory history={history} now={now} />
        </div>
    </div>;
}
