import type { EndlessRecord } from './types';

export function EndlessRecords({ records }: { records: readonly EndlessRecord[] }) {
    const best = (mode: EndlessRecord['mode']) => records.filter(record => record.mode === mode)
        .reduce<EndlessRecord | null>((top, record) => !top || record.score > top.score ? record : top, null);
    return <>{(['standard', 'hardcore'] as const).map(mode => {
            const record = best(mode);
            return <div key={mode}><dt>{mode === 'standard' ? 'Best Standard score' : 'Best Hardcore streak'}</dt>
                <dd>{record ? record.score.toLocaleString() : '—'}{record && <small>{mode === 'standard' ? ' points' : ' moves'}</small>}</dd>
                {record && <span>{record.longestStreak} streak · {record.gamesCompleted} games</span>}
            </div>;
        })}</>;
}
