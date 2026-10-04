import { Chess } from 'chess.js';
import type { EngineEvaluation, GeneratedLevel, TreeNode } from '../../types/level.js';
import { Stockfish, type AnalysisEngine } from '../tree-generator/stockfish.js';
import { validateGeneratedLevel } from '../tree-generator/validate.js';
import { resolveScoringConfig, type ScoringConfig } from './config.js';
import { aggregateDifficulty, bestMoveSubtlety, clamp, depthToSeparation, moveAmbiguity, moveUniqueness, normalizeScore,
    type WeightedDifficulty } from './signals.js';

export interface NodeDifficulty extends WeightedDifficulty {
    fen: string;
    signals: ScoringConfig['nodeWeights'];
    /** Fresh analysis prefers another offered move, beyond an evaluation tie. */
    bestMoveChanged: boolean;
}

export interface ScoringResult {
    difficulty: number;
    nodes: NodeDifficulty[];
    engineVersion: string | null;
}

export interface ScoringOptions {
    config?: unknown;
    enginePath?: string;
    onProgress?: (node: NodeDifficulty, decisionsScored: number) => void;
}

export function validateScorableLevel(level: GeneratedLevel): void {
    if (!level || !Number.isInteger(level.difficulty) || level.difficulty < -1 || level.difficulty > 100) {
        throw new Error('Invalid generated level: difficulty must be -1 or an integer from 0 to 100.');
    }
    // Replay validation is shared with generation; its sentinel check applies only to generation.
    validateGeneratedLevel({ ...level, difficulty: -1 });
}

/** Analyze without mutating the level. Engine callers retain ownership of supplied engines. */
export async function scoreLevel(level: GeneratedLevel, options: ScoringOptions = {}, suppliedEngine?: AnalysisEngine): Promise<ScoringResult> {
    const config = resolveScoringConfig(options.config);
    validateScorableLevel(level);
    if (level.root.kind !== 'decision') return { difficulty: 0, nodes: [], engineVersion: null };
    const engine = suppliedEngine ?? await Stockfish.start({ enginePath: options.enginePath, timeoutMs: config.timeoutMs });
    const nodes: NodeDifficulty[] = [];
    const startingFen = level.root.fen;

    const visit = async (node: TreeNode, moves: string[], reachProbability: number): Promise<void> => {
        if (node.kind !== 'decision') return;
        const offeredMoves = node.choices.map(choice => choice.playerMove.uci);
        const bestMove = node.choices.find(choice => choice.quality === 'best')!.playerMove.uci;
        const legalMoves = new Set(new Chess(node.fen).moves({ verbose: true }).map(move => move.lan));
        const analyze = async (searchDepth: number, searchMoves?: string[]): Promise<EngineEvaluation[]> => {
            const multiPv = searchMoves?.length ?? Math.min(config.multiPv, legalMoves.size);
            const lines = await engine.analyze({ startingFen, moves: [...moves], sideToMove: level.playerColor,
                playerColor: level.playerColor, searchDepth, multiPv, searchMoves, resetHash: true });
            const actualMoves = lines.map(line => line.pv[0]);
            if (lines.length !== multiPv || new Set(actualMoves).size !== multiPv
                || actualMoves.some(move => !legalMoves.has(move!) || (searchMoves && !searchMoves.includes(move!)))
                || lines.some(line => !Number.isFinite(line.score.value) || !['cp', 'mate'].includes(line.score.type)
                    || line.depth !== searchDepth)) {
                throw new Error(`Stockfish returned incomplete, illegal or insufficient-depth analysis at ${node.fen}.`);
            }
            return lines;
        };

        let signals: NodeDifficulty['signals'] = { ambiguity: 0, depthToSeparation: 0, subtlety: 0, uniqueness: 0 };
        let bestMoveChanged = false;
        // Selecting the sole offered move requires no discrimination.
        if (offeredMoves.length > 1) {
            const analyses: EngineEvaluation[][] = [];
            for (const depth of config.depths) analyses.push(await analyze(depth, offeredMoves));
            const final = analyses.at(-1)!;
            // When every legal move is offered, the final candidate analysis already measures uniqueness.
            const broad = legalMoves.size === offeredMoves.length ? final : await analyze(config.depths.at(-1)!);
            const stored = node.choices.map(choice => choice.evaluation);
            signals = {
                ambiguity: config.storedEvaluationWeight * moveAmbiguity(stored, bestMove, config)
                    + (1 - config.storedEvaluationWeight) * moveAmbiguity(final, bestMove, config),
                depthToSeparation: depthToSeparation(analyses, bestMove, config),
                subtlety: bestMoveSubtlety(node.fen, bestMove, moves.at(-1), config),
                uniqueness: moveUniqueness(broad, config),
            };
            const bestScore = normalizeScore(final.find(line => line.pv[0] === bestMove)!.score, config);
            bestMoveChanged = final.some(line => normalizeScore(line.score, config) > bestScore);
        }
        const difficulty = clamp(Object.entries(signals).reduce((sum, [key, value]) => sum
            + config.nodeWeights[key as keyof typeof signals] * value, 0));
        const result: NodeDifficulty = { fen: node.fen, difficulty, reachProbability, signals, bestMoveChanged };
        nodes.push(result);
        options.onProgress?.(result, nodes.length);

        const probabilityMass = node.choices.reduce((sum, choice) => sum + config.branchProbabilities[choice.quality], 0);
        for (const choice of node.choices) {
            await visit(choice.next, [...moves, choice.playerMove.uci, ...(choice.opponentReply ? [choice.opponentReply.uci] : [])],
                reachProbability * config.branchProbabilities[choice.quality] / probabilityMass);
        }
    };

    try {
        await visit(level.root, [], 1);
        return { difficulty: aggregateDifficulty(nodes, config), nodes, engineVersion: engine.version };
    } finally {
        if (!suppliedEngine) await (engine as Stockfish).close();
    }
}

export { DEFAULT_SCORING_CONFIG, resolveScoringConfig, type ScoringConfig } from './config.js';
