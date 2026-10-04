import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
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
    assert.equal(custom.depthDiscount, 0.5);
    assert.equal(resolveScoringConfig({ depthDiscount: 1 }).depthDiscount, 1);
    for (const overrides of [{ depths: [4] }, { depths: [4, 4] }, { depths: [2, 1] }, { depths: [0, 2] },
        { multiPv: 1 }, { timeoutMs: 0 }, { nodeWeights: { ambiguity: 1 } }, { branchProbabilities: { bad: 0 } },
        { normalization: { mateBase: 100 } }, { subtlety: { quiet: 101 } }, { unknown: 1 }, { ambiguityScaleCp: NaN },
        ...[0, -0.5, 1.1, NaN, Infinity, '0.5', null].map(depthDiscount => ({ depthDiscount }))]) {
        assert.throws(() => resolveScoringConfig(overrides));
    }
    const engine = new LegalEngine();
    const level = await fixture();
    await assert.rejects(scoreLevel(level, { config: { depths: [] } }, engine));
    await assert.rejects(scoreLevel(level, { config: { depthDiscount: 0 } }, engine), /depthDiscount/);
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
    assert.equal(aggregateDifficulty([{ difficulty: 20, reachProbability: 1, decisionsTaken: 0 },
        { difficulty: 100, reachProbability: 0.01, decisionsTaken: 0 }], config), 21);
    assert.equal(aggregateDifficulty([{ difficulty: 20, reachProbability: 1, decisionsTaken: 0 },
        { difficulty: 100, reachProbability: 1, decisionsTaken: 0 }], config), 68);
    assert.equal(aggregateDifficulty([], config), 0);
});

test('depth discount gives the opening 53 percent of a full depth-four mean and can be disabled', () => {
    const meanOnly = resolveScoringConfig({ levelWeights: { mean: 1, peak: 0 } });
    const undiscounted = resolveScoringConfig({ levelWeights: { mean: 1, peak: 0 }, depthDiscount: 1 });
    // Each complete layer has total reach probability 1, despite containing more nodes.
    const layers = Array.from({ length: 4 }, (_, decisionsTaken) => ({
        decisionsTaken, reachProbability: 1, difficulty: decisionsTaken === 0 ? 100 : 0,
    }));
    assert.equal(aggregateDifficulty(layers, meanOnly), 53);
    assert.equal(aggregateDifficulty(layers, undiscounted), 25);
    const easyOpening = layers.map(node => ({ ...node, difficulty: 100 - node.difficulty }));
    assert.equal(aggregateDifficulty(easyOpening, meanOnly), 47);
    assert.equal(aggregateDifficulty(easyOpening, undiscounted), 75);
});

test('depth discount also reduces the influence of later mistakes on the weighted percentile', () => {
    const nodes = [{ difficulty: 20, reachProbability: 1, decisionsTaken: 0 },
        { difficulty: 100, reachProbability: 0.2, decisionsTaken: 1 }];
    assert.equal(aggregateDifficulty(nodes, config), 26);
    assert.equal(aggregateDifficulty(nodes, resolveScoringConfig({ depthDiscount: 1 })), 47);
    const peakOnly = resolveScoringConfig({ levelWeights: { mean: 0, peak: 1 } });
    assert.equal(aggregateDifficulty(nodes, peakOnly), 20);
    assert.equal(aggregateDifficulty(nodes, { ...peakOnly, depthDiscount: 1 }), 100);
    assert.equal(aggregateDifficulty([nodes[0]!], config), 20);
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
    assert.deepEqual(result.nodes.map(node => node.decisionsTaken), [0, 1, 1, 1, 1]);
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

test('scoring preserves reach probabilities across deeper decisions when the depth discount changes', async () => {
    const level = await fixture(3);
    const discounted = await scoreLevel(level, { config }, new LegalEngine());
    const undiscounted = await scoreLevel(level, { config: { ...config, depthDiscount: 1 } }, new LegalEngine());
    assert.deepEqual(discounted.nodes, undiscounted.nodes);
    for (const [depth, expectedCount] of [[0, 1], [1, 4], [2, 16]]) {
        const layer = discounted.nodes.filter(node => node.decisionsTaken === depth);
        assert.equal(layer.length, expectedCount);
        assert.ok(Math.abs(layer.reduce((sum, node) => sum + node.reachProbability, 0) - 1) < 1e-9);
    }
    assert.ok(Math.abs(discounted.nodes[2]!.reachProbability - 0.16) < 1e-9);
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
        const output = spawnSync(process.execPath, ['--import', 'tsx', cli, '--directory', directory, '--concurrency', '2'], { encoding: 'utf8', windowsHide: true });
        assert.equal(output.status, 1, output.stderr);
        assert.match(output.stdout, /1 scored, 0 skipped, 1 failed/);
        assert.match(output.stderr, /Failed.*invalid.json/);
        assert.equal(JSON.parse(await readFile(join(directory, `000-${level.id}.json`), 'utf8')).difficulty, 0);
    });
});

