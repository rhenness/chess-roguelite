import type { GeneratedLevel } from '../types/level';
import { isItemInventory, itemCount, LOADOUT_LIMIT, type ItemInventory } from './items';
import { isLevelCompatibleWithSkillTier, isPlayableLevel } from './levels';
import { PIECE_SET_IDS, type PieceSetId } from './pieceSets';
import { RUN_LEVEL_COUNT, type RunRules, type RunState } from './run';
import { isSkillTier, type SkillTier } from '../config/difficulty';
import { checkpointRun, restoreRunCheckpoint, type RunCheckpoint } from './runCheckpoint';

export const REGULAR_STORAGE_KEY = 'knightfall.regular.v1';

export interface RegularSession {
    run: RunState;
    set: PieceSetId;
    initialItems: ItemInventory;
}

interface RegularSave {
    version: 1;
    id: string;
    set: PieceSetId;
    levelIds: string[];
    rules: RunRules;
    initialItems: ItemInventory;
    checkpoint: RunCheckpoint;
    skillTier?: SkillTier;
    floorCount?: number;
}

export function saveRegularRun(session: RegularSession): boolean {
    const { run, set, initialItems } = session;
    const save: RegularSave = { version: 1, id: run.id, set,
        levelIds: run.levels.map(level => level.id), rules: run.rules,
        initialItems, checkpoint: checkpointRun(run), skillTier: run.skillTier, floorCount: run.floorCount };
    try { window.localStorage.setItem(REGULAR_STORAGE_KEY, JSON.stringify(save)); return true; }
    catch { return false; }
}

export function clearRegularRun(): boolean {
    try { window.localStorage.removeItem(REGULAR_STORAGE_KEY); return true; }
    catch { return false; }
}

export function loadRegularRun(pool: readonly GeneratedLevel[]): RegularSession | null {
    try {
        const save = JSON.parse(window.localStorage.getItem(REGULAR_STORAGE_KEY) ?? 'null') as RegularSave | null;
        if (!save || save.version !== 1 || typeof save.id !== 'string' || !save.id.trim()
            || !PIECE_SET_IDS.includes(save.set) || !Array.isArray(save.levelIds)
            || (save.skillTier !== undefined && !isSkillTier(save.skillTier))
            || !Number.isSafeInteger(save.floorCount ?? RUN_LEVEL_COUNT) || (save.floorCount ?? RUN_LEVEL_COUNT) <= 0
            || !save.levelIds.length || save.levelIds.length > (save.floorCount ?? RUN_LEVEL_COUNT)
            || new Set(save.levelIds).size !== save.levelIds.length
            || !isItemInventory(save.initialItems) || itemCount(save.initialItems) > LOADOUT_LIMIT) return null;
        const catalog = new Map(pool.map(level => [level.id, level]));
        const levels = save.levelIds.map(id => catalog.get(id));
        if (!levels.every(isPlayableLevel)) return null;
        if (levels.some(level => !isLevelCompatibleWithSkillTier(level!, save.skillTier ?? 'intermediate'))) return null;
        const run = restoreRunCheckpoint(levels, save.rules, save.initialItems, save.checkpoint,
            { floorCount: save.floorCount ?? RUN_LEVEL_COUNT });
        // A changed catalog must not silently reorder the saved floors.
        if (run.levels.some((level, index) => level.id !== save.levelIds[index])) return null;
        return { run: { ...run, id: save.id, skillTier: save.skillTier ?? 'intermediate' }, set: save.set, initialItems: save.initialItems };
    } catch { return null; }
}
