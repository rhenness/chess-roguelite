import type { EndlessSave, EndlessSession } from '../features/endless/types';
import type { UserProgression } from './progression';
import type { RunState } from './run';
import type { RunHistory } from './runHistory';

export const PLAYER_LEVELING_STORAGE_KEY = 'knightfall.player-leveling.v1';
export const RUN_XP = 100;
export const LEVELS_PER_TIER = 8;
export const MAX_PLAYER_LEVEL = 64;
export const PLAYER_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Crown', 'Legend'] as const;
export type PlayerTier = typeof PLAYER_TIERS[number];

/** The cost of leaving a level. Keep v1 thresholds stable for existing players. */
export function playerLevelCost(level: number): number {
    if (level >= MAX_PLAYER_LEVEL) return 0;
    return level <= 2 ? 50 : (Math.floor((level - 1) / LEVELS_PER_TIER) + 1) * 100;
}

export const PLAYER_LEVEL_THRESHOLDS: readonly number[] = (() => {
    const thresholds = [0];
    for (let level = 1; level < MAX_PLAYER_LEVEL; level++) {
        thresholds.push(thresholds[level - 1]! + playerLevelCost(level));
    }
    return thresholds;
})();

/** XP and its source are saved together. Endless receipts grow as moves are banked. */
export interface PlayerLeveling {
    version: 1;
    rulesVersion: 1;
    legacyXp: number;
    legacyDailyThrough: string | null;
    receipts: Record<string, number>;
}

export const initialPlayerLeveling = (): PlayerLeveling => ({
    version: 1, rulesVersion: 1, legacyXp: 0, legacyDailyThrough: null, receipts: {},
});
const nonnegative = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const safeAdd = (a: number, b: number) => Math.min(Number.MAX_SAFE_INTEGER, a + b);
const validDay = (value: unknown): value is string => typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
const runReceipt = (run: Pick<RunState, 'id' | 'daily'>) => run.daily ? `daily:${run.daily.day}` : `run:${run.id}`;

export function totalPlayerXp(state: PlayerLeveling): number {
    return Object.values(state.receipts).reduce(safeAdd, state.legacyXp);
}

export function playerLevelProgress(totalXp: number) {
    const xp = nonnegative(totalXp) ? totalXp : 0;
    let index = 0;
    while (index < MAX_PLAYER_LEVEL - 1 && xp >= PLAYER_LEVEL_THRESHOLDS[index + 1]!) index++;
    const level = index + 1;
    const tierIndex = Math.floor(index / LEVELS_PER_TIER);
    const cost = playerLevelCost(level);
    const earned = cost ? xp - PLAYER_LEVEL_THRESHOLDS[index]! : 0;
    return { level, tierIndex, tier: PLAYER_TIERS[tierIndex]!, totalXp: xp, earned, cost,
        fraction: cost ? earned / cost : 1, atMaxLevel: level === MAX_PLAYER_LEVEL };
}

/** Reaching the available run's end always gives 100, regardless of score or difficulty. */
export function dungeonRunXp(run: RunState): number {
    if (run.phase !== 'finished' || !run.result || !run.levels.length) return 0;
    if (run.result === 'complete') return RUN_XP;
    const settled = new Set(run.outcomes.map(outcome => outcome.id));
    const level = run.levels[run.levelIndex];
    const depth = Math.max(1, level?.generation.decisionDepth ?? 1);
    const decisions = level ? run.history.filter(move => move.levelId === level.id).length : 0;
    // Death before settlement cannot earn the full last parcel, even on the last decision.
    const partial = level && !settled.has(level.id) ? Math.min(.9, decisions / depth) : 0;
    return Math.min(RUN_XP - 1, Math.floor(RUN_XP * (settled.size + partial) / run.levels.length));
}

export const endlessMoveXp = (moves: number): number => nonnegative(moves)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(moves / 2) * 5) : 0;

export function awardDungeonXp(state: PlayerLeveling, run: RunState): PlayerLeveling {
    if (run.phase !== 'finished' || !run.result) return state;
    const id = runReceipt(run);
    if (Object.hasOwn(state.receipts, id) || (run.daily && state.legacyDailyThrough && run.daily.day <= state.legacyDailyThrough)) return state;
    return { ...state, receipts: { ...state.receipts, [id]: dungeonRunXp(run) } };
}

