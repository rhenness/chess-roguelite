import { Chess } from 'chess.js';
import { describeMove, moveToUci } from './chess';
import { selectFour, shuffle } from './classification';
import type { EvaluatedMove, MoveOption } from './types';

export const STARTING_FEN = new Chess().fen();
export function buildOptions(chess: Chess, evaluated: EvaluatedMove[]): MoveOption[] {
    const legal = new Map(chess.moves({ verbose: true }).map(move => [moveToUci(move), move]));
    return shuffle(selectFour(evaluated).flatMap(result => {
        const move = legal.get(result.uci);
        return move ? [{ uci: result.uci, san: move.san, from: move.from, to: move.to,
            ...(move.promotion ? { promotion: move.promotion } : {}), description: describeMove(move),
            quality: result.quality, score: result.score }] : [];
    }));
}

/** Fourced Move's opening offers these four moves, each counted as Good. */
export function openingOptions(): MoveOption[] {
    const chess = new Chess();
    return ['c2c4', 'd2d4', 'e2e4', 'g1f3'].map(uci => {
        const move = chess.moves({ verbose: true }).find(move => moveToUci(move) === uci)!;
        return { uci, san: move.san, from: move.from, to: move.to,
            description: describeMove(move), quality: 'good', score: { kind: 'cp', value: 0 } };
    });
}
