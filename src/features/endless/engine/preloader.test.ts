import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { createChess, moveToUci } from '../chess';
import { startSession } from '../session';
import { offer } from '../test/fixtures';
import type { EvaluatedMove } from '../types';
import { currentPosition, nextBranches } from './branches';
import { BranchPreloader } from './preloader';

interface Request {
    fen: string; legal: string[]; signal: AbortSignal;
    resolve: (moves: EvaluatedMove[]) => void; reject: (error: Error) => void;
}
function deferredEngine() {
    const requests: Request[] = [];
    return { requests, dispose: vi.fn(),
        analyze: vi.fn((fen: string, legal: string[], signal: AbortSignal) => new Promise<EvaluatedMove[]>((resolve, reject) => {
            requests.push({ fen, legal, signal, resolve, reject });
        })),
    };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const finish = async (request: Request) => {
    request.resolve(request.legal.slice(0, 8).map((uci, index) => ({ uci, depth: 10, score: { kind: 'cp', value: -index * 100 } })));
    await flush();
};
const drain = async (request: Request) => { request.reject(new DOMException('Stopped', 'AbortError')); await flush(); };
const setup = () => {
    const session = startSession('standard', 'default');
    const positions = nextBranches(session);
    const engine = deferredEngine();
    const loader = new BranchPreloader(engine);
    loader.keep(positions); loader.setActive(true);
    return { session, positions, engine, loader };
};

describe('one-move-ahead preparation', () => {
    it('serializes the four offered branches, freezes their choices, and stops at one level', async () => {
        const { session, positions, engine, loader } = setup();
        expect(engine.requests).toHaveLength(1);
        for (let index = 0; index < 4; index++) {
            expect(engine.requests[index]!.fen).toBe(positions[index]!.fen);
            await finish(engine.requests[index]!);
        }
        expect(engine.requests).toHaveLength(4);
        expect(session).toMatchObject({ pgn: '', phase: 'ready', health: 3, moves: 0 });
        const prepared = loader.peek(positions[2]!)!;
        const loaded = await loader.load(positions[2]!, new AbortController().signal);
        expect(loaded).toBe(prepared);
        expect(loaded.every(option => new Chess(positions[2]!.fen).moves({ verbose: true }).some(move => moveToUci(move) === option.uci))).toBe(true);
        expect(engine.requests).toHaveLength(4);
        loader.dispose();
    });

    it('prioritizes a pending choice only after stopped-search output drains', async () => {
        const { positions, engine, loader } = setup();
        loader.prioritize(positions[2]!.key);
        expect(engine.requests[0]!.signal.aborted).toBe(true);
        expect(engine.requests).toHaveLength(1);
        await drain(engine.requests[0]!);
        expect(engine.requests[1]!.fen).toBe(positions[2]!.fen);
        loader.prioritize(positions[3]!.key);
        expect(engine.requests[1]!.signal.aborted).toBe(true);
        await drain(engine.requests[1]!);
        expect(engine.requests[2]!.fen).toBe(positions[3]!.fen);
        loader.dispose();
    });

    it('continues an already-running confirmed branch without restarting or analyzing its siblings', async () => {
        const { positions, engine, loader } = setup();
        loader.keep([positions[0]!]);
        const required = loader.load(positions[0]!, new AbortController().signal);
        expect(engine.requests[0]!.signal.aborted).toBe(false);
        await finish(engine.requests[0]!);
        expect(await required).toBe(loader.peek(positions[0]!));
        expect(engine.requests).toHaveLength(1);
        loader.dispose();
    });

    it('gives the committed board priority over a different pending selection', async () => {
        const { positions, engine, loader } = setup();
        loader.prioritize(positions[1]!.key);
        loader.keep([positions[2]!]);
        const required = loader.load(positions[2]!, new AbortController().signal);
        await drain(engine.requests[0]!);
        expect(engine.requests[1]!.fen).toBe(positions[2]!.fen);
        await finish(engine.requests[1]!);
        expect(await required).toBe(loader.peek(positions[2]!));
        expect(engine.requests).toHaveLength(2);
        loader.dispose();
    });

    it('pauses searches, retains completed branches, and resumes only unfinished work', async () => {
        const { positions, engine, loader } = setup();
        await finish(engine.requests[0]!);
        const prepared = loader.peek(positions[0]!);
        loader.setActive(false);
        expect(engine.requests[1]!.signal.aborted).toBe(true);
        await drain(engine.requests[1]!);
        expect(engine.requests).toHaveLength(2);
        expect(loader.peek(positions[0]!)).toBe(prepared);
        loader.setActive(true);
        expect(engine.requests[2]!.fen).toBe(positions[1]!.fen);
        loader.dispose();
    });

    it('discards late cancelled results after moving to another board and rejects obsolete requests', async () => {
        const { positions, engine, loader } = setup();
        const obsolete = loader.load(positions[0]!, new AbortController().signal).catch(error => error);
        loader.keep([positions[3]!]);
        expect((await obsolete).name).toBe('AbortError');
        // Even an engine that delivers a completed result after stop cannot populate the new board.
        await finish(engine.requests[0]!);
        expect(loader.peek(positions[0]!)).toBeNull();
        expect(loader.peek(positions[3]!)).toBeNull();
        expect(engine.requests[1]!.fen).toBe(positions[3]!.fen);
        loader.dispose();
    });

    it('stops speculative work after an error while allowing required branches and a fresh retry', async () => {
        const { positions, engine, loader } = setup();
        engine.requests[0]!.reject(new Error('Offline')); await flush();
        expect(engine.requests).toHaveLength(1);
        await expect(loader.load(positions[0]!, new AbortController().signal)).rejects.toThrow('Offline');
        const required = loader.load(positions[1]!, new AbortController().signal);
        expect(engine.requests[1]!.fen).toBe(positions[1]!.fen);
        await finish(engine.requests[1]!); await required;
        expect(engine.requests).toHaveLength(2);
        loader.dispose();
        const retry = new BranchPreloader(engine);
        retry.keep([positions[0]!]); retry.setActive(true);
        expect(engine.requests[2]!.fen).toBe(positions[0]!.fen);
        retry.dispose();
    });

    it('skips terminal children and distinguishes board rollover and histories sharing a FEN', () => {
        const chess = new Chess();
        for (const san of ['f3', 'e5', 'g4']) chess.move(san);
        const session = offer({ ...startSession('standard', 'default'), pgn: chess.pgn() }, 'Qh4#', 'best');
        expect(nextBranches(session)).toEqual([]);
        const first = startSession('standard', 'default');
        expect(currentPosition(first)!.key).not.toBe(currentPosition({ ...first, gamesCompleted: 1 })!.key);
        const histories = [['Nf3', 'Nf6', 'Ng1', 'Ng8'], ['Nc3', 'Nc6', 'Nb1', 'Nb8']].map(moves => {
            const board = createChess(''); for (const move of moves) board.move(move);
            return currentPosition({ ...first, pgn: board.pgn() })!;
        });
        expect(histories[0]!.fen).toBe(histories[1]!.fen);
        expect(histories[0]!.key).not.toBe(histories[1]!.key);
    });
});