test('scoring rejects invalid concurrency and a shared concurrent engine before reading files', async () => {
    const engine = new LegalEngine();
    for (const concurrency of [0, -1, 1.5, 33, NaN, Infinity]) {
        await assert.rejects(scoreLevelFiles(['nonexistent.json'], { concurrency }, engine), /concurrency/);
    }
    await assert.rejects(scoreLevelFiles(['nonexistent.json'], { concurrency: 2 }, engine), /supplied engine/);
    assert.equal(engine.requests.length, 0);
    assert.deepEqual(await scoreLevelFiles([], { concurrency: 32 }), []);
});

test('concurrent scoring bounds engines, preserves input order and file contents, and continues after failures', async context => {
    await withDirectory(async directory => {
        const level = await fixture();
        const slow = await fixture(1, DEFAULT_POSITION.replace(' 0 1', ' 10 1'));
        const failure = await fixture(1, DEFAULT_POSITION.replace(' w ', ' b '));
        const files = ['slow', 'invalid', 'engine-failure', 'valid', 'later', 'skipped'].map(name => join(directory, `${name}.json`));
        const sources = [JSON.stringify(slow), '{bad JSON', JSON.stringify(failure),
            JSON.stringify(level), JSON.stringify({ ...level, id: randomUUID() }),
            JSON.stringify({ ...level, id: randomUUID(), difficulty: 99 })];
        await Promise.all(files.map((file, i) => writeFile(file, sources[i]!)));
        let active = 0;
        let peak = 0;
        let started = 0;
        let closed = 0;
        context.mock.method(Stockfish, 'start', async () => {
            started++;
            active++;
            peak = Math.max(peak, active);
            const engine = new LegalEngine();
            let busy = false;
            let engineClosed = false;
            return {
                version: engine.version,
                analyze: async (request: AnalysisRequest) => {
                    assert.equal(busy, false, 'An engine must never receive overlapping searches');
                    busy = true;
                    try {
                        await delay(request.startingFen === slow.root.fen ? 30 : 1);
                        if (request.playerColor === 'black') throw new Error('Simulated engine failure');
                        return await engine.analyze(request);
                    } finally { busy = false; }
                },
                close: async () => {
                    assert.equal(busy, false);
                    assert.equal(engineClosed, false);
                    engineClosed = true;
                    active--;
                    closed++;
                },
            } as unknown as Stockfish;
        });
        const finished: string[] = [];
        const progressed = new Set<string>();
        const results = await scoreLevelFiles([...files, files[0]!], {
            config, concurrency: 2,
            onFileProgress: (file, _, count) => { progressed.add(file); assert.ok(count > 0); },
            onResult: result => { finished.push(result.file); },
        });
        assert.equal(peak, 2);
        assert.equal(active, 0);
        assert.equal(started, 4);
        assert.equal(closed, started);
        assert.equal(finished.length, files.length);
        assert.deepEqual(results.map(result => result.status), ['scored', 'failed', 'failed', 'scored', 'scored', 'skipped']);
        assert.ok(finished.indexOf(results[3]!.file) < finished.indexOf(results[0]!.file));
        assert.deepEqual([...progressed].sort(), [files[0]!, files[3]!, files[4]!].sort());
        for (const [i, result] of results.entries()) {
            const expected = result.status === 'scored' ? replaceDifficulty(sources[i]!, result.result.difficulty) : sources[i]!;
            assert.equal(await readFile(result.file, 'utf8'), expected);
            if (result.status === 'scored') await assert.rejects(readFile(files[i]!, 'utf8'), /ENOENT/);
        }
        assert.equal((await readdir(directory)).length, files.length);
    });
});

