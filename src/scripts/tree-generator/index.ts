import { randomUUID } from 'node:crypto';
import { Chess, validateFen } from 'chess.js';
import type { GeneratedLevel, PlayerChoice, TreeNode } from '../../types/level.js';
import { applyUci, colorName, describeMove, terminalNode } from './chess.js';
import { selectCandidates, selectOpponentReply } from './selection.js';
import { Stockfish, type AnalysisEngine } from './stockfish.js';
import { validateGeneratedLevel } from './validate.js';

export interface GeneratorOptions {
    fen: string;
    decisionDepth?: number;
    searchDepth?: number;
    /** Defaults to 256, covering all legal moves (Stockfish clamps to legal count). */
    multiPv?: number;
    enginePath?: string;
    timeoutMs?: number;
    /** Optional random source for reproducible reply selection; defaults to Math.random. */
    random?: () => number;
    onProgress?: (progress: { decisionsGenerated: number; decisionsTaken: number }) => void;
}

export function integerOption(name: string, value: number, min: number, max: number): number {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}.`);
    }
    return value;
}

/** Injectable engine supports callers/tests; otherwise this function owns its Stockfish process. */
export async function generateTree(options: GeneratorOptions, suppliedEngine?: AnalysisEngine): Promise<GeneratedLevel> {
    const fenResult = validateFen(options.fen);
    if (!fenResult.ok) throw new Error(`Invalid starting FEN: ${fenResult.error}`);
    const decisionDepth = integerOption('decisionDepth', options.decisionDepth ?? 4, 0, 10);
    const searchDepth = integerOption('searchDepth', options.searchDepth ?? 10, 1, 128);
    const multiPv = integerOption('multiPv', options.multiPv ?? 256, 4, 256);
    const timeoutMs = integerOption('timeoutMs', options.timeoutMs ?? 120_000, 1, 2_147_483_647);
    const board = new Chess(options.fen);
    const startingFen = board.fen();
    const playerColor = colorName(board.turn());
    const engine = suppliedEngine ?? await Stockfish.start({ enginePath: options.enginePath, timeoutMs });
    const history: string[] = [];
    let decisionsGenerated = 0;
    const analyze = (count: number) => engine.analyze({
        startingFen, moves: [...history], sideToMove: colorName(board.turn()),
        playerColor, searchDepth, multiPv: count,
    });

    const analyzeCandidates = async () => {
        const legalMoves = board.moves({ verbose: true });
        const count = Math.min(multiPv, legalMoves.length);
        const candidates = await analyze(count);
        const legalUci = new Set(legalMoves.map(move => move.lan));
        if (candidates.length !== count
            || candidates.some(candidate => !legalUci.has(candidate.pv[0]!))
            || new Set(candidates.map(candidate => candidate.pv[0])).size !== candidates.length) {
            throw new Error(`Stockfish returned incomplete, duplicate, or illegal candidates at ${board.fen()}.`);
        }
        return candidates;
    };

    const expand = async (decisionsTaken: number): Promise<TreeNode> => {
        const terminal = terminalNode(board, decisionsTaken);
        if (terminal) return terminal;
        const fen = board.fen();
        if (decisionsTaken === decisionDepth) return { kind: 'depth-limit', fen, decisionsTaken };
        const candidates = await analyzeCandidates();
        const selected = selectCandidates(candidates);
        const choices: PlayerChoice[] = [];
        options.onProgress?.({ decisionsGenerated: ++decisionsGenerated, decisionsTaken });
        for (const { quality, evaluation } of selected) {
            const playerMove = applyUci(board, evaluation.pv[0]!);
            history.push(playerMove.lan);
            try {
                const fenAfterPlayerMove = board.fen();
                const ended = terminalNode(board, decisionsTaken + 1);
                if (ended) {
                    choices.push({ quality, playerMove: describeMove(playerMove), evaluation,
                        fenAfterPlayerMove, opponentReply: null, next: ended });
                    continue;
                }
                const replies = await analyzeCandidates();
                const replyUci = selectOpponentReply(replies, options.random).pv[0]!;
                const reply = applyUci(board, replyUci);
                history.push(reply.lan);
                try {
                    choices.push({ quality, playerMove: describeMove(playerMove), evaluation,
                        fenAfterPlayerMove, opponentReply: describeMove(reply), next: await expand(decisionsTaken + 1) });
                } finally { history.pop(); board.undo(); }
            } finally { history.pop(); board.undo(); }
        }
        return { kind: 'decision', fen, decisionsTaken, bestEvaluation: candidates[0]!, choices };
    };

    try {
        const level: GeneratedLevel = {
            id: randomUUID(),
            schemaVersion: 1, generatedAt: new Date().toISOString(), playerColor,
            generation: { decisionDepth, engine: { name: 'Stockfish', version: engine.version, searchDepth, multiPv } },
            root: await expand(0), difficulty: -1,
        };
        validateGeneratedLevel(level);
        return level;
    } finally {
        if (!suppliedEngine) await (engine as Stockfish).close();
    }
}

export { validateGeneratedLevel } from './validate.js';
