import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { EngineEvaluation, GeneratedLevel } from '../../types/level.js';
import { applyUci } from '../tree-generator/chess.js';
import { validateScorableLevel } from '../difficulty-scorer/index.js';
import type { AnalysisEngine, AnalysisRequest } from '../tree-generator/stockfish.js';
import { generateLevelBatch, type BatchOptions } from './index.js';
import { scoredLevelPath } from '../level-files.js';

class LegalEngine implements AnalysisEngine {
    version = 'Stockfish batch test double';
    failScoringOnce = false;
    async analyze(request: AnalysisRequest): Promise<EngineEvaluation[]> {
        if (request.resetHash && this.failScoringOnce) {
            this.failScoringOnce = false;
            throw new Error('Simulated scoring failure');
        }
        const board = new Chess(request.startingFen);
        request.moves.forEach(move => applyUci(board, move));
        return board.moves({ verbose: true })
            .filter(move => !request.searchMoves || request.searchMoves.includes(move.lan))
            .slice(0, request.multiPv).map((move, index) => ({
                depth: request.searchDepth, pv: [move.lan],
                score: { type: 'cp', value: 1000 - index * 100 },
            }));
    }
}

async function withDirectory(work: (directory: string) => Promise<void>): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), 'level-batch-'));
    try { await work(directory); }
    finally {
        assert.equal(dirname(directory), tmpdir());
        assert.ok(directory.startsWith(join(tmpdir(), 'level-batch-')));
        await rm(directory, { recursive: true, force: true });
    }
}

const options = (directory: string): BatchOptions => ({
    outputDirectory: join(directory, 'levels'), prefix: 'test',
    decisionDepth: 1, searchDepth: 1, multiPv: 4, config: { depths: [1, 2], multiPv: 4 }, random: () => 0,
});

test('batch handles BOM, CRLF, whitespace, comments and bad FENs, preserving source line numbers', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        const blackFen = DEFAULT_POSITION.replace(' w ', ' b ');
        await writeFile(input, `\uFEFF # Positions\r\n\r\n  ${DEFAULT_POSITION}  \r\ninvalid\r\n${blackFen}\r\n`);
        const results = await generateLevelBatch(input, options(directory), new LegalEngine());
        assert.deepEqual(results.map(result => [result.line, result.status]), [[3, 'scored'], [4, 'failed'], [5, 'scored']]);
        assert.match(results[1]!.status === 'failed' ? results[1]!.error : '', /Invalid starting FEN/);
        for (const [index, color] of [[0, 'white'], [2, 'black']] as const) {
            const level = JSON.parse(await readFile(results[index]!.file, 'utf8')) as GeneratedLevel;
            validateScorableLevel(level);
            assert.equal(level.playerColor, color);
            assert.equal(level.root.kind, 'decision');
            assert.ok(level.difficulty >= 0 && level.difficulty <= 100);
            assert.equal(results[index]!.file, scoredLevelPath(results[index]!.file, level.difficulty, level.id));
        }
        assert.deepEqual((await readdir(join(directory, 'levels'))).sort(),
            [results[0]!.file, results[2]!.file].map(file => file.split(/[\\/]/).pop()!).sort());
    });
});

test('scoring failures preserve generated trees at -1 and allow the next FEN to complete', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, `${DEFAULT_POSITION}\n${DEFAULT_POSITION}`);
        const engine = new LegalEngine();
        engine.failScoringOnce = true;
        const results = await generateLevelBatch(input, options(directory), engine);
        assert.equal(results[0]!.status, 'failed');
        if (results[0]!.status !== 'failed') throw new Error('Expected failure');
        assert.equal(results[0]!.stage, 'scoring');
        assert.match(results[0]!.error, /Simulated scoring failure/);
        const retryable = JSON.parse(await readFile(results[0]!.file, 'utf8')) as GeneratedLevel;
        validateScorableLevel(retryable);
        assert.equal(retryable.difficulty, -1);
        assert.equal(results[1]!.status, 'scored');
        assert.ok((await readdir(join(directory, 'levels'))).every(file => file.endsWith('.json')));
    });
});