export function awardEndlessXp(state: PlayerLeveling, session: Pick<EndlessSession, 'id' | 'moves'>): PlayerLeveling {
    const id = `endless:${session.id}`;
    const xp = endlessMoveXp(session.moves);
    if (xp <= (state.receipts[id] ?? 0)) return state;
    return { ...state, receipts: { ...state.receipts, [id]: xp } };
}

/** Historical dungeons overlap the unlock counter; never add the two sources. */
export function migratePlayerLeveling(progression: UserProgression, history: RunHistory, endless: EndlessSave): PlayerLeveling {
    let state: PlayerLeveling = { ...initialPlayerLeveling(),
        legacyXp: Math.min(Number.MAX_SAFE_INTEGER, Math.max(progression.finishedRuns, history.runs.length) * RUN_XP),
        legacyDailyThrough: progression.lastDailyRewardDay ?? null,
    };
    for (const run of history.runs) {
        state.receipts[run.mode === 'daily' ? `daily:${run.dailyDay}` : `run:${run.id}`] = 0;
        if (run.dailyDay && (!state.legacyDailyThrough || run.dailyDay > state.legacyDailyThrough)) state.legacyDailyThrough = run.dailyDay;
    }
    if (progression.lastFinishedRunId) state.receipts[`run:${progression.lastFinishedRunId}`] = 0;
    for (const record of endless.records) state = awardEndlessXp(state, record);
    // Include active legacy Endless play and preserve its unpaired move for the next award.
    if (endless.session) state = awardEndlessXp(state, endless.session);
    return state;
}

/** Union receipt totals, taking the greatest checkpoint for a shared Endless session. */
export function mergePlayerLeveling(state: PlayerLeveling, other: PlayerLeveling): PlayerLeveling {
    const receipts = { ...state.receipts };
    let changed = false;
    for (const [id, xp] of Object.entries(other.receipts)) {
        if (!Object.hasOwn(receipts, id) || xp > receipts[id]!) { receipts[id] = xp; changed = true; }
    }
    const legacyXp = Math.max(state.legacyXp, other.legacyXp);
    const legacyDailyThrough = !state.legacyDailyThrough ? other.legacyDailyThrough
        : !other.legacyDailyThrough ? state.legacyDailyThrough
        : state.legacyDailyThrough > other.legacyDailyThrough ? state.legacyDailyThrough : other.legacyDailyThrough;
    return changed || legacyXp !== state.legacyXp || legacyDailyThrough !== state.legacyDailyThrough
        ? { ...state, legacyXp, legacyDailyThrough, receipts } : state;
}

export function parsePlayerLeveling(source: string | null): PlayerLeveling | null {
    try {
        const state = JSON.parse(source ?? 'null') as PlayerLeveling;
        if (state?.version !== 1 || state.rulesVersion !== 1 || !nonnegative(state.legacyXp)
            || (state.legacyDailyThrough !== null && !validDay(state.legacyDailyThrough))
            || !state.receipts || typeof state.receipts !== 'object' || Array.isArray(state.receipts)
            || !Object.entries(state.receipts).every(([id, xp]) => /^(run|endless):\S.{0,255}$/.test(id) && nonnegative(xp)
                || /^daily:\d{4}-\d{2}-\d{2}$/.test(id) && validDay(id.slice(6)) && nonnegative(xp))) return null;
        return { version: 1, rulesVersion: 1, legacyXp: state.legacyXp,
            legacyDailyThrough: state.legacyDailyThrough, receipts: { ...state.receipts } };
    } catch { return null; }
}

export function loadPlayerLeveling(): PlayerLeveling | null {
    try { return parsePlayerLeveling(window.localStorage.getItem(PLAYER_LEVELING_STORAGE_KEY)); }
    catch { return null; }
}
export function savePlayerLeveling(state: PlayerLeveling): boolean {
    try { window.localStorage.setItem(PLAYER_LEVELING_STORAGE_KEY, JSON.stringify(state)); return true; }
    catch { return false; }
}
