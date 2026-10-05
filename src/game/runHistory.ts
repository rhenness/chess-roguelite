import type { PayoutResult } from './multipliers';
import type { RunState } from './run';

export const RUN_HISTORY_STORAGE_KEY = 'knightfall.run-history.v1';
export type RunMode = 'regular' | 'daily';

export interface RunRecord {
    id: string;
    mode: RunMode;
    finishedAt: number;
    dailyDay?: string;
    score: number;
    floorsCompleted: number;
    floorsTotal: number;
    checkmates: number;
    result: 'complete' | 'defeat';
}

export interface RunHistory { version: 1; runs: RunRecord[] }
export const initialRunHistory = (): RunHistory => ({ version: 1, runs: [] });

const nonnegative = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const validDay = (value: unknown): value is string => typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;

function isRunRecord(value: unknown): value is RunRecord {
    if (!value || typeof value !== 'object') return false;
    const record = value as RunRecord;
    return typeof record.id === 'string' && !!record.id.trim()
        && ['regular', 'daily'].includes(record.mode) && nonnegative(record.finishedAt)
        && !Number.isNaN(new Date(record.finishedAt).getTime()) && nonnegative(record.score)
        && nonnegative(record.floorsTotal) && record.floorsTotal > 0
        && nonnegative(record.floorsCompleted) && record.floorsCompleted <= record.floorsTotal
        && nonnegative(record.checkmates) && record.checkmates <= record.floorsCompleted
        && ['complete', 'defeat'].includes(record.result)
        && (record.mode !== 'daily' || validDay(record.dailyDay));
}

/** Union saved records without duplicating a run ID or the same daily attempt. */
export function mergeRunHistory(history: RunHistory, other: RunHistory): RunHistory {
    const ids = new Set(history.runs.map(run => run.id));
    const days = new Set(history.runs.filter(run => run.mode === 'daily').map(run => run.dailyDay));
    const added: RunRecord[] = [];
    for (const run of other.runs) {
        if (ids.has(run.id) || (run.mode === 'daily' && days.has(run.dailyDay))) continue;
        ids.add(run.id);
        if (run.mode === 'daily') days.add(run.dailyDay);
        added.push(run);
    }
    return added.length ? { version: 1, runs: [...history.runs, ...added].sort((a, b) => a.finishedAt - b.finishedAt) } : history;
}

export function loadRunHistory(): RunHistory {
    try {
        const value = JSON.parse(window.localStorage.getItem(RUN_HISTORY_STORAGE_KEY) ?? 'null');
        if (value?.version === 1 && Array.isArray(value.runs)) {
            return mergeRunHistory(initialRunHistory(), { version: 1, runs: value.runs.filter(isRunRecord) });
        }
    } catch { /* Keep the profile available when storage is blocked or damaged. */ }
    return initialRunHistory();
}

export function saveRunHistory(history: RunHistory): boolean {
    try { window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(history)); return true; }
    catch { return false; }
}

function countCheckmates(run: RunState): number {
    let count = 0;
    for (const level of run.levels) {
        if (!run.outcomes.some(outcome => outcome.id === level.id && outcome.status === 'completed')) continue;
        let node = level.root;
        for (const move of run.history.filter(move => move.levelId === level.id)) {
            if (node.kind !== 'decision') break;
            const choice = node.choices.find(choice => choice.playerMove.uci === move.playerMove.uci);
            if (!choice) break;
            node = choice.next;
        }
        if (node.kind === 'terminal' && node.reason === 'checkmate'
            && node.result === level.playerColor && node.decisionsTaken > 0) count++;
    }
    return count;
}

export function recordRunResult(history: RunHistory, run: RunState, payout: PayoutResult, finishedAt = Date.now()): RunHistory {
    if (run.phase !== 'finished' || !run.result || payout.baseScore !== run.score) return history;
    const record: RunRecord = {
        id: run.id, mode: run.daily ? 'daily' : 'regular', finishedAt,
        ...(run.daily ? { dailyDay: run.daily.day } : {}),
        score: payout.finalScore, floorsCompleted: run.levelsCompleted, floorsTotal: run.levels.length,
        checkmates: countCheckmates(run), result: run.result,
    };
    if (!isRunRecord(record)) return history;
    return mergeRunHistory(history, { version: 1, runs: [record] });
}

export function profileStats(history: RunHistory) {
    const best = (mode: RunMode) => history.runs.filter(run => run.mode === mode)
        .reduce<RunRecord | null>((highest, run) => !highest || run.score > highest.score ? run : highest, null);
    return {
        bestRegular: best('regular'), bestDaily: best('daily'),
        runsCompleted: history.runs.filter(run => run.result === 'complete' && run.floorsCompleted === run.floorsTotal).length,
        checkmates: history.runs.reduce((total, run) => total + run.checkmates, 0),
    };
}

function localDay(time: number): string {
    const date = new Date(time);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const runDay = (run: RunRecord): string => run.mode === 'daily' ? run.dailyDay! : localDay(run.finishedAt);

/** Keep a daily attempt or the best regular result on each played date. */
export function scoreHistoryPoints(history: RunHistory, mode: RunMode, range: '30' | 'all', now = Date.now()): RunRecord[] {
    const cutoffDate = new Date(now);
    if (mode === 'daily') cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 29);
    else cutoffDate.setDate(cutoffDate.getDate() - 29);
    const cutoff = mode === 'daily' ? cutoffDate.toISOString().slice(0, 10)
        : localDay(cutoffDate.getTime());
    const perDay = new Map<string, RunRecord>();
    for (const run of history.runs) {
        if (run.mode !== mode) continue;
        const day = runDay(run);
        if (range === '30' && day < cutoff) continue;
        const previous = perDay.get(day);
        if (!previous || run.score > previous.score) perDay.set(day, run);
    }
    return [...perDay.values()].sort((a, b) => runDay(a).localeCompare(runDay(b)));
}

export const formatRunDate = (run: RunRecord): string => new Intl.DateTimeFormat(undefined,
    { year: 'numeric', month: 'short', day: 'numeric', ...(run.mode === 'daily' ? { timeZone: 'UTC' } : {}) })
    .format(run.mode === 'daily' ? new Date(`${run.dailyDay}T12:00:00Z`) : new Date(run.finishedAt));