test('an existing output is preserved and later entries still run', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, `${DEFAULT_POSITION}\n${DEFAULT_POSITION}`);
        await mkdir(join(directory, 'levels'));
        const existing = join(directory, 'levels', 'test-0001.json');
        await writeFile(existing, 'existing content');
        const results = await generateLevelBatch(input, options(directory), new LegalEngine());
        assert.equal(results[0]!.status, 'failed');
        assert.equal(await readFile(existing, 'utf8'), 'existing content');
        assert.equal(results[1]!.status, 'scored');
    });
});

test('invalid batch settings fail before generating any files', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, DEFAULT_POSITION);
        for (const overrides of [{ decisionDepth: NaN }, { prefix: '../escape' }, { config: { depths: [1] } },
            { concurrency: 0 }, { concurrency: 1.5 }, { concurrency: 33 }, { concurrency: 2 }]) {
            await assert.rejects(generateLevelBatch(input, { ...options(directory), ...overrides }, new LegalEngine()));
        }
        assert.deepEqual(await readdir(directory), ['fens.txt']);
    });
});

test('CLI generates and scores concurrently with real Stockfish, reports a bad line and exits with failure', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        const config = join(directory, 'config.json');
        await writeFile(input, `${DEFAULT_POSITION}\ninvalid\n${DEFAULT_POSITION}`);
        await writeFile(config, JSON.stringify({ depths: [1, 2], multiPv: 4 }));
        const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
        const result = spawnSync(process.execPath, ['--import', 'tsx', cli, input,
            '--output-dir', join(directory, 'levels'), '--prefix', 'smoke', '--depth', '1',
            '--search-depth', '1', '--multi-pv', '4', '--config', config, '--concurrency', '2'], { encoding: 'utf8', timeout: 120_000 });
        assert.ifError(result.error);
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stdout, /2 generated and scored, 1 failed/);
        assert.match(result.stderr, /Line 2: generation failed: Invalid starting FEN/);
        const names = await readdir(join(directory, 'levels'));
        assert.equal(names.length, 2);
        for (const name of names) {
            const level = JSON.parse(await readFile(join(directory, 'levels', name), 'utf8')) as GeneratedLevel;
            validateScorableLevel(level);
            assert.ok(level.difficulty >= 0 && level.difficulty <= 100);
            assert.equal(join(directory, 'levels', name), scoredLevelPath(join(directory, 'levels', name), level.difficulty, level.id));
        }
    });
});

test('concurrent jobs stay within the limit, preserve input order, and continue after failures', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, [DEFAULT_POSITION, 'invalid', DEFAULT_POSITION, DEFAULT_POSITION].join('\n'));
        let active = 0;
        let peak = 0;
        const finished: number[] = [];
        const results = await generateLevelBatch(input, {
            ...options(directory), decisionDepth: 0, concurrency: 2,
            onStart: () => { active++; peak = Math.max(peak, active); },
            onResult: result => { active--; finished.push(result.line); },
        });
        assert.equal(peak, 2);
        assert.equal(active, 0);
        assert.deepEqual(finished.sort((a, b) => a - b), [1, 2, 3, 4]);
        assert.deepEqual(results.map(result => [result.line, result.status]), [
            [1, 'scored'], [2, 'failed'], [3, 'scored'], [4, 'scored'],
        ]);
        assert.deepEqual((await readdir(join(directory, 'levels'))).sort(),
            results.filter(result => result.status === 'scored').map(result =>
                result.file.split(/[\\/]/).pop()!).sort());
        for (const result of results.filter(result => result.status === 'scored')) {
            const level = JSON.parse(await readFile(result.file, 'utf8')) as GeneratedLevel;
            validateScorableLevel(level);
            assert.equal(level.difficulty, 0);
            assert.equal(result.file, scoredLevelPath(result.file, level.difficulty, level.id));
        }
    });
});
