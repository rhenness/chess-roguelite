import { createChess, moveToUci, playOfferedMove } from '../chess';
import type { EndlessSession } from '../types';

export interface AnalysisPosition {
    key: string;
    pgn: string;
    fen: string;
    legalMoves: string[];
}
export interface AnalysisBranch extends AnalysisPosition { move: string }

/** History and board number distinguish repetitions and consecutive starting boards. */
function position(session: EndlessSession, pgn: string): AnalysisPosition | null {
    const chess = createChess(pgn);
    if (chess.isGameOver()) return null;
    return { key: JSON.stringify([session.id, session.gamesCompleted, pgn]), pgn, fen: chess.fen(),
        legalMoves: chess.moves({ verbose: true }).map(moveToUci) };
}

export const currentPosition = (session: EndlessSession): AnalysisPosition | null => position(session, session.pgn);

/** Only the offered children are prepared; preparing them never advances the session. */
export function nextBranches(session: EndlessSession): AnalysisBranch[] {
    if (session.phase !== 'ready') return [];
    return session.options.flatMap(option => {
        const chess = createChess(session.pgn);
        playOfferedMove(chess, option, session.options, session.optionsFen);
        const next = position(session, chess.pgn());
        return next ? [{ ...next, move: option.uci }] : [];
    });
}
