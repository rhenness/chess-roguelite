import type { EndlessRecord } from '../features/endless/types';
import { profileStats, type RunHistory } from './runHistory';

export interface ProfileHighScore {
    mode: 'Regular' | 'Dungeon' | 'Endless' | 'Hardcore';
    label: string;
    score: number | null;
    unit: 'points' | 'moves';
}

export function profileHighScores(history: RunHistory, endlessRecords: readonly EndlessRecord[]): ProfileHighScore[] {
    const stats = profileStats(history);
    const bestEndless = (mode: EndlessRecord['mode']) => endlessRecords.filter(record => record.mode === mode)
        .reduce<EndlessRecord | null>((best, record) => !best || record.score > best.score ? record : best, null);
    return [
        { mode: 'Regular', label: 'Best regular score', score: stats.bestRegular?.score ?? null, unit: 'points' },
        { mode: 'Dungeon', label: 'Best Dungeon score', score: stats.bestDaily?.score ?? null, unit: 'points' },
        { mode: 'Endless', label: 'Best Endless score', score: bestEndless('standard')?.score ?? null, unit: 'points' },
        { mode: 'Hardcore', label: 'Best Hardcore streak', score: bestEndless('hardcore')?.score ?? null, unit: 'moves' },
    ];
}

export function shareProfileText(displayName: string, highScores: readonly ProfileHighScore[], url: string): string {
    return [`Knightfall · ${displayName}`, ...highScores.map(({ mode, score, unit }) =>
        `${mode}: ${score === null ? '—' : `${score.toLocaleString()} ${unit}`}`), url].join('\n');
}
