import type { GeneratedLevel } from '../types/level';
import { isLevelCompatibleWithSkillTier, isPlayableLevel, selectSkillTierLevels } from './levels';
import { isSkillTier, SKILL_TIER_CONFIG, type SkillTier } from '../config/difficulty';
import { BOARD_SQUARES, createPayout, type MultiplierBoard, type PayoutResult } from './multipliers';
import { PIECE_SET_IDS, type PieceSetId } from './pieceSets';
import { advancePlayback, DEFAULT_RULES, RUN_LEVEL_COUNT, skillTierRules, startRun, type RunRules, type RunState } from './run';
import { DAILY_ITEMS } from './items';
import { createCheckpointRewards } from './checkpointRewards';
import { checkpointRun, restoreRunCheckpoint, type RunCheckpoint } from './runCheckpoint';

export const DAILY_STORAGE_KEY = 'knightfall.daily.v1';
export const DAILY_COIN_MULTIPLIER = 5;
const DAY_MS = 86400000;
// Existing level IDs are immutable daily-v1 assets; adding regular levels cannot change today's draw.
const DAILY_V1_LEVEL_IDS = new Set([
    '7677a9a4-d23c-4d20-9aa8-868ae3ecc074', '4b9ccb83-2aa0-4b87-b6ee-659f02a2c20e',
    '0bd0f1c0-4fb2-4630-98a7-fc27dc797411', '0c9ff227-76e4-4910-8d9d-d624ed0a8918',
    '3749884c-7d06-44b7-ba1b-27b25dfe3c8a', '6556a0d8-32e0-4977-ba7c-7751b5716112',
    '6ab28a7b-5f62-44e4-a731-2f4b78cb152f', '06ef6c33-1bd5-48bf-9467-df49160c88c0',
    'bc0b0f95-3db5-4d05-be8f-92315710404b', 'daded246-47e7-40b3-a4de-ebc68e90273c',
    '02b60971-470a-4f11-9cfb-88d9fddb0f7e', '9492490e-b0a0-4dc7-9a15-435a2ad25321',
    'c3b16de7-1bb2-46ad-be9a-fbbe803d8632', 'e00be400-3056-449a-9216-d563e6cdbcb3',
    'ec88ee68-09d6-4b2c-9769-80ce5d0611ea', '68397271-af06-4758-8e3e-b4e0b39464f5',
    'b15234be-e756-4b04-9c05-ef9444aa070d', 'efede1a2-c7b0-44a7-ae1c-7448b84bc599',
    '21880a2c-4335-44a6-beb0-90d6e8636016', 'fc6c629f-c8d7-493d-a638-52d7e473fffc',
    '5398bac0-e5ba-4bdc-96d4-4bf8f3f3a73f', 'ee6046c4-4a9a-40c3-b350-3f2ecef096e5',
    '88c56f9e-c91a-4f9c-9b86-7f223c45af7c', 'e91170bf-1596-4e45-8cb0-2606547756af',
]);

export type DailyCheckpoint = RunCheckpoint;

export interface DailyAttempt {
    id: string;
    setId: PieceSetId;
    rules: RunRules;
    multipliers: MultiplierBoard;
    checkpoint: DailyCheckpoint;
    status: 'active' | 'finished' | 'expired';
    payout: PayoutResult | null;
    finishedAt: number | null;
    itemRulesVersion?: 1;
    skillTier?: SkillTier;
}

export interface DailyDungeon {
    day: string;
    expiresAt: number;
    levels: GeneratedLevel[];
    attempt: DailyAttempt | null;
    skillTier?: SkillTier;
    floorCount?: number;
}

export interface DailyArchive {
    version: 1;
    days: Record<string, DailyDungeon>;
}

export const utcDay = (now: number): string => new Date(now).toISOString().slice(0, 10);
export const dailyDeadline = (day: string): number => Date.parse(`${day}T00:00:00Z`) + DAY_MS;

