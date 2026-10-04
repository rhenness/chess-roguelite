import { validateFen } from 'chess.js';
import type { Color, GeneratedLevel, TreeNode } from '../types/level';

export interface LevelCatalog {
    levels: GeneratedLevel[];
    warnings: string[];
}

const qualities = new Set(['best', 'good', 'inaccuracy', 'bad']);
const uciPattern = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Validate the fields gameplay consumes without importing any offline engine code. */
function playableNode(value: unknown, depth: number, limit: number, playerColor: Color): value is TreeNode {
    if (!object(value) || typeof value.fen !== 'string' || !validateFen(value.fen).ok
        || value.decisionsTaken !== depth || depth > limit) return false;
    if (value.kind === 'depth-limit') return depth === limit;
    if (value.kind === 'terminal') return ['checkmate', 'stalemate', 'draw'].includes(String(value.reason))
        && ['white', 'black', 'draw'].includes(String(value.result));
    if (value.kind !== 'decision' || value.fen.split(' ')[1] !== (playerColor === 'white' ? 'w' : 'b')
        || depth === limit || !Array.isArray(value.choices)
        || value.choices.length === 0 || value.choices.length > 4) return false;
    const moves = new Set<string>();
    const labels = new Set<string>();
    return value.choices.every((choice: unknown) => {
        if (!object(choice) || !qualities.has(String(choice.quality)) || labels.has(String(choice.quality))
            || !object(choice.playerMove) || typeof choice.playerMove.uci !== 'string'
            || !uciPattern.test(choice.playerMove.uci) || moves.has(choice.playerMove.uci)
            || typeof choice.playerMove.san !== 'string' || !choice.playerMove.san
            || typeof choice.fenAfterPlayerMove !== 'string' || !validateFen(choice.fenAfterPlayerMove).ok) return false;
        if (choice.opponentReply !== null && (!object(choice.opponentReply)
            || typeof choice.opponentReply.uci !== 'string' || !uciPattern.test(choice.opponentReply.uci)
            || typeof choice.opponentReply.san !== 'string' || !choice.opponentReply.san)) return false;
        moves.add(choice.playerMove.uci);
        labels.add(String(choice.quality));
        return playableNode(choice.next, depth + 1, limit, playerColor);
    });
}

export function isPlayableLevel(value: unknown): value is GeneratedLevel {
    if (!object(value) || typeof value.id !== 'string' || !value.id.trim() || value.schemaVersion !== 1
        || !['white', 'black'].includes(String(value.playerColor))
        || !Number.isInteger(value.difficulty) || Number(value.difficulty) < 0 || Number(value.difficulty) > 100
        || !object(value.generation) || !Number.isInteger(value.generation.decisionDepth)
        || Number(value.generation.decisionDepth) < 0 || Number(value.generation.decisionDepth) > 10) return false;
    return playableNode(value.root, 0, Number(value.generation.decisionDepth), value.playerColor as Color);
}

/** Difficulty ordering is separate from gameplay; IDs prevent repeats within a run. */
export function selectLevels(levels: readonly GeneratedLevel[]): GeneratedLevel[] {
    const seen = new Set<string>();
    return levels.filter(level => {
        if (!isPlayableLevel(level) || seen.has(level.id)) return false;
        seen.add(level.id);
        return true;
    }).sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id));
}

export function loadLevelCatalog(files: Record<string, unknown>): LevelCatalog {
    const levels: GeneratedLevel[] = [];
    const warnings: string[] = [];
    const seen = new Set<string>();
    for (const [file, value] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
        if (object(value) && value.difficulty === -1) continue;
        if (!isPlayableLevel(value)) {
            warnings.push(`${file.split('/').pop()}: invalid level data.`);
        } else if (seen.has(value.id)) {
            warnings.push(`${file.split('/').pop()}: duplicate level ID.`);
        } else {
            seen.add(value.id);
            levels.push(value);
        }
    }
    return { levels: selectLevels(levels), warnings };
}

export function loadBundledLevels(): LevelCatalog {
    return loadLevelCatalog(import.meta.glob('../levels/*.json', { eager: true, import: 'default' }));
}
