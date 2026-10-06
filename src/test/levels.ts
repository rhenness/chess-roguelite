import { Chess } from 'chess.js';
import type { DecisionNode, GeneratedLevel, TreeNode } from '../types/level';
import { chooseCheckpointItem, nextLevel, type RunState } from '../game/run';
import type { SkillTier } from '../config/difficulty';
import { LEGACY_PROFILE_IDS, normalizeLevel } from '../types/level-schema';

/** Advance existing full-run scenarios through a reward choice without activating it. */
export function continueToNextRound(run: RunState): RunState {
    const next = nextLevel(run);
    if (next.phase !== 'checkpoint') return next;
    const reward = next.checkpointRewards.find(entry => entry.afterRound === next.levelIndex + 1)!;
    return chooseCheckpointItem(next, reward.offers[0]);
}

const qualities = ['best', 'good', 'inaccuracy', 'bad'] as const;
const evaluation = { depth: 1, score: { type: 'cp' as const, value: 0 }, pv: [] };

/** Small legal trees keep gameplay tests independent of the offline engine. */
function makeNode(fen: string, depth: number, limit: number): TreeNode {
    if (depth === limit) return { kind: 'depth-limit', fen, decisionsTaken: depth };
    const moves = new Chess(fen).moves({ verbose: true }).slice(0, 4);
    return {
        kind: 'decision', fen, decisionsTaken: depth, bestEvaluation: evaluation,
        choices: moves.map((move, index) => {
            const board = new Chess(fen);
            board.move(move);
            const fenAfterPlayerMove = board.fen();
            const reply = board.move(board.moves()[0]!);
            return {
                quality: qualities[index]!, playerMove: { san: move.san, uci: move.from + move.to + (move.promotion ?? '') },
                evaluation, fenAfterPlayerMove,
                opponentReply: { san: reply.san, uci: reply.from + reply.to + (reply.promotion ?? '') },
                next: makeNode(board.fen(), depth + 1, limit),
            };
        }),
    };
}

export function makeLevel(id = 'easy', difficultyScore = 50, decisionDepth = 1, playerColor: 'white' | 'black' = 'white'): GeneratedLevel {
    const board = new Chess();
    if (playerColor === 'black') board.move('e4');
    return normalizeLevel({
        id, schemaVersion: 2, generatedAt: '2026-10-03T12:00:00.000Z', difficultyScore, playerColor,
        generation: { decisionDepth, engine: { name: 'Stockfish', version: 'fixture', searchDepth: 1, multiPv: 4 } },
        root: makeNode(board.fen(), 0, decisionDepth),
    });
}

export const decision = (level: GeneratedLevel): DecisionNode => {
    if (level.root.kind !== 'decision') throw new Error('Fixture must have a decision root.');
    return level.root;
};

export function makeSkillLevel(skillTier: SkillTier, id: string = skillTier, difficultyScore = skillTier === 'expert' ? 60 : skillTier === 'intermediate' ? 50 : 10, depth = 1): GeneratedLevel {
    const level = makeLevel(id, difficultyScore, depth);
    level.generation.profileId = LEGACY_PROFILE_IDS[skillTier];
    level.generation.targetOptionCount = skillTier === 'beginner' ? 2 : 4;
    level.generation.playerQualities = skillTier === 'beginner' ? ['best', 'bad']
        : skillTier === 'expert' ? ['best', 'good', 'inaccuracy', 'inaccuracy'] : ['best', 'good', 'inaccuracy', 'bad'];
    const visit = (node: TreeNode) => {
        if (node.kind !== 'decision') return;
        if (skillTier === 'beginner') node.choices = [node.choices[0]!, node.choices.at(-1)!];
        if (skillTier === 'expert') node.choices.at(-1)!.quality = 'inaccuracy';
        node.choices.forEach(choice => visit(choice.next));
    };
    visit(level.root);
    return level;
}
