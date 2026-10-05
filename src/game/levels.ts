import { validateFen } from 'chess.js';
import type { Color, GeneratedLevel, TreeNode } from '../types/level';
import { normalizeLevel } from '../types/level-schema';
import { isSkillTier, SKILL_TIER_CONFIG, type SkillTier } from '../config/difficulty';

export interface LevelCatalog {
    levels: GeneratedLevel[];
    warnings: string[];
}

const qualities = new Set(['best', 'good', 'inaccuracy', 'bad']);
const uciPattern = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Validate the fields gameplay consumes without importing any offline engine code. */
function playableNode(value: unknown, depth: number, limit: number, playerColor: Color, skillTier?: SkillTier): value is TreeNode {
    if (!object(value) || typeof value.fen !== 'string' || !validateFen(value.fen).ok
        || value.decisionsTaken !== depth || depth > limit) return false;
    if (value.kind === 'depth-limit') return depth === limit;
    if (value.kind === 'terminal') return ['checkmate', 'stalemate', 'draw'].includes(String(value.reason))
        && ['white', 'black', 'draw'].includes(String(value.result));
    if (value.kind !== 'decision' || value.fen.split(' ')[1] !== (playerColor === 'white' ? 'w' : 'b')
        || depth === limit || !Array.isArray(value.choices)
        || value.choices.length === 0
        || value.choices.length > (skillTier ? SKILL_TIER_CONFIG[skillTier].treeGeneration.playerOptions.length : 4)) return false;
    const moves = new Set<string>();
    const labels = new Map<string, number>();
    const allowed = new Map<string, number>();
    if (skillTier) {
        for (const option of SKILL_TIER_CONFIG[skillTier].treeGeneration.playerOptions) {
            allowed.set(option.quality, (allowed.get(option.quality) ?? 0) + 1);
        }
    } else for (const quality of qualities) allowed.set(quality, 1);
    return value.choices.every((choice: unknown) => {
        if (!object(choice) || !qualities.has(String(choice.quality))
            || (labels.get(String(choice.quality)) ?? 0) >= (allowed.get(String(choice.quality)) ?? 0)
            || !object(choice.playerMove) || typeof choice.playerMove.uci !== 'string'
            || !uciPattern.test(choice.playerMove.uci) || moves.has(choice.playerMove.uci)
            || typeof choice.playerMove.san !== 'string' || !choice.playerMove.san
            || typeof choice.fenAfterPlayerMove !== 'string' || !validateFen(choice.fenAfterPlayerMove).ok) return false;
        if (choice.opponentReply !== null && (!object(choice.opponentReply)
            || typeof choice.opponentReply.uci !== 'string' || !uciPattern.test(choice.opponentReply.uci)
            || typeof choice.opponentReply.san !== 'string' || !choice.opponentReply.san)) return false;
        moves.add(choice.playerMove.uci);
        labels.set(String(choice.quality), (labels.get(String(choice.quality)) ?? 0) + 1);
        return playableNode(choice.next, depth + 1, limit, playerColor, skillTier);
    });
}

export function isPlayableLevel(value: unknown): value is GeneratedLevel {
    if (!object(value) || typeof value.id !== 'string' || !value.id.trim() || value.schemaVersion !== 2
        || Object.hasOwn(value, 'difficulty')
        || (value.skillTier !== undefined && !isSkillTier(value.skillTier))
        || !['white', 'black'].includes(String(value.playerColor))
        || !Number.isInteger(value.difficultyScore) || Number(value.difficultyScore) < 0 || Number(value.difficultyScore) > 100
        || !object(value.generation) || !Number.isInteger(value.generation.decisionDepth)
        || Number(value.generation.decisionDepth) < 0 || Number(value.generation.decisionDepth) > 10) return false;
    return playableNode(value.root, 0, Number(value.generation.decisionDepth), value.playerColor as Color, value.skillTier as SkillTier | undefined);
}

/** Difficulty ordering is separate from gameplay; IDs prevent repeats within a run. */
export function selectLevels(levels: readonly GeneratedLevel[]): GeneratedLevel[] {
    const seen = new Set<string>();
    return levels.filter(level => {
        if (!isPlayableLevel(level) || seen.has(level.id)) return false;
        seen.add(level.id);
        return true;
    }).sort((a, b) => a.difficultyScore - b.difficultyScore || a.id.localeCompare(b.id));
}

/** Give equally wide difficulty bands equal representation, regardless of catalog density. */
export function sampleRunLevels(pool: readonly GeneratedLevel[], count: number, random = Math.random): GeneratedLevel[] {
    if (!Number.isSafeInteger(count) || count <= 0) throw new Error('Run level count must be a positive integer.');
    const levels = selectLevels(pool);
    if (levels.length <= count) return levels;
    const minimum = levels[0]!.difficultyScore;
    const range = levels[levels.length - 1]!.difficultyScore - minimum + 1;
    const bands = Array.from({ length: count }, () => ({ available: [] as GeneratedLevel[], picked: 0 }));
    for (const level of levels) {
        const index = Math.floor((level.difficultyScore - minimum) * count / range);
        bands[index]!.available.push(level);
    }
    const selected: GeneratedLevel[] = [];
    while (selected.length < count) {
        const available = bands.filter(band => band.available.length > 0);
        const fewestPicked = Math.min(...available.map(band => band.picked));
        const candidates = available.filter(band => band.picked === fewestPicked);
        const band = candidates[Math.floor(random() * candidates.length)]!;
        const index = Math.floor(random() * band.available.length);
        const level = band.available[index]!;
        band.available[index] = band.available[band.available.length - 1]!;
        band.available.pop();
        band.picked++;
        selected.push(level);
    }
    return selected.sort((a, b) => a.difficultyScore - b.difficultyScore || a.id.localeCompare(b.id));
}

export function loadLevelCatalog(files: Record<string, unknown>, skillTier?: SkillTier): LevelCatalog {
    const levels: GeneratedLevel[] = [];
    const warnings: string[] = [];
    const seen = new Set<string>();
    for (const [file, input] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
        const value = normalizeLevel(input);
        if (object(value) && value.difficultyScore === -1) continue;
        if (!isPlayableLevel(value)) {
            warnings.push(`${file.split('/').pop()}: invalid floor data.`);
        } else if (skillTier && (value.skillTier ?? 'intermediate') !== skillTier) {
            continue;
        } else if (seen.has(value.id)) {
            warnings.push(`${file.split('/').pop()}: duplicate floor ID.`);
        } else {
            seen.add(value.id);
            levels.push(value);
        }
    }
    return { levels: selectLevels(levels), warnings };
}

export function loadBundledLevels(skillTier: SkillTier = 'intermediate'): LevelCatalog {
    return loadLevelCatalog(import.meta.glob(['../levels/**/*.json', '!../levels/.staging/**'],
        { eager: true, import: 'default' }), skillTier);
}
