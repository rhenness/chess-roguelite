import { Chess } from 'chess.js';
import type { EngineEvaluation, GeneratedLevel, TreeNode } from '../../types/level.js';
import { isSkillTier, SKILL_TIER_CONFIG } from '../../config/difficulty.js';
import { applyUci, colorName, terminalNode } from './chess.js';

function requireRule(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(`Invalid generated level: ${message}`);
}

function validateEvaluation(evaluation: EngineEvaluation, fen: string, move?: string): void {
    requireRule(Number.isInteger(evaluation.depth) && evaluation.depth > 0, 'invalid analysis depth');
    requireRule(['cp', 'mate'].includes(evaluation.score.type) && Number.isInteger(evaluation.score.value), 'invalid evaluation score');
    requireRule(evaluation.pv.length > 0, 'empty principal variation');
    if (move) requireRule(evaluation.pv[0] === move, 'principal variation does not start with the selected move');
    const board = new Chess(fen);
    for (const uci of evaluation.pv) applyUci(board, uci);
}

/** Replays every branch, including its history, before it can be saved for scoring. */
export function validateGeneratedLevel(level: GeneratedLevel): void {
    requireRule(typeof level.id === 'string' && level.id.trim().length > 0, 'missing level id');
    requireRule(level.schemaVersion === 2, 'unsupported schema version');
    requireRule(!Object.hasOwn(level, 'difficulty'), 'version 2 levels must use difficultyScore');
    requireRule(Number.isFinite(Date.parse(level.generatedAt)), 'invalid generation timestamp');
    requireRule(level.difficultyScore === -1, 'generator must leave difficulty unscored');
    requireRule(level.skillTier === undefined || isSkillTier(level.skillTier), 'invalid skill tier');
    const tierOptions = level.skillTier ? SKILL_TIER_CONFIG[level.skillTier].treeGeneration.playerOptions : undefined;
    const { decisionDepth, engine } = level.generation;
    requireRule(level.generation.configVersion === undefined
        || (Number.isInteger(level.generation.configVersion) && level.generation.configVersion > 0), 'invalid tier config version');
    requireRule(level.generation.regenerated === undefined || typeof level.generation.regenerated === 'boolean', 'invalid regeneration flag');
    requireRule(Number.isInteger(decisionDepth) && decisionDepth >= 0, 'invalid decision depth');
    requireRule(engine.name === 'Stockfish' && engine.version.length > 0, 'missing Stockfish version');
    requireRule(Number.isInteger(engine.searchDepth) && engine.searchDepth > 0, 'invalid search depth');
    requireRule(Number.isInteger(engine.multiPv) && engine.multiPv >= 4 && engine.multiPv <= 256, 'invalid MultiPV count');
    const board = new Chess(level.root.fen);
    requireRule(colorName(board.turn()) === level.playerColor, 'player color must match the starting FEN');

    const visit = (node: TreeNode, decisionsTaken: number): void => {
        requireRule(node.fen === board.fen(), 'node FEN differs from replayed position');
        requireRule(node.decisionsTaken === decisionsTaken, 'incorrect decision count');
        const terminal = terminalNode(board, decisionsTaken);
        if (terminal) {
            requireRule(node.kind === 'terminal', 'terminal detection must precede the depth limit');
            requireRule(node.reason === terminal.reason && node.result === terminal.result, 'incorrect terminal result');
            requireRule(!('choices' in node), 'terminal nodes cannot have choices');
            return;
        }
        if (decisionsTaken === decisionDepth) {
            requireRule(node.kind === 'depth-limit', 'expected a depth-limit node');
            requireRule(!('choices' in node), 'depth-limit nodes cannot have choices');
            return;
        }
        requireRule(decisionsTaken < decisionDepth && node.kind === 'decision', 'expected a player decision');
        requireRule(colorName(board.turn()) === level.playerColor, 'decision is not on the player turn');
        requireRule(node.choices.length === Math.min(tierOptions?.length ?? 4, board.moves().length), 'incorrect number of choices');
        requireRule(new Set(node.choices.map(choice => choice.playerMove.uci)).size === node.choices.length, 'duplicate moves');
        if (tierOptions) {
            requireRule(node.choices.every((choice, i) => choice.quality === tierOptions[i]!.quality), 'incorrect tier quality labels');
        } else {
            requireRule(new Set(node.choices.map(choice => choice.quality)).size === node.choices.length, 'duplicate quality labels');
        }
        requireRule(node.choices.every(choice => ['best', 'good', 'inaccuracy', 'bad'].includes(choice.quality)), 'invalid quality label');
        const best = node.choices.find(choice => choice.quality === 'best');
        requireRule(Boolean(best), 'missing best move');
        requireRule(JSON.stringify(best!.evaluation) === JSON.stringify(node.bestEvaluation), 'best baseline does not match best choice');
        validateEvaluation(node.bestEvaluation, node.fen, best!.playerMove.uci);
        for (const choice of node.choices) {
            validateEvaluation(choice.evaluation, node.fen, choice.playerMove.uci);
            const playerMove = applyUci(board, choice.playerMove.uci);
            try {
                requireRule(playerMove.san === choice.playerMove.san, 'incorrect player SAN');
                requireRule(board.fen() === choice.fenAfterPlayerMove, 'incorrect FEN after player move');
                const ended = terminalNode(board, decisionsTaken + 1);
                requireRule((choice.opponentReply === null) === Boolean(ended), 'opponent reply must be null exactly when the player ends the game');
                if (choice.opponentReply) {
                    const reply = applyUci(board, choice.opponentReply.uci);
                    try {
                        requireRule(reply.san === choice.opponentReply.san, 'incorrect opponent SAN');
                        visit(choice.next, decisionsTaken + 1);
                    } finally { board.undo(); }
                } else visit(choice.next, decisionsTaken + 1);
            } finally { board.undo(); }
        }
    };
    visit(level.root, 0);
}
