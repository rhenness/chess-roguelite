import { Chess, type Move } from 'chess.js';
import type { ChessMove, Color, TerminalNode } from '../../types/level.js';

export const colorName = (color: 'w' | 'b'): Color => color === 'w' ? 'white' : 'black';

export function applyUci(chess: Chess, uci: string): Move {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error(`Invalid UCI move: ${uci}`);
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
}

export const describeMove = (move: Move): ChessMove => ({ uci: move.lan, san: move.san });

export function terminalNode(chess: Chess, decisionsTaken: number): TerminalNode | null {
    const base = { kind: 'terminal' as const, fen: chess.fen(), decisionsTaken };
    if (chess.isCheckmate()) return {
        ...base, reason: 'checkmate', result: chess.turn() === 'w' ? 'black' : 'white',
    };
    if (chess.isStalemate()) return { ...base, reason: 'stalemate', result: 'draw' };
    if (chess.isDraw()) return { ...base, reason: 'draw', result: 'draw' };
    return null;
}
