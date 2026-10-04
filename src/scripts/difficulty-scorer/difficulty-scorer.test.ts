import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { EngineEvaluation, GeneratedLevel } from '../../types/level.js';
import { applyUci } from '../tree-generator/chess.js';
import { generateTree } from '../tree-generator/index.js';
import { Stockfish, type AnalysisEngine, type AnalysisRequest } from '../tree-generator/stockfish.js';
import { resolveScoringConfig } from './config.js';
import { replaceDifficulty, scoreLevelFiles } from './files.js';
import { scoreLevel } from './index.js';
import { aggregateDifficulty, bestMoveSubtlety, depthToSeparation, moveAmbiguity, moveUniqueness, normalizeScore } from './signals.js';

class LegalEngine implements AnalysisEngine {
    version = 'Stockfish scoring test double';
    requests: AnalysisRequest[] = [];
    failNext = false;
    async analyze(request: AnalysisRequest): Promise<EngineEvaluation[]> {
        this.requests.push(request);
        if (this.failNext) { this.failNext = false; throw new Error('Simulated engine failure'); }
        const board = new Chess(request.startingFen);
        for (const move of request.moves) applyUci(board, move);
        const moves = board.moves({ verbose: true }).sort((a, b) => a.lan.localeCompare(b.lan));
        return moves.map((move, i): EngineEvaluation => ({ depth: request.searchDepth,
            score: { type: 'cp', value: 1000 - 100 * i }, pv: [move.lan] }))
            .filter(line => !request.searchMoves || request.searchMoves.includes(line.pv[0]!)).slice(0, request.multiPv);
    }
}

const config = resolveScoringConfig({ depths: [1, 2] });
const lines = (values: number[]): EngineEvaluation[] => values.map((value, i) => ({ depth: 2, score: { type: 'cp', value }, pv: [`move${i}`] }));
const fixture = (depth = 1, fen = DEFAULT_POSITION): Promise<GeneratedLevel> => generateTree({ fen, decisionDepth: depth, searchDepth: 2, random: () => 0 }, new LegalEngine());

async function withDirectory(work: (directory: string) => Promise<void>): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), 'difficulty-scorer-'));
    try { await work(directory); }
    finally {
        assert.equal(dirname(directory), tmpdir());
        assert.ok(directory.startsWith(join(tmpdir(), 'difficulty-scorer-')));
        await rm(directory, { recursive: true, force: true });
    }
}

test('config merges nested overrides and rejects invalid/unknown options before engine analysis', async () => {
    const custom = resolveScoringConfig({ subtlety: { quiet: 80 } });
    assert.equal(custom.subtlety.quiet, 80);
    assert.equal(custom.subtlety.capture, 35);
    for (const overrides of [{ depths: [4] }, { depths: [4, 4] }, { depths: [2, 1] }, { depths: [0, 2] },
        { multiPv: 1 }, { timeoutMs: 0 }, { nodeWeights: { ambiguity: 1 } }, { branchProbabilities: { bad: 0 } },
        { normalization: { mateBase: 100 } }, { subtlety: { quiet: 101 } }, { unknown: 1 }, { ambiguityScaleCp: NaN }]) {
        assert.throws(() => resolveScoringConfig(overrides));
    }
    const engine = new LegalEngine();
    const level = await fixture();
    await assert.rejects(scoreLevel(level, { config: { depths: [] } }, engine));
    await assert.rejects(scoreLevel({ ...level, schemaVersion: 2 } as unknown as GeneratedLevel, {}, engine), /schema version/);
    await assert.rejects(scoreLevel({ ...level, difficulty: 101 }, {}, engine), /difficulty/);
    assert.equal(engine.requests.length, 0);
});

test('mate normalization preserves forced-win/loss ordering and separates mate from cp', () => {
    const normalized = [
        { type: 'mate', value: 2 }, { type: 'mate', value: 10 }, { type: 'cp', value: 100_000 },
        { type: 'cp', value: -100_000 }, { type: 'mate', value: -10 }, { type: 'mate', value: -2 }, { type: 'mate', value: 0 },
    ].map(score => normalizeScore(score as EngineEvaluation['score'], config));
    for (let i = 1; i < normalized.length; i++) assert.ok(normalized[i - 1]! > normalized[i]!);
    assert.ok(normalizeScore({ type: 'mate', value: 200 }, config) > config.normalization.cpLimit);
});

