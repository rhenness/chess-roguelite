import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { EngineEvaluation, TreeNode } from '../../types/level.js';
import { applyUci } from './chess.js';
import { generateTree } from './index.js';
import { selectCandidates, selectOpponentReply } from './selection.js';
import { Stockfish, parseInfo, type AnalysisEngine, type AnalysisRequest } from './stockfish.js';
import { validateGeneratedLevel } from './validate.js';

class LegalEngine implements AnalysisEngine {
    version = 'Stockfish test double';
    requests: AnalysisRequest[] = [];
    constructor(private cycleKnights = false) {}
    async analyze(request: AnalysisRequest): Promise<EngineEvaluation[]> {
        this.requests.push(request);
        const board = new Chess(request.startingFen);
        for (const move of request.moves) applyUci(board, move);
        const moves = board.moves({ verbose: true });
        if (this.cycleKnights) {
            const cycle = ['g1f3', 'f3g1', 'g8f6', 'f6g8'];
            moves.sort((a, b) => Number(cycle.includes(b.lan)) - Number(cycle.includes(a.lan)));
        }
        return moves.slice(0, request.multiPv).map((move, i) => ({
            score: { type: 'cp', value: request.sideToMove === request.playerColor ? 100 - 60 * i : -100 + 60 * i },
            depth: request.searchDepth, pv: [move.lan],
        }));
    }
}

function countNodes(node: TreeNode): number {
    return 1 + (node.kind === 'decision' ? node.choices.reduce((total, choice) => total + countNodes(choice.next), 0) : 0);
}