// Mulberry32 keeps level selection independent from payout and choice shuffling.
export function dailyRandom(day: string): () => number {
    let seed = 2166136261;
    for (const character of `knightfall-daily-v1:${day}`) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
    return () => {
        seed += 0x6d2b79f5;
        let value = Math.imul(seed ^ seed >>> 15, seed | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

export function createDailyDungeon(pool: readonly GeneratedLevel[], now = Date.now(), skillTier?: SkillTier): DailyDungeon {
    const day = utcDay(now);
    if (skillTier) {
        const selected = selectSkillTierLevels(pool, skillTier);
        const floorCount = SKILL_TIER_CONFIG[skillTier].run.floorCount;
        return { day, expiresAt: dailyDeadline(day), skillTier, floorCount, attempt: null,
            levels: selected.length ? structuredClone(startRun(selected, skillTierRules(skillTier),
                dailyRandom(`${day}:${skillTier}`), {}, undefined, { skillTier, floorCount }).levels) : [] };
    }
    const versioned = pool.filter(level => DAILY_V1_LEVEL_IDS.has(level.id));
    return { day, expiresAt: dailyDeadline(day),
        levels: structuredClone(startRun(versioned.length ? versioned : pool, DEFAULT_RULES, dailyRandom(day)).levels), attempt: null };
}

export function enterDailyDungeon(dungeon: DailyDungeon, setId: PieceSetId, rules: RunRules,
    multipliers: MultiplierBoard, now = Date.now()): { dungeon: DailyDungeon; run: RunState } {
    if (now >= dungeon.expiresAt) throw new Error('This dungeon has expired.');
    if (dungeon.attempt) throw new Error('The daily attempt has already been used.');
    const skillTier = dungeon.skillTier ?? 'intermediate';
    if (!isSkillTier(skillTier) || dungeon.levels.some(level => !isLevelCompatibleWithSkillTier(level, skillTier))) {
        throw new Error('Invalid daily skill tier.');
    }
    const rewards = createCheckpointRewards(dungeon.levels.length, dailyRandom(`${dungeon.day}:checkpoint-rewards-v1`));
    const run = { ...startRun(dungeon.levels, rules, Math.random, DAILY_ITEMS, rewards,
        { floorCount: dungeon.floorCount ?? RUN_LEVEL_COUNT }), skillTier, daily: { day: dungeon.day, expiresAt: dungeon.expiresAt } };
    return { run, dungeon: { ...dungeon, attempt: {
        id: run.id, setId, rules: structuredClone(rules), multipliers: { ...multipliers },
        skillTier,
        checkpoint: checkpointRun(run), status: 'active', payout: null, finishedAt: null, itemRulesVersion: 1,
    } } };
}

export function expireDailyDungeon(dungeon: DailyDungeon, now = Date.now()): DailyDungeon {
    if (!dungeon.attempt || dungeon.attempt.status !== 'active' || now < dungeon.expiresAt) return dungeon;
    return { ...dungeon, attempt: { ...dungeon.attempt, status: 'expired', payout: null } };
}

export function recordDailyRun(dungeon: DailyDungeon, run: RunState, now = Date.now(), random = Math.random): DailyDungeon {
    const attempt = dungeon.attempt;
    if (!attempt || attempt.id !== run.id || attempt.status !== 'active') return dungeon;
    if (now >= dungeon.expiresAt) return expireDailyDungeon(dungeon, now);
    const settled = advancePlayback(advancePlayback(run));
    // The final decision counts before the deadline; its animation may finish afterward.
    const finished = settled.phase === 'finished';
    const resultRun = finished ? settled : run;
    const payout = finished ? createPayout(attempt.multipliers, resultRun.score,
        resultRun.result === 'complete' && resultRun.levelsCompleted === resultRun.floorCount, random) : null;
    return { ...dungeon, attempt: { ...attempt, checkpoint: checkpointRun(resultRun),
        status: finished ? 'finished' : 'active', finishedAt: finished ? now : null,
        payout: payout ? { ...payout, id: `daily-payout-${dungeon.day}-${attempt.id}` } : null,
    } };
}

/** Replay offered moves instead of trusting persisted health, scores, or tree nodes. */
export function restoreDailyRun(dungeon: DailyDungeon): RunState | null {
    const attempt = dungeon.attempt;
    if (!attempt || attempt.status === 'expired') return null;
    const skillTier = attempt.skillTier ?? dungeon.skillTier ?? 'intermediate';
    if (!isSkillTier(skillTier) || skillTier !== (dungeon.skillTier ?? 'intermediate')
        || dungeon.levels.some(level => !isLevelCompatibleWithSkillTier(level, skillTier))) throw new Error('Invalid daily skill tier.');
    if (attempt.itemRulesVersion !== undefined && attempt.itemRulesVersion !== 1) throw new Error('Invalid daily item rules.');
    const rewards = attempt.checkpoint.checkpointRewards;
    if (rewards?.length) {
        const expected = createCheckpointRewards(dungeon.levels.length, dailyRandom(`${dungeon.day}:checkpoint-rewards-v1`));
        if (JSON.stringify(rewards.map(reward => ({ ...reward, selected: null }))) !== JSON.stringify(expected)) {
            throw new Error('Invalid daily reward offers.');
        }
    }
    const run = restoreRunCheckpoint(dungeon.levels, attempt.rules,
        attempt.itemRulesVersion === 1 ? DAILY_ITEMS : {}, attempt.checkpoint,
        { floorCount: dungeon.floorCount ?? RUN_LEVEL_COUNT });
    if ((attempt.status === 'finished') !== (run.phase === 'finished')) throw new Error('Invalid daily result.');
    return { ...run, id: attempt.id, skillTier, daily: { day: dungeon.day, expiresAt: dungeon.expiresAt } };
}

export const initialDailyArchive = (): DailyArchive => ({ version: 1, days: {} });

export function storeDailyDungeon(archive: DailyArchive, dungeon: DailyDungeon): DailyArchive {
    const days = { ...archive.days, [dungeon.day]: dungeon };
    // Keep yesterday's receipt while today's challenge is active, within localStorage limits.
    const retained = Object.keys(days).sort().slice(-2);
    return { version: 1, days: Object.fromEntries(retained.map(day => [day, days[day]!])) };
}

export function saveDailyArchive(archive: DailyArchive): boolean {
    const days = Object.fromEntries(Object.entries(archive.days).map(([day, dungeon]) => {
        const { levels, ...metadata } = dungeon;
        return [day, { ...metadata, levelIds: levels.map(level => level.id) }];
    }));
    try { window.localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify({ version: 1, days })); return true; }
    catch { return false; }
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function loadDailyArchive(pool: readonly GeneratedLevel[], { attemptsOnly = false }: { attemptsOnly?: boolean } = {}): DailyArchive {
    try {
        const source = window.localStorage.getItem(DAILY_STORAGE_KEY);
        if (!source) return initialDailyArchive();
        const value: unknown = JSON.parse(source);
        if (!object(value) || value.version !== 1 || !object(value.days)) return initialDailyArchive();
        let archive = initialDailyArchive();
        const catalog = new Map(pool.map(level => [level.id, level]));
        for (const [day, entry] of Object.entries(value.days)) {
            // Tier previews only need to check for a consumed attempt in another tab.
            if (attemptsOnly && object(entry) && entry.attempt === null) continue;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !object(entry) || entry.day !== day
                || entry.expiresAt !== dailyDeadline(day) || !Array.isArray(entry.levelIds)
                || !Number.isSafeInteger(entry.floorCount ?? RUN_LEVEL_COUNT) || Number(entry.floorCount ?? RUN_LEVEL_COUNT) <= 0
                || entry.levelIds.length > Number(entry.floorCount ?? RUN_LEVEL_COUNT)) continue;
            const levels = entry.levelIds.map(id => catalog.get(String(id)));
            const dungeon = { ...entry, levels } as unknown as DailyDungeon;
            if (!levels.every(isPlayableLevel) || new Set(entry.levelIds).size !== entry.levelIds.length
                || (entry.skillTier !== undefined && !isSkillTier(entry.skillTier))
                || (!levels.length && dungeon.attempt !== null)) {
                // Missing/regenerated assets never turn an already consumed daily into a retry.
                if (!dungeon.attempt) continue;
                dungeon.levels = [];
                dungeon.attempt = { ...dungeon.attempt, status: 'expired', payout: null };
                archive = storeDailyDungeon(archive, dungeon);
                continue;
            }
            if (dungeon.attempt !== null) {
                const attempt = dungeon.attempt;
                try {
                    if (!object(attempt) || typeof attempt.id !== 'string' || !attempt.id
                        || !PIECE_SET_IDS.includes(attempt.setId) || !object(attempt.multipliers)
                        || !BOARD_SQUARES.every(square => Number.isSafeInteger(attempt.multipliers[square]) && attempt.multipliers[square] >= 10)
                        || !object(attempt.checkpoint) || !Array.isArray(attempt.checkpoint.moves)
                        || !['active', 'finished', 'expired'].includes(attempt.status)) throw new Error('Invalid attempt.');
                    if (attempt.status !== 'expired') {
                        const run = restoreDailyRun(dungeon)!;
                        if (attempt.status === 'finished' && (!attempt.payout || attempt.payout.baseScore !== run.score
                            || attempt.finishedAt === null || attempt.finishedAt >= dungeon.expiresAt
                            || attempt.payout.id !== `daily-payout-${day}-${attempt.id}`
                            || !BOARD_SQUARES.includes(attempt.payout.square)
                            || attempt.payout.multiplier !== attempt.multipliers[attempt.payout.square]
                            || attempt.payout.finalScore !== Math.round(run.score * attempt.payout.multiplier / 10))) throw new Error('Invalid payout.');
                        if (attempt.payout?.upgrade && (!BOARD_SQUARES.includes(attempt.payout.upgrade.square)
                            || attempt.payout.upgrade.before !== attempt.multipliers[attempt.payout.upgrade.square]
                            || attempt.payout.upgrade.after !== attempt.payout.upgrade.before + 1
                            || run.result !== 'complete' || run.levelsCompleted !== run.floorCount)) throw new Error('Invalid upgrade.');
                    }
                } catch {
                    // A broken attempt stays consumed until reset rather than becoming a free retry.
                    dungeon.attempt = { ...attempt, status: 'expired', payout: null };
                }
            }
            archive = storeDailyDungeon(archive, dungeon);
        }
        return archive;
    } catch { return initialDailyArchive(); }
}
