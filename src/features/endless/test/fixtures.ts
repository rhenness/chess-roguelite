import type { MoveQuality } from '../../../types/level';
import { createChess, describeMove, moveToUci } from '../chess';
import type { EndlessSession, MoveOption } from '../types';

export function offer(session: EndlessSession, san: string, quality: MoveQuality): EndlessSession {
    const chess = createChess(session.pgn);
    const move = chess.moves({ verbose: true }).find(move => move.san === san)!;
    const option: MoveOption = { uci: moveToUci(move), san: move.san, from: move.from, to: move.to,
        ...(move.promotion ? { promotion: move.promotion } : {}), quality, score: { kind: 'cp', value: 0 }, description: describeMove(move) };
    return { ...session, phase: 'ready', optionsFen: chess.fen(), options: [option] };
}