test('default depth generates four decisions, four branches each, and final opponent replies', async () => {
    const engine = new LegalEngine();
    const level = await generateTree({ fen: DEFAULT_POSITION, random: () => 0 }, engine);
    assert.equal(level.generation.decisionDepth, 4);
    assert.equal(level.difficulty, -1);
    assert.match(level.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.throws(() => validateGeneratedLevel({ ...level, id: '' }), /missing level id/);
    assert.equal(countNodes(level.root), 341);
    assert.equal(engine.requests.filter(request => request.moves.length % 2 === 1).length, 340);
    validateGeneratedLevel(level);
    const altered = structuredClone(level);
    if (altered.root.kind === 'decision') altered.root.choices[0]!.fenAfterPlayerMove = DEFAULT_POSITION;
    assert.throws(() => validateGeneratedLevel(altered), /incorrect FEN after player move/);
});

test('terminal starting positions precede depth limit and require no analysis', async () => {
    const ids = new Set<string>();
    const positions = [
        ['k7/1Q6/2K5/8/8/8/8/8 b - - 0 1', 'checkmate', 'white'],
        ['k7/8/1QK5/8/8/8/8/8 b - - 0 1', 'stalemate', 'draw'],
        ['4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'draw', 'draw'],
        [DEFAULT_POSITION.replace('0 1', '100 1'), 'draw', 'draw'],
    ];
    for (const [fen, reason, result] of positions) {
        const engine = new LegalEngine();
        const level = await generateTree({ fen: fen!, decisionDepth: 0 }, engine);
        assert.ok(!ids.has(level.id));
        ids.add(level.id);
        assert.equal(level.root.kind, 'terminal');
        if (level.root.kind === 'terminal') {
            assert.equal(level.root.reason, reason);
            assert.equal(level.root.result, result);
        }
        assert.equal(engine.requests.length, 0);
    }
});

test('nonterminal depth zero has no choices or analysis', async () => {
    const engine = new LegalEngine();
    const level = await generateTree({ fen: DEFAULT_POSITION, decisionDepth: 0 }, engine);
    assert.equal(level.root.kind, 'depth-limit');
    assert.equal(engine.requests.length, 0);
});

test('branch history detects repetition after the final opponent reply', async () => {
    const engine = new LegalEngine(true);
    const level = await generateTree({ fen: DEFAULT_POSITION, random: () => 0 }, engine);
    let node = level.root;
    for (let i = 0; i < 4; i++) {
        assert.equal(node.kind, 'decision');
        if (node.kind !== 'decision') throw new Error('Missing cycle decision');
        node = node.choices[0]!.next;
    }
    assert.equal(node.kind, 'terminal');
    if (node.kind === 'terminal') assert.equal(node.result, 'draw');
    assert.ok(engine.requests.some(request => request.moves.length === 7));
});

test('selection uses loss targets, distinct ordered moves, and the worst available candidate', () => {
    const candidates: EngineEvaluation[] = [100, 95, 50, 0, -50, -500].map((value, i) => ({
        score: { type: 'cp', value }, depth: 10, pv: [`move${i}`],
    }));
    const choices = selectCandidates(candidates);
    assert.deepEqual(choices.map(choice => choice.quality), ['best', 'good', 'inaccuracy', 'bad']);
    assert.deepEqual(choices.map(choice => choice.evaluation.score.value), [100, 50, -50, -500]);
    assert.equal(selectCandidates(candidates.slice(0, 2)).length, 2);
    const mateCandidates: EngineEvaluation[] = [
        { score: { type: 'mate', value: 2 }, depth: 10, pv: ['a'] },
        { score: { type: 'mate', value: 5 }, depth: 10, pv: ['b'] },
        { score: { type: 'cp', value: 1000 }, depth: 10, pv: ['c'] },
        { score: { type: 'mate', value: -2 }, depth: 10, pv: ['d'] },
    ];
    assert.deepEqual(selectCandidates(mateCandidates).map(choice => choice.evaluation), mateCandidates);
});

test('UCI parser accepts mate/promotion lines and rejects bounds or incomplete info', () => {
    assert.deepEqual(parseInfo('info depth 8 multipv 2 score mate -3 nodes 123 pv e7e8q h8h7'), {
        rank: 2, evaluation: { depth: 8, score: { type: 'mate', value: -3 }, pv: ['e7e8q', 'h8h7'] },
    });
    assert.equal(parseInfo('info depth 12 score cp 40 lowerbound pv e2e4'), null);
    assert.equal(parseInfo('info depth 12 score cp 40 upperbound pv e2e4'), null);
    assert.equal(parseInfo('info depth 12 nodes 500'), null);
});

test('opponent replies use 40/40/18/2 weights and losses from the opponent perspective', () => {
    const candidates: EngineEvaluation[] = [-100, -95, -50, 0, 50, 500].map((value, i) => ({
        score: { type: 'cp', value }, depth: 10, pv: [`move${i}`],
    }));
    const before = structuredClone(candidates);
    for (const [roll, index] of [[0, 0], [0.399999, 0], [0.4, 2], [0.799999, 2],
        [0.8, 4], [0.979999, 4], [0.98, 5], [0.999999, 5]]) {
        assert.equal(selectOpponentReply(candidates, () => roll!).pv[0], `move${index}`);
    }
    const counts = new Map<string, number>();
    for (let i = 0; i < 10_000; i++) {
        const move = selectOpponentReply(candidates, () => (i + 0.5) / 10_000).pv[0]!;
        counts.set(move, (counts.get(move) ?? 0) + 1);
    }
    assert.deepEqual([...counts.values()], [4000, 4000, 1800, 200]);
    assert.deepEqual(candidates, before);
    const mateCandidates: EngineEvaluation[] = [
        { score: { type: 'mate', value: -2 }, depth: 10, pv: ['a'] },
        { score: { type: 'mate', value: -5 }, depth: 10, pv: ['b'] },
        { score: { type: 'cp', value: -1000 }, depth: 10, pv: ['c'] },
        { score: { type: 'mate', value: 2 }, depth: 10, pv: ['d'] },
    ];
    assert.equal(selectOpponentReply(mateCandidates, () => 0), mateCandidates[0]);
    assert.equal(selectOpponentReply(mateCandidates, () => 0.98), mateCandidates[3]);
});

test('opponent selection renormalizes available qualities and handles forced replies', () => {
    const candidates: EngineEvaluation[] = [-100, 0, 100].map((value, i) => ({
        score: { type: 'cp', value }, depth: 10, pv: [`move${i}`],
    }));
    assert.equal(selectOpponentReply(candidates.slice(0, 1), () => 0.999), candidates[0]);
    assert.equal(selectOpponentReply(candidates.slice(0, 2), () => 0.499), candidates[0]);
    assert.equal(selectOpponentReply(candidates.slice(0, 2), () => 0.5), candidates[1]);
    assert.equal(selectOpponentReply(candidates, () => 0.81), candidates[1]);
    assert.equal(selectOpponentReply(candidates, () => 0.82), candidates[2]);
    assert.throws(() => selectOpponentReply([]), /No candidates/);
    for (const roll of [-0.1, 1, NaN, Infinity]) {
        assert.throws(() => selectOpponentReply(candidates, () => roll), /Random value/);
    }
});

test('generation stores weighted replies for either player color and analyzes every reply candidate', async () => {
    for (const fen of [DEFAULT_POSITION, DEFAULT_POSITION.replace(' w ', ' b ')]) {
        const engine = new LegalEngine();
        const rolls = [0, 0.4, 0.8, 0.98];
        let draws = 0;
        const level = await generateTree({ fen, decisionDepth: 1, random: () => rolls[draws++]! }, engine);
        assert.equal(draws, 4);
        if (level.root.kind !== 'decision') throw new Error('Expected a decision');
        for (const [i, choice] of level.root.choices.entries()) {
            const board = new Chess(choice.fenAfterPlayerMove);
            const legalMoves = board.moves({ verbose: true });
            const index = i === 3 ? legalMoves.length - 1 : i;
            assert.equal(choice.opponentReply!.uci, legalMoves[index]!.lan);
            applyUci(board, choice.opponentReply!.uci);
            assert.equal(choice.next.fen, board.fen());
            assert.equal(choice.next.kind, 'depth-limit');
        }
        for (const request of engine.requests.filter(request => request.moves.length === 1)) {
            const board = new Chess(request.startingFen);
            request.moves.forEach(move => applyUci(board, move));
            assert.equal(request.multiPv, board.moves().length);
        }
        validateGeneratedLevel(level);
    }
});

test('generation rejects incomplete, duplicate, or illegal opponent candidates', async () => {
    for (const corruption of ['incomplete', 'duplicate', 'illegal']) {
        const engine = new LegalEngine();
        const analyze = engine.analyze.bind(engine);
        engine.analyze = async request => {
            const lines = await analyze(request);
            if (request.moves.length === 1) {
                if (corruption === 'incomplete') return lines.slice(1);
                if (corruption === 'duplicate') lines[1] = lines[0]!;
                if (corruption === 'illegal') lines[0]!.pv = ['a1a8'];
            }
            return lines;
        };
        await assert.rejects(generateTree({ fen: DEFAULT_POSITION, decisionDepth: 1 }, engine), /incomplete, duplicate, or illegal/);
    }
});

test('invalid inputs fail before calling an engine', async () => {
    const engine = new LegalEngine();
    await assert.rejects(generateTree({ fen: 'invalid' }, engine), /Invalid starting FEN/);
    for (const options of [{ decisionDepth: -1 }, { decisionDepth: 1.5 }, { searchDepth: 0 }, { multiPv: 3 }, { timeoutMs: 0 }]) {
        await assert.rejects(generateTree({ fen: DEFAULT_POSITION, ...options }, engine), /must be an integer/);
    }
    assert.equal(engine.requests.length, 0);
});

test('real Stockfish supports white/black perspective, mating moves, promotions and fewer legal choices', async () => {
    const engine = await Stockfish.start();
    try {
        const white = await engine.analyze({ startingFen: DEFAULT_POSITION, moves: [],
            playerColor: 'white', sideToMove: 'white', searchDepth: 2, multiPv: 4 });
        const blackPerspective = await engine.analyze({ startingFen: DEFAULT_POSITION, moves: [],
            playerColor: 'black', sideToMove: 'white', searchDepth: 2, multiPv: 4 });
        assert.equal(white.length, 4);
        assert.ok(white.every(line => line.depth === 2));
        assert.ok(blackPerspective[0]!.score.value <= 0);
        const black = await generateTree({ fen: DEFAULT_POSITION.replace(' w ', ' b '), decisionDepth: 1, searchDepth: 2 }, engine);
        assert.equal(black.playerColor, 'black');
        validateGeneratedLevel(black);

        const mate = await generateTree({ fen: '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1', decisionDepth: 1, searchDepth: 2 }, engine);
        assert.equal(mate.root.kind, 'decision');
        if (mate.root.kind === 'decision') {
            const best = mate.root.choices[0]!;
            assert.equal(best.opponentReply, null);
            assert.equal(best.next.kind, 'terminal');
            assert.equal(best.evaluation.score.type, 'mate');
        }

        const promotion = await generateTree({ fen: '8/7P/8/8/8/2k5/1r6/K7 w - - 0 1', decisionDepth: 1, searchDepth: 2 }, engine);
        assert.equal(promotion.root.kind, 'decision');
        if (promotion.root.kind === 'decision') {
            assert.equal(promotion.root.choices.length, 4);
            for (const choice of promotion.root.choices) assert.match(choice.playerMove.uci, /^h7h8[qrbn]$/);
        }

        const forced = await generateTree({ fen: 'k7/8/2K5/8/8/8/8/1R6 b - - 0 1', decisionDepth: 1, searchDepth: 2 }, engine);
        assert.equal(forced.root.kind, 'decision');
        if (forced.root.kind === 'decision') {
            assert.ok(forced.root.choices.length < 4);
            assert.equal(forced.root.choices[0]!.quality, 'best');
        }
    } finally { await engine.close(); }
});

test('missing native engine fails promptly and is cleaned up', async () => {
    await assert.rejects(Stockfish.start({ enginePath: 'nonexistent-stockfish-test-engine', timeoutMs: 500 }), /Cannot start Stockfish/);
});