test('concurrent workers close their engines before rejecting a result callback failure', async context => {
    await withDirectory(async directory => {
        const level = await fixture();
        const files = [join(directory, 'first.json'), join(directory, 'second.json')];
        await Promise.all(files.map(file => writeFile(file, JSON.stringify(level))));
        let active = 0;
        let started = 0;
        context.mock.method(Stockfish, 'start', async () => {
            const index = started++;
            active++;
            const engine = new LegalEngine();
            return {
                version: engine.version,
                analyze: async (request: AnalysisRequest) => { await delay(index === 0 ? 1 : 20); return engine.analyze(request); },
                close: async () => { active--; },
            } as unknown as Stockfish;
        });
        await assert.rejects(scoreLevelFiles(files, {
            config, concurrency: 2, dryRun: true,
            onResult: () => { throw new Error('Result callback failed'); },
        }), /Result callback failed/);
        assert.equal(started, 2);
        assert.equal(active, 0);
    });
});

test('concurrent scoring never overwrites colliding output files', async () => {
    await withDirectory(async directory => {
        const level = await fixture(0);
        const files = [join(directory, 'first.json'), join(directory, 'second.json')];
        const sources = files.map((_, i) => JSON.stringify({ ...level, extra: i }));
        await Promise.all(files.map((file, i) => writeFile(file, sources[i]!)));
        const results = await scoreLevelFiles(files, { concurrency: 2 });
        assert.equal(results.filter(result => result.status === 'scored').length, 1);
        assert.equal(results.filter(result => result.status === 'failed').length, 1);
        for (const [i, result] of results.entries()) {
            assert.equal(await readFile(result.file, 'utf8'),
                result.status === 'scored' ? replaceDifficulty(sources[i]!, 0) : sources[i]);
        }
        assert.equal((await readdir(directory)).length, 2);
    });
});

test('CLI rescoring supports concurrency and dry runs with real Stockfish', async () => {
    await withDirectory(async directory => {
        const level = await fixture();
        const files = [join(directory, 'first.json'), join(directory, 'second.json')];
        const sources = files.map(() => JSON.stringify({ ...level, id: randomUUID(), difficulty: 99 }));
        await Promise.all(files.map((file, i) => writeFile(file, sources[i]!)));
        const configFile = join(directory, 'config.json');
        await writeFile(configFile, JSON.stringify({ depths: [1, 2], multiPv: 4 }));
        const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
        const args = ['--import', 'tsx', cli, ...files, '--config', configFile, '--rescore', '--concurrency', '2'];
        const dryRun = spawnSync(process.execPath, [...args, '--dry-run'], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
        assert.ifError(dryRun.error);
        assert.equal(dryRun.status, 0, dryRun.stderr);
        assert.match(dryRun.stdout, /2 analyzed, 0 skipped, 0 failed/);
        for (const [i, file] of files.entries()) assert.equal(await readFile(file, 'utf8'), sources[i]);
        const scored = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
        assert.ifError(scored.error);
        assert.equal(scored.status, 0, scored.stderr);
        assert.match(scored.stdout, /2 scored, 0 skipped, 0 failed/);
        const names = (await readdir(directory)).filter(name => name !== 'config.json');
        assert.equal(names.length, 2);
        for (const name of names) {
            const source = await readFile(join(directory, name), 'utf8');
            const updated = JSON.parse(source) as GeneratedLevel;
            const original = sources.find(value => JSON.parse(value).id === updated.id)!;
            assert.equal(source, replaceDifficulty(original, updated.difficulty));
            assert.equal(name, `${String(updated.difficulty).padStart(3, '0')}-${updated.id}.json`);
        }
        const invalid = spawnSync(process.execPath, [...args.slice(0, -1), '0'], { encoding: 'utf8', windowsHide: true });
        assert.equal(invalid.status, 1);
        assert.match(invalid.stderr, /concurrency must be an integer between 1 and 32/);
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
