import { ITEMS, isItemId, isItemInventory, itemCount, LOADOUT_LIMIT } from '../../game/items';
import { PIECE_SET_IDS } from '../../game/pieceSets';
import { DEFAULT_RULES, QUALITY_ORDER } from '../../game/run';
import { createChess, moveToUci } from './chess';
import { openingOptions, STARTING_FEN } from './options';
import type { EndlessRecord, EndlessSave, EndlessSession, EngineScore, MoveOption } from './types';

export const ENDLESS_STORAGE_KEY = 'knightfall.endless.v1';
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
function isScore(value: unknown): value is EngineScore | null {
    if (value === null) return true;
    if (!value || typeof value !== 'object') return false;
    const score = value as EngineScore;
    return ['cp', 'mate'].includes(score.kind) && Number.isSafeInteger(score.value);
}
function isOption(value: unknown): value is MoveOption {
    if (!value || typeof value !== 'object') return false;
    const option = value as MoveOption;
    return typeof option.uci === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(option.uci)
        && option.from === option.uci.slice(0, 2) && option.to === option.uci.slice(2, 4)
        && option.promotion === option.uci[4] && typeof option.san === 'string'
        && typeof option.description === 'string' && QUALITY_ORDER.includes(option.quality)
        && isScore(option.score);
}

export function isSession(value: unknown): value is EndlessSession {
    if (!value || typeof value !== 'object') return false;
    const session = value as EndlessSession;
    try {
        if (session.version !== 1 || typeof session.id !== 'string' || !session.id.trim()
            || !['standard', 'hardcore'].includes(session.mode) || !PIECE_SET_IDS.includes(session.set)
            || !['analyzing', 'ready', 'reveal', 'between-games', 'finished'].includes(session.phase)
            || ![session.health, session.score, session.basePoints, session.streak, session.longestStreak, session.bestChain,
                session.moves, session.successfulMoves, session.gamesCompleted, session.startedAt].every(integer)
            || !session.counts || !QUALITY_ORDER.every(quality => integer(session.counts[quality]))
            || QUALITY_ORDER.reduce((sum, quality) => sum + session.counts[quality], 0) !== session.moves
            || session.successfulMoves !== session.counts.best + session.counts.good
            || session.streak > session.longestStreak || session.longestStreak > session.successfulMoves
            || session.bestChain > session.counts.best || session.gamesCompleted > session.moves
            || !isItemInventory(session.items) || itemCount(session.items) > LOADOUT_LIMIT
            || !Array.isArray(session.activeEffects) || !Array.isArray(session.options)
            || session.options.length > 4 || !session.options.every(isOption)
            || (session.lastMove !== null && !isOption(session.lastMove))
            || (session.lastBestScore !== undefined && !isScore(session.lastBestScore))
            || !session.rules || !integer(session.rules.startingHealth) || !session.rules.startingHealth
            || !QUALITY_ORDER.every(quality => session.rules.points[quality] === DEFAULT_RULES.points[quality]
                && session.rules.damage[quality] === DEFAULT_RULES.damage[quality])) return false;
        if (session.phase === 'finished' ? session.health !== 0 || !integer(session.finishedAt)
            : session.health === 0 || session.finishedAt !== null) return false;
        if (session.mode === 'hardcore' && (itemCount(session.items) || session.activeEffects.length
            || session.score !== session.successfulMoves || session.health > 1)) return false;
        const kinds = new Set();
        for (const active of session.activeEffects) {
            if (!active || !isItemId(active.sourceItemId)) return false;
            const effect = ITEMS[active.sourceItemId].effect;
            if (effect.kind === 'heal' || !active.effect || active.effect.kind !== effect.kind
                || active.effect.moves !== effect.moves || !integer(active.remainingMoves) || !active.remainingMoves
                || active.remainingMoves > effect.moves || kinds.has(effect.kind)
                || (effect.kind === 'scoreMultiplier' && (active.effect.kind !== 'scoreMultiplier' || active.effect.multiplier !== effect.multiplier))) return false;
            kinds.add(effect.kind);
        }
        const chess = createChess(session.pgn);
        if (session.phase === 'ready') {
            const legal = new Map(chess.moves({ verbose: true }).map(move => [moveToUci(move), move]));
            if (chess.isGameOver() || !session.options.length || session.optionsFen !== chess.fen()
                || new Set(session.options.map(option => option.uci)).size !== session.options.length
                || !session.options.every(option => legal.get(option.uci)?.san === option.san)) return false;
        } else if (session.options.length) return false;
        if (session.phase === 'between-games' && !chess.isGameOver()) return false;
        return true;
    } catch { return false; }
}

function isRecord(value: unknown): value is EndlessRecord {
    if (!value || typeof value !== 'object') return false;
    const record = value as EndlessRecord;
    return typeof record.id === 'string' && !!record.id.trim() && ['standard', 'hardcore'].includes(record.mode)
        && [record.score, record.longestStreak, record.moves, record.gamesCompleted, record.coins, record.finishedAt].every(integer)
        && record.longestStreak <= record.moves && record.gamesCompleted <= record.moves;
}
export const initialSave = (): EndlessSave => ({ version: 1, session: null, records: [] });

/** Older preset openings used unevaluated zero scores. Keep the attempt and its categories. */
function restoreEvaluations(session: EndlessSession): EndlessSession {
    if (session.lastBestScore !== undefined) return session;
    const presets = new Set(openingOptions().map(option => option.uci));
    const restoreOpening = (option: MoveOption): MoveOption => option.quality === 'good' && presets.has(option.uci)
        && option.score?.kind === 'cp' && option.score.value === 0 ? { ...option, score: null } : option;
    return { ...session, lastBestScore: null,
        options: session.optionsFen === STARTING_FEN ? session.options.map(restoreOpening) : session.options,
        lastMove: session.lastMove && createChess(session.pgn).history().length === 1
            ? restoreOpening(session.lastMove) : session.lastMove };
}

export function loadSave(): EndlessSave {
    try {
        const value = JSON.parse(window.localStorage.getItem(ENDLESS_STORAGE_KEY) ?? 'null');
        if (value?.version !== 1) return initialSave();
        const ids = new Set<string>();
        const records: EndlessRecord[] = Array.isArray(value.records) ? value.records.filter((record: unknown) => {
            if (!isRecord(record) || ids.has(record.id)) return false;
            ids.add(record.id); return true;
        }) : [];
        return { version: 1, session: isSession(value.session) ? restoreEvaluations(value.session) : null, records };
    } catch { return initialSave(); }
}
export function saveState(value: EndlessSave): boolean {
    try { window.localStorage.setItem(ENDLESS_STORAGE_KEY, JSON.stringify(value)); return true; }
    catch { return false; }
}