test('ambiguity rises for close alternatives and deeper separation raises difficulty', () => {
    assert.equal(moveAmbiguity(lines([50, 50, 50, 50]), 'move0', config), 100);
    assert.ok(moveAmbiguity(lines([50, 0, -50, -100]), 'move0', config)
        > moveAmbiguity(lines([50, -400, -500, -600]), 'move0', config));
    assert.equal(depthToSeparation([lines([200, 0]), lines([200, 0])], 'move0', config), 0);
    assert.equal(depthToSeparation([lines([0, 0]), lines([200, 0])], 'move0', config), 100);
    assert.equal(depthToSeparation([lines([200, 0]), lines([0, 200])], 'move0', config), 100);
    const four = resolveScoringConfig({ depths: [2, 4, 6, 8] });
    assert.equal(depthToSeparation([lines([0, 0]), lines([200, 0]), lines([0, 0]), lines([200, 0])], 'move0', four), 100);
    assert.ok(Math.abs(depthToSeparation([lines([0, 0]), lines([200, 0]), lines([200, 0]), lines([200, 0])], 'move0', four) - 100 / 3) < 1e-9);
});

test('uniqueness rewards forgiving positions and weighted peak ignores very unlikely branches', () => {
    assert.equal(moveUniqueness(lines([200, 0, -100, -200]), config), 100);
    assert.equal(moveUniqueness(lines([200, 200, 200, 200]), config), 25);
    assert.equal(aggregateDifficulty([{ difficulty: 20, reachProbability: 1 }, { difficulty: 100, reachProbability: 0.01 }], config), 21);
    assert.equal(aggregateDifficulty([{ difficulty: 20, reachProbability: 1 }, { difficulty: 100, reachProbability: 1 }], config), 68);
    assert.equal(aggregateDifficulty([], config), 0);
});

test('subtlety distinguishes quiet moves, recaptures, checks and promotions', () => {
    assert.equal(bestMoveSubtlety(DEFAULT_POSITION, 'e2e4', undefined, config), 100);
    const captureFen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    assert.equal(bestMoveSubtlety(captureFen, 'e4d5', undefined, config), 35);
    assert.equal(bestMoveSubtlety(captureFen, 'e4d5', 'd7d5', config), 15);
    assert.equal(bestMoveSubtlety('7k/5K2/6Q1/8/8/8/8/8 w - - 0 1', 'g6g7', undefined, config), 20);
    assert.equal(bestMoveSubtlety('8/7P/8/8/8/2k5/1r6/K7 w - - 0 1', 'h7h8q', undefined, config), 10);
});

test('scoring traverses every decision, preserves the level and sends full history with deterministic searches', async () => {
    const level = await fixture(2);
    const before = structuredClone(level);
    const engine = new LegalEngine();
    const result = await scoreLevel(level, { config }, engine);
    assert.deepEqual(level, before);
    assert.equal(result.nodes.length, 5);
    assert.deepEqual(result.nodes.map(node => node.reachProbability), [1, 0.4, 0.35, 0.2, 0.05]);
    assert.ok(result.difficulty >= 0 && result.difficulty <= 100 && Number.isInteger(result.difficulty));
    assert.equal(engine.requests.length, 15); // two offered analyses plus one broad analysis per node
    assert.ok(engine.requests.every(request => request.resetHash));
    assert.equal(engine.requests.filter(request => request.searchMoves).length, 10);
    for (const request of engine.requests) {
        const board = new Chess(request.startingFen);
        request.moves.forEach(move => applyUci(board, move));
        assert.equal(board.turn(), 'w');
        assert.ok(request.moves.length === 0 || request.moves.length === 2);
    }
    assert.deepEqual(await scoreLevel(level, { config }, engine), result);
});

test('fewer choices renormalize probabilities, and sole choices and empty trees score zero', async () => {
    const level = await fixture(2, 'k7/8/2K5/8/8/8/8/2R5 b - - 0 1');
    assert.equal(level.root.kind, 'decision');
    if (level.root.kind !== 'decision') throw new Error('Expected a decision');
    assert.equal(level.root.choices.length, 2);
    const result = await scoreLevel(level, { config }, new LegalEngine());
    assert.equal(result.nodes.length, 3);
    assert.ok(Math.abs(result.nodes[1]!.reachProbability - 0.4 / 0.75) < 1e-9);
    assert.ok(Math.abs(result.nodes[2]!.reachProbability - 0.35 / 0.75) < 1e-9);
    const forced = await fixture(1, 'k7/8/2K5/8/8/8/8/1R6 b - - 0 1');
    const engine = new LegalEngine();
    assert.equal((await scoreLevel(forced, { config }, engine)).difficulty, 0);
    assert.equal(engine.requests.length, 0);
    for (const empty of [await fixture(0), await fixture(1, 'k7/1Q6/2K5/8/8/8/8/8 b - - 0 1')]) {
        assert.deepEqual(await scoreLevel(empty, { enginePath: 'nonexistent-engine' }), { difficulty: 0, nodes: [], engineVersion: null });
    }
});

