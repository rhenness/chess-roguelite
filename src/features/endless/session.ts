import { DEFAULT_RULES, BEST_MOVE_STREAK_LENGTH } from '../../game/run';
import { ITEMS, isItemInventory, itemCount, LOADOUT_LIMIT, resolveItemEffects, type ItemId, type ItemInventory } from '../../game/items';
import { COIN_SCORE_STEP } from '../../game/economy';
import { PIECE_SETS, type PieceSetId } from '../../game/pieceSets';
import { createChess, gameStatus, playOfferedMove } from './chess';
import { openingOptions, STARTING_FEN } from './options';
import type { EndlessMode, EndlessRecord, EndlessSession, MoveOption } from './types';

export function startSession(mode: EndlessMode, set: PieceSetId, items: ItemInventory = {}, now = Date.now()): EndlessSession {
    if (!isItemInventory(items) || itemCount(items) > LOADOUT_LIMIT) throw new Error('Invalid item loadout.');
    return {
        version: 1, id: crypto.randomUUID(), mode, set,
        rules: { ...structuredClone(DEFAULT_RULES), startingHealth: mode === 'hardcore' ? 1 : PIECE_SETS[set].startingHealth },
        phase: 'ready', pgn: '', optionsFen: STARTING_FEN, options: openingOptions(),
        health: mode === 'hardcore' ? 1 : PIECE_SETS[set].startingHealth,
        score: 0, basePoints: 0, streak: 0, longestStreak: 0, bestChain: 0,
        moves: 0, successfulMoves: 0, gamesCompleted: 0,
        counts: { best: 0, good: 0, inaccuracy: 0, bad: 0 },
        items: mode === 'hardcore' ? {} : { ...items }, activeEffects: [],
        lastMove: null, lastResolution: null, boardResult: null, startedAt: now, finishedAt: null,
    };
}

export function acceptOptions(session: EndlessSession, fen: string, options: MoveOption[]): EndlessSession {
    if (session.phase !== 'analyzing' || createChess(session.pgn).fen() !== fen || !options.length) return session;
    const legal = new Set(createChess(session.pgn).moves({ verbose: true }).map(move => `${move.from}${move.to}${move.promotion ?? ''}`));
    if (options.length > 4 || new Set(options.map(option => option.uci)).size !== options.length || options.some(option => !legal.has(option.uci))) return session;
    return { ...session, phase: 'ready', optionsFen: fen, options };
}

export function playMove(session: EndlessSession, uci: string, now = Date.now()): EndlessSession {
    if (session.phase !== 'ready') return session;
    const option = session.options.find(option => option.uci === uci);
    if (!option) return session;
    const chess = createChess(session.pgn);
    playOfferedMove(chess, option, session.options, session.optionsFen);
    const successful = option.quality === 'best' || option.quality === 'good';
    const streak = successful ? session.streak + 1 : 0;
    const bestChain = option.quality === 'best' ? session.bestChain + 1 : 0;
    const healthBonus = session.mode === 'standard' && bestChain > 0 && bestChain % BEST_MOVE_STREAK_LENGTH === 0 ? 1 : 0;
    const normalPoints = session.rules.points[option.quality];
    const damage = session.mode === 'hardcore' ? (successful ? 0 : 1) : session.rules.damage[option.quality];
    const { resolution, activeEffects } = resolveItemEffects(session.activeEffects, normalPoints, damage, healthBonus);
    const health = Math.max(0, session.health + healthBonus - resolution.damageTaken);
    const failed = health === 0;
    const boardResult = gameStatus(chess);
    return {
        ...session, pgn: chess.pgn(), phase: failed ? 'finished' : 'reveal', options: [],
        health, score: session.mode === 'hardcore' ? session.score + (successful ? 1 : 0) : session.score + resolution.awardedPoints,
        // Item multipliers never increase coin earnings; Hardcore rewards only successful moves.
        basePoints: session.basePoints + (session.mode === 'hardcore' && !successful ? 0 : normalPoints),
        streak, longestStreak: Math.max(session.longestStreak, streak), bestChain,
        moves: session.moves + 1, successfulMoves: session.successfulMoves + Number(successful),
        counts: { ...session.counts, [option.quality]: session.counts[option.quality] + 1 },
        activeEffects: failed ? [] : activeEffects, items: failed ? {} : session.items,
        lastMove: option, lastResolution: resolution, boardResult,
        gamesCompleted: session.gamesCompleted + Number(!!boardResult && !failed), finishedAt: failed ? now : null,
    };
}

export function advanceReveal(session: EndlessSession): EndlessSession {
    if (session.phase !== 'reveal') return session;
    return { ...session, phase: session.boardResult ? 'between-games' : 'analyzing' };
}

export function nextBoard(session: EndlessSession): EndlessSession {
    if (session.phase !== 'between-games') return session;
    return { ...session, pgn: '', optionsFen: STARTING_FEN, options: openingOptions(), phase: 'ready',
        boardResult: null, lastMove: null, lastResolution: null };
}

export function canUseItem(session: EndlessSession, id: ItemId): boolean {
    return session.mode === 'standard' && session.phase === 'ready' && (session.items[id] ?? 0) > 0
        && !session.activeEffects.some(active => active.effect.kind === ITEMS[id].effect.kind);
}

export function useItem(session: EndlessSession, id: ItemId): EndlessSession {
    if (!canUseItem(session, id)) return session;
    const effect = ITEMS[id].effect;
    return { ...session, items: { ...session.items, [id]: session.items[id]! - 1 },
        health: session.health + (effect.kind === 'heal' ? effect.amount : 0),
        activeEffects: effect.kind === 'heal' ? session.activeEffects
            : [...session.activeEffects, { sourceItemId: id, effect: { ...effect }, remainingMoves: effect.moves }] };
}

export const coinReward = (session: EndlessSession): number => session.phase === 'finished' ? Math.floor(session.basePoints / COIN_SCORE_STEP) : 0;
export const sessionRecord = (session: EndlessSession): EndlessRecord | null => session.phase === 'finished' && session.finishedAt !== null
    ? { id: session.id, mode: session.mode, score: session.score, longestStreak: session.longestStreak,
        moves: session.moves, gamesCompleted: session.gamesCompleted, coins: coinReward(session), finishedAt: session.finishedAt } : null;