test('deeper best-move changes are reported without changing labels; missing candidates fail', async () => {
    const level = await fixture();
    const before = structuredClone(level);
    const engine = new LegalEngine();
    const originalAnalyze = engine.analyze.bind(engine);
    engine.analyze = async request => {
        const values = await originalAnalyze(request);
        if (request.searchMoves) values[1]!.score = { type: 'cp', value: 2000 };
        return values;
    };
    const result = await scoreLevel(level, { config }, engine);
    assert.equal(result.nodes[0]!.bestMoveChanged, true);
    assert.equal(result.nodes[0]!.signals.depthToSeparation, 100);
    assert.deepEqual(level, before);
    engine.analyze = async request => (await originalAnalyze(request)).slice(1);
    await assert.rejects(scoreLevel(level, { config }, engine), /incomplete/);
});

test('JSON replacement preserves nested properties, escaped strings, whitespace and exponent notation', () => {
    const source = '{\r\n "root":{"difficulty":-1,"text":"a\\\" difficulty \\\\ x"}, "difficulty": -1e0, "other": "difficulty"\r\n}\r\n';
    assert.equal(replaceDifficulty(source, 42), source.replace('"difficulty": -1e0', '"difficulty": 42'));
    assert.equal(replaceDifficulty('{"\\u0064ifficulty":-1}', 9), '{"\\u0064ifficulty":9}');
    assert.throws(() => replaceDifficulty('{"difficulty":-1,"difficulty":-1}', 42), /exactly one/);
    assert.throws(() => replaceDifficulty('{"root":{"difficulty":-1}}', 42), /exactly one/);
});

test('batch continues after failures, skips scored files, supports dry-run/rescore and changes only difficulty bytes', async () => {
    await withDirectory(async directory => {
        const level = await fixture();
        const source = JSON.stringify({ ...level, extra: { difficulty: -1, text: 'preserve me' } }, null, 2).replaceAll('\n', '\r\n') + '\r\n';
        const scoredSource = source.replace(level.id, randomUUID());
        const invalid = join(directory, 'invalid.json');
        const failure = join(directory, 'engine-failure.json');
        const valid = join(directory, 'valid.json');
        const scored = join(directory, 'scored.json');
        await writeFile(invalid, '{bad JSON');
        await writeFile(failure, source);
        await writeFile(valid, source);
        await writeFile(scored, replaceDifficulty(scoredSource, 99));
        const engine = new LegalEngine();
        engine.failNext = true;
        const results = await scoreLevelFiles([invalid, failure, valid, scored, valid], { config }, engine);
        assert.deepEqual(results.map(result => result.status), ['failed', 'failed', 'scored', 'skipped']);
        assert.equal(await readFile(invalid, 'utf8'), '{bad JSON');
        assert.equal(await readFile(failure, 'utf8'), source);
        const result = results[2]!;
        if (result.status !== 'scored') throw new Error('Expected score');
        assert.equal(await readFile(result.file, 'utf8'), replaceDifficulty(source, result.result.difficulty));
        assert.equal(await readFile(scored, 'utf8'), replaceDifficulty(scoredSource, 99));
        await scoreLevelFiles([failure], { config, dryRun: true }, engine);
        assert.equal(await readFile(failure, 'utf8'), source);
        const [rescored] = await scoreLevelFiles([scored], { config, rescore: true }, engine);
        assert.equal(rescored!.status, 'scored');
        assert.equal(await readFile(rescored!.file, 'utf8'), replaceDifficulty(scoredSource, result.result.difficulty));
    });
});

test('CLI directory mode reports per-file failure, updates valid files and exits nonzero', async () => {
    await withDirectory(async directory => {
        const file = join(directory, 'empty.json');
        const level = await fixture(0);
        await writeFile(file, JSON.stringify(level));
        await writeFile(join(directory, 'invalid.json'), '{bad');
        const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
        const output = spawnSync(process.execPath, ['--import', 'tsx', cli, '--directory', directory], { encoding: 'utf8', windowsHide: true });
        assert.equal(output.status, 1, output.stderr);
        assert.match(output.stdout, /1 scored, 0 skipped, 1 failed/);
        assert.match(output.stderr, /Failed.*invalid.json/);
        assert.equal(JSON.parse(await readFile(join(directory, `000-${level.id}.json`), 'utf8')).difficulty, 0);
    });
});

test('real Stockfish scores white/black, mates and promotions reproducibly across engine reuse', async () => {
    const engine = await Stockfish.start();
    try {
        const positions = [DEFAULT_POSITION, DEFAULT_POSITION.replace(' w ', ' b '),
            '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1', '8/7P/8/8/8/2k5/1r6/K7 w - - 0 1'];
        for (const fen of positions) {
            const level = await generateTree({ fen, decisionDepth: 1, searchDepth: 2 }, engine);
            const first = await scoreLevel(level, { config }, engine);
            // An unrelated intervening search must not alter the next score.
            await engine.analyze({ startingFen: DEFAULT_POSITION, moves: [], sideToMove: 'white', playerColor: 'white', searchDepth: 3, multiPv: 4 });
            assert.deepEqual(await scoreLevel(level, { config }, engine), first);
            assert.equal(first.nodes.length, 1);
            assert.equal(level.difficulty, -1);
        }
    } finally { await engine.close(); }
});
