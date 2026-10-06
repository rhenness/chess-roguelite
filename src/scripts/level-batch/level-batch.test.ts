import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { GENERATION_PROFILE_IDS, GENERATION_PROFILES, generationLevelFolder } from '../../config/generation.js';
import type { GeneratedLevel } from '../../types/level.js';
import { applyUci } from '../tree-generator/chess.js';
import { scoreLevel, validateScorableLevel } from '../difficulty-scorer/index.js';
import { replaceDifficultyScore } from '../difficulty-scorer/files.js';
import { Stockfish, type AnalysisEngine, type AnalysisRequest } from '../tree-generator/stockfish.js';
import { generateLevelBatch, type BatchOptions } from './index.js';
import { scoredLevelPath } from '../level-files.js';

class LegalEngine implements AnalysisEngine {
    version = 'Stockfish batch test double';
    failScoringOnce = false;
    requests: AnalysisRequest[] = [];
    async analyze(request: AnalysisRequest) {
        this.requests.push(request);
        if (request.resetHash && this.failScoringOnce) {
            this.failScoringOnce = false;
            throw new Error('Simulated scoring failure');
        }
        const board = new Chess(request.startingFen);
        request.moves.forEach(move => applyUci(board, move));
        return board.moves({ verbose: true }).map((move, index) => ({
            depth: request.searchDepth, pv: [move.lan],
            score: { type: 'cp' as const, value: (request.sideToMove === request.playerColor ? 1 : -1) * (1000 - index * 100) },
        })).filter(line => !request.searchMoves || request.searchMoves.includes(line.pv[0]!)).slice(0, request.multiPv);
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
    outputDirectory: join(directory, 'levels'), decisionDepth: 1,
    searchDepth: 1, multiPv: 4, config: { depths: [1, 2], multiPv: 4 }, random: () => 0,
});

test('every FEN produces all configured profiles, with BOM/comments, line numbers and isolated invalid input', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, `\uFEFF # Positions\r\n\r\n  ${DEFAULT_POSITION}  \r\ninvalid\r\n${DEFAULT_POSITION.replace(' w ', ' b ')}\r\n`);
        const results = await generateLevelBatch(input, options(directory), new LegalEngine());
        assert.deepEqual(results.map(result => [result.line, result.profileId, result.status]),
            [3, 4, 5].flatMap(line => GENERATION_PROFILE_IDS.map(profile => [line, profile, line === 4 ? 'failed' : 'scored'])));
        const ids = new Set<string>();
        for (const result of results) {
            if (result.status === 'failed') { assert.match(result.error, /Invalid starting FEN/); continue; }
            assert.equal(result.status, 'scored');
            const level = JSON.parse(await readFile(result.file, 'utf8')) as GeneratedLevel;
            validateScorableLevel(level);
            ids.add(level.id);
            assert.equal(level.generation.profileId, result.profileId);
            assert.equal(level.generation.profileVersion, GENERATION_PROFILES[result.profileId].profileVersion);
            assert.equal(level.playerColor, result.line === 3 ? 'white' : 'black');
            assert.equal(dirname(result.file), join(directory, 'levels', basename(generationLevelFolder(result.profileId, 1))));
            assert.equal(result.file, scoredLevelPath(result.file, level.difficultyScore, level.id));
            assert.equal(level.root.kind, 'decision');
            if (level.root.kind === 'decision') {
                assert.deepEqual(level.root.choices.map(choice => choice.quality), result.profileId === '2-options-4-depth-10'
                    ? ['best', 'bad'] : result.profileId === '4-options-4-depth-10'
                        ? ['best', 'good', 'inaccuracy', 'bad'] : ['best', 'good', 'inaccuracy', 'inaccuracy']);
                assert.equal(new Set(level.root.choices.map(choice => choice.playerMove.uci)).size, level.root.choices.length);
            }
        }
        assert.equal(ids.size, 2 * GENERATION_PROFILE_IDS.length);
        for (const profile of GENERATION_PROFILE_IDS) assert.deepEqual(await readdir(join(directory, 'levels', '.staging', basename(generationLevelFolder(profile, 1)))), []);
    });
});

test('a scoring failure leaves a resumable tree; resume preserves its identity and never regenerates completed profiles', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, DEFAULT_POSITION);
        const engine = new LegalEngine();
        engine.failScoringOnce = true;
        const results = await generateLevelBatch(input, options(directory), engine);
        const pending = results[0]!;
        assert.equal(pending.status, 'failed');
        if (pending.status !== 'failed') throw new Error('Expected scoring failure');
        assert.equal(pending.stage, 'scoring');
        const source = await readFile(pending.file, 'utf8');
        const tree = JSON.parse(source) as GeneratedLevel;
        assert.equal(tree.difficultyScore, -1);
        assert.deepEqual(results.slice(1).map(result => result.status), GENERATION_PROFILE_IDS.slice(1).map(() => 'scored'));
        const [blocked] = await generateLevelBatch(input, { ...options(directory), profileId: '2-options-4-depth-10' }, engine);
        assert.equal(blocked?.status, 'failed');
        if (blocked?.status === 'failed') assert.match(blocked.error, /Use --resume/);
        assert.equal(await readFile(pending.file, 'utf8'), source);
        const resumedEngine = new LegalEngine();
        // Resume selects the same depth pool as the original invocation.
        const resumed = await generateLevelBatch(input, { ...options(directory), resume: true }, resumedEngine);
        assert.deepEqual(resumed.map(result => result.status), GENERATION_PROFILE_IDS.map((_, index) => index === 0 ? 'scored' : 'skipped'));
        assert.ok(resumedEngine.requests.length > 0);
        assert.ok(resumedEngine.requests.every(request => request.resetHash));
        const completed = JSON.parse(await readFile(resumed[0]!.file, 'utf8')) as GeneratedLevel;
        assert.equal(completed.id, tree.id);
        assert.equal(completed.generation.decisionDepth, 1);
        assert.deepEqual(completed.root, tree.root);
        assert.equal(await readFile(resumed[0]!.file, 'utf8'), replaceDifficultyScore(source, completed.difficultyScore));
        assert.deepEqual(await readdir(dirname(pending.file)), []);
    });
});

test('publication preserves colliding output and can recover publication completed before staging cleanup', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, DEFAULT_POSITION);
        const engine = new LegalEngine();
        engine.failScoringOnce = true;
        const settings = { ...options(directory), profileId: '4-options-4-depth-20' as const };
        const [pending] = await generateLevelBatch(input, settings, engine);
        assert.equal(pending?.status, 'failed');
        const source = await readFile(pending!.file, 'utf8');
        const level = JSON.parse(source) as GeneratedLevel;
        const score = await scoreLevel(level, { config: settings.config }, new LegalEngine());
        const destination = scoredLevelPath(join(directory, 'levels', '4-options-1-depth', 'level.json'), score.difficultyScore, level.id);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, 'existing content');
        const [collision] = await generateLevelBatch(input, { ...settings, resume: true }, new LegalEngine());
        assert.equal(collision?.status, 'failed');
        if (collision?.status === 'failed') assert.equal(collision.stage, 'publication');
        assert.equal(await readFile(destination, 'utf8'), 'existing content');
        assert.equal(await readFile(pending!.file, 'utf8'), source);
        await writeFile(destination, replaceDifficultyScore(source, score.difficultyScore));
        const [recovered] = await generateLevelBatch(input, { ...settings, resume: true }, new LegalEngine());
        assert.equal(recovered?.status, 'scored');
        assert.equal(recovered?.file, destination);
        assert.deepEqual(await readdir(dirname(pending!.file)), []);
    });
});

test('resume rejects a modified pending tree instead of publishing it under the wrong profile', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, DEFAULT_POSITION);
        const engine = new LegalEngine();
        engine.failScoringOnce = true;
        const settings = { ...options(directory), profileId: '4-options-4-depth-20' as const };
        const [pending] = await generateLevelBatch(input, settings, engine);
        const level = JSON.parse(await readFile(pending!.file, 'utf8')) as GeneratedLevel;
        level.generation.profileId = '4-options-4-depth-10';
        const changed = JSON.stringify(level);
        await writeFile(pending!.file, changed);
        const resumedEngine = new LegalEngine();
        const [result] = await generateLevelBatch(input, { ...settings, resume: true }, resumedEngine);
        assert.equal(result?.status, 'failed');
        assert.equal(resumedEngine.requests.length, 0);
        assert.equal(await readFile(pending!.file, 'utf8'), changed);
    });
});

test('concurrency bounds engines across all profiles and each engine handles both stages before closing', async context => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, `${DEFAULT_POSITION}\n${DEFAULT_POSITION.replace(' w ', ' b ')}`);
        let active = 0;
        let peak = 0;
        let closed = 0;
        const engines: LegalEngine[] = [];
        context.mock.method(Stockfish, 'start', async () => {
            active++;
            peak = Math.max(peak, active);
            await delay(10);
            const engine = new LegalEngine();
            engines.push(engine);
            return Object.assign(engine, { close: async () => { active--; closed++; } });
        });
        const results = await generateLevelBatch(input, { ...options(directory), concurrency: 2 });
        assert.equal(peak, 2);
        assert.equal(active, 0);
        assert.equal(closed, 2 * GENERATION_PROFILE_IDS.length);
        assert.equal(engines.length, 2 * GENERATION_PROFILE_IDS.length);
        assert.deepEqual(results.map(result => [result.line, result.profileId, result.status]),
            [1, 2].flatMap(line => GENERATION_PROFILE_IDS.map(profile => [line, profile, 'scored'])));
        for (const engine of engines) {
            assert.ok(engine.requests.some(request => !request.resetHash));
            assert.ok(engine.requests.some(request => request.resetHash));
        }
    });
});

test('callback failure waits for every owned engine to finish and close', async context => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, DEFAULT_POSITION);
        let active = 0;
        context.mock.method(Stockfish, 'start', async () => {
            active++;
            await delay(10);
            return Object.assign(new LegalEngine(), { close: async () => { active--; } });
        });
        await assert.rejects(generateLevelBatch(input, { ...options(directory), concurrency: 2,
            onResult: () => { throw new Error('Callback failed'); },
        }), /Callback failed/);
        assert.equal(active, 0);
    });
});

test('invalid options fail before output is created', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, DEFAULT_POSITION);
        for (const overrides of [{ decisionDepth: NaN }, { config: { depths: [1] } },
            { concurrency: 0 }, { concurrency: 1.5 }, { concurrency: 33 }, { concurrency: 2 },
            { profileId: 'invalid' }]) {
            await assert.rejects(generateLevelBatch(input, { ...options(directory), ...overrides } as BatchOptions, new LegalEngine()));
        }
        assert.deepEqual(await readdir(directory), ['fens.txt']);
    });
});

test('single-profile selection and config defaults keep four player decisions per floor', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, 'k7/1Q6/2K5/8/8/8/8/8 b - - 0 1');
        for (const profileId of GENERATION_PROFILE_IDS) {
            const [result] = await generateLevelBatch(input, { ...options(directory), decisionDepth: undefined, profileId }, new LegalEngine());
            assert.equal(result?.status, 'scored');
            const level = JSON.parse(await readFile(result!.file, 'utf8')) as GeneratedLevel;
            assert.equal(level.generation.profileId, profileId);
            assert.equal(level.generation.decisionDepth, 4);
            assert.equal(level.difficultyScore, 0);
        }
    });
});

test('normal runs fill only missing profiles, skip repeat runs, and deduplicate FENs before starting jobs', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, DEFAULT_POSITION);
        for (const profileId of ['2-options-4-depth-10', '4-options-4-depth-10'] as const) {
            await generateLevelBatch(input, { ...options(directory), profileId }, new LegalEngine());
        }
        await writeFile(input, `${DEFAULT_POSITION}\n  ${DEFAULT_POSITION}  `);
        const engine = new LegalEngine();
        const results = await generateLevelBatch(input, options(directory), engine);
        assert.deepEqual(results.map(result => result.status), [
            ...GENERATION_PROFILE_IDS.map((_, index) => index < 2 ? 'skipped' : 'scored'),
            ...GENERATION_PROFILE_IDS.map(() => 'skipped'),
        ]);
        assert.equal(results[2]!.profileId, '4-options-4-depth-20');
        assert.ok(engine.requests.some(request => !request.resetHash));
        assert.equal((await readdir(join(directory, 'levels', '2-options-1-depth'))).length, 1);
        assert.equal((await readdir(join(directory, 'levels', '4-options-1-depth'))).length, GENERATION_PROFILE_IDS.length - 1);
        const repeatedEngine = new LegalEngine();
        const repeated = await generateLevelBatch(input, options(directory), repeatedEngine);
        assert.ok(repeated.every(result => result.status === 'skipped'));
        assert.equal(repeatedEngine.requests.length, 0);
        const regenerated = await generateLevelBatch(input, { ...options(directory), regenerate: true }, new LegalEngine());
        assert.deepEqual(regenerated.map(result => result.status), [
            ...GENERATION_PROFILE_IDS.map(() => 'scored'), ...GENERATION_PROFILE_IDS.map(() => 'skipped'),
        ]);
        assert.equal((await readdir(join(directory, 'levels', '2-options-1-depth'))).length, 1);
        assert.equal((await readdir(join(directory, 'levels', '4-options-1-depth'))).length, GENERATION_PROFILE_IDS.length - 1);
        for (const result of results.slice(0, GENERATION_PROFILE_IDS.length)) await assert.rejects(readFile(result.file), { code: 'ENOENT' });
    });
});

test('depth overrides keep completed levels and pending jobs in separate pools during skip, resume and regeneration', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, DEFAULT_POSITION);
        const settings = { ...options(directory), profileId: '2-options-4-depth-10' as const };
        const [shallow] = await generateLevelBatch(input, { ...settings, decisionDepth: 0 }, new LegalEngine());
        assert.equal(shallow?.status, 'scored');
        assert.equal(basename(dirname(shallow!.file)), '2-options-0-depth');
        // Also exercise the legacy root scan, where folders cannot distinguish depth.
        const shallowSource = await readFile(shallow!.file, 'utf8');
        const rootLevel = join(directory, 'levels', 'shallow.json');
        await writeFile(rootLevel, shallowSource);
        await rm(shallow!.file);
        const failedEngine = new LegalEngine();
        failedEngine.failScoringOnce = true;
        const [pending] = await generateLevelBatch(input, settings, failedEngine);
        assert.equal(pending?.status, 'failed');
        assert.equal(basename(dirname(pending!.file)), '2-options-1-depth');
        const pendingSource = await readFile(pending!.file, 'utf8');
        const unusedEngine = new LegalEngine();
        const [wrongDepth] = await generateLevelBatch(input, { ...settings, decisionDepth: 0, resume: true }, unusedEngine);
        assert.equal(wrongDepth?.status, 'skipped');
        assert.equal(unusedEngine.requests.length, 0);
        assert.equal(await readFile(pending!.file, 'utf8'), pendingSource);
        const [resumed] = await generateLevelBatch(input, { ...settings, resume: true }, new LegalEngine());
        assert.equal(resumed?.status, 'scored');
        const [replacement] = await generateLevelBatch(input, { ...settings, regenerate: true }, new LegalEngine());
        assert.equal(replacement?.status, 'scored');
        await assert.rejects(readFile(resumed!.file), { code: 'ENOENT' });
        assert.equal(await readFile(rootLevel, 'utf8'), shallowSource);
    });
});

test('untagged root levels map to 4-options-4-depth-10, and regeneration removes only matching profile files', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, `${DEFAULT_POSITION}\n${DEFAULT_POSITION.replace(' w ', ' b ')}`);
        const originals = await generateLevelBatch(input, options(directory), new LegalEngine());
        const intermediate = originals[1]!;
        const level = JSON.parse(await readFile(intermediate.file, 'utf8')) as GeneratedLevel;
        delete level.generation.profileId;
        delete level.generation.profileVersion;
        delete level.generation.targetOptionCount;
        delete level.generation.playerQualities;
        const { difficultyScore, ...metadata } = level;
        const legacy = join(directory, 'levels', 'legacy.json');
        const legacySource = JSON.stringify({ ...metadata, schemaVersion: 1, difficulty: difficultyScore });
        await writeFile(legacy, legacySource);
        const unscored = join(directory, 'levels', 'unscored.json');
        await writeFile(unscored, JSON.stringify({ ...level, difficultyScore: -1 }));
        await rm(intermediate.file);
        await writeFile(input, DEFAULT_POSITION);
        const settings = { ...options(directory), profileId: '4-options-4-depth-10' as const };
        const unused = new LegalEngine();
        const [skipped] = await generateLevelBatch(input, settings, unused);
        assert.equal(skipped?.status, 'skipped');
        assert.equal(unused.requests.length, 0);
        assert.equal(await readFile(legacy, 'utf8'), legacySource);
        const [regenerated] = await generateLevelBatch(input, { ...settings, regenerate: true }, new LegalEngine());
        assert.equal(regenerated?.status, 'scored');
        const replacement = JSON.parse(await readFile(regenerated!.file, 'utf8')) as GeneratedLevel;
        assert.notEqual(replacement.id, level.id);
        assert.equal(replacement.generation.regenerated, true);
        await assert.rejects(readFile(legacy), { code: 'ENOENT' });
        await assert.rejects(readFile(unscored), { code: 'ENOENT' });
        for (const original of originals.filter(result => result.file !== intermediate.file)) {
            assert.ok(await readFile(original.file, 'utf8'));
        }
        assert.equal((await readdir(join(directory, 'levels', '4-options-1-depth'))).length, 2 * (GENERATION_PROFILE_IDS.length - 1));
    });
});

test('FEN matching normalizes en-passant fields and does not depend on output filenames', async () => {
    await withDirectory(async directory => {
        const board = new Chess();
        board.move('e4');
        const input = join(directory, 'fens.txt');
        const fen = board.fen();
        await writeFile(input, fen);
        const settings = { ...options(directory), profileId: '2-options-4-depth-10' as const };
        const [original] = await generateLevelBatch(input, settings, new LegalEngine());
        const renamed = join(directory, 'levels', '2-options-1-depth', 'custom-name.json');
        const source = await readFile(original!.file, 'utf8');
        await writeFile(renamed, source.replace(fen, fen.replace(' - 0 1', ' e3 0 1')));
        await rm(original!.file);
        const unused = new LegalEngine();
        const [result] = await generateLevelBatch(input, settings, unused);
        assert.equal(result?.status, 'skipped');
        assert.equal(result?.file, renamed);
        assert.equal(unused.requests.length, 0);
    });
});

test('regeneration failures retain old levels and resume remembers replacement cleanup', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, DEFAULT_POSITION);
        const settings = { ...options(directory), profileId: '4-options-4-depth-20' as const };
        const [original] = await generateLevelBatch(input, settings, new LegalEngine());
        const oldSource = await readFile(original!.file, 'utf8');
        const generationFailure = new LegalEngine();
        generationFailure.analyze = async () => { throw new Error('Generation failed'); };
        const [failedGeneration] = await generateLevelBatch(input, { ...settings, regenerate: true }, generationFailure);
        assert.equal(failedGeneration?.status, 'failed');
        if (failedGeneration?.status === 'failed') assert.equal(failedGeneration.stage, 'generation');
        assert.equal(await readFile(original!.file, 'utf8'), oldSource);
        const scoringFailure = new LegalEngine();
        scoringFailure.failScoringOnce = true;
        const [pending] = await generateLevelBatch(input, { ...settings, regenerate: true }, scoringFailure);
        assert.equal(pending?.status, 'failed');
        if (pending?.status === 'failed') assert.equal(pending.stage, 'scoring');
        const pendingLevel = JSON.parse(await readFile(pending!.file, 'utf8')) as GeneratedLevel;
        assert.equal(pendingLevel.generation.regenerated, true);
        assert.equal(await readFile(original!.file, 'utf8'), oldSource);
        const resumedEngine = new LegalEngine();
        const [resumed] = await generateLevelBatch(input, { ...settings, resume: true }, resumedEngine);
        assert.equal(resumed?.status, 'scored');
        assert.ok(resumedEngine.requests.every(request => request.resetHash));
        const replacement = JSON.parse(await readFile(resumed!.file, 'utf8')) as GeneratedLevel;
        assert.equal(replacement.id, pendingLevel.id);
        await assert.rejects(readFile(original!.file), { code: 'ENOENT' });
        await assert.rejects(readFile(pending!.file), { code: 'ENOENT' });
        assert.deepEqual(await readdir(join(directory, 'levels', '4-options-1-depth')), [resumed!.file.split(/[\\/]/).pop()]);
    });
});

test('full regeneration replaces a pending tree with a fresh tree and UUID', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, DEFAULT_POSITION);
        const settings = { ...options(directory), profileId: '2-options-4-depth-10' as const };
        const failedEngine = new LegalEngine();
        failedEngine.failScoringOnce = true;
        const [pending] = await generateLevelBatch(input, settings, failedEngine);
        const pendingSource = await readFile(pending!.file, 'utf8');
        const saved = JSON.parse(pendingSource) as GeneratedLevel;
        const generationFailure = new LegalEngine();
        generationFailure.analyze = async () => { throw new Error('Generation failed'); };
        const [failed] = await generateLevelBatch(input, { ...settings, regenerate: true }, generationFailure);
        assert.equal(failed?.status, 'failed');
        assert.equal(await readFile(pending!.file, 'utf8'), pendingSource);
        const engine = new LegalEngine();
        const [fresh] = await generateLevelBatch(input, { ...settings, regenerate: true }, engine);
        assert.equal(fresh?.status, 'scored');
        const level = JSON.parse(await readFile(fresh!.file, 'utf8')) as GeneratedLevel;
        assert.notEqual(level.id, saved.id);
        assert.equal(level.generation.regenerated, true);
        assert.ok(engine.requests.some(request => !request.resetHash));
        await assert.rejects(readFile(pending!.file), { code: 'ENOENT' });
    });
});

test('regeneration preserves an old file edited during analysis and retains the pending replacement', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        await writeFile(input, DEFAULT_POSITION);
        const settings = { ...options(directory), profileId: '4-options-4-depth-20' as const };
        const [original] = await generateLevelBatch(input, settings, new LegalEngine());
        const oldSource = await readFile(original!.file, 'utf8');
        const changed = oldSource + ' ';
        const engine = new LegalEngine();
        const analyze = engine.analyze.bind(engine);
        let edited = false;
        engine.analyze = async request => {
            if (request.resetHash && !edited) { await writeFile(original!.file, changed); edited = true; }
            return analyze(request);
        };
        const [failed] = await generateLevelBatch(input, { ...settings, regenerate: true }, engine);
        assert.equal(failed?.status, 'failed');
        if (failed?.status === 'failed') {
            assert.equal(failed.stage, 'publication');
            assert.match(failed.error, /Existing level changed/);
        }
        assert.equal(await readFile(original!.file, 'utf8'), changed);
        assert.equal((await readdir(join(directory, 'levels', '4-options-1-depth'))).length, 1);
        assert.ok(await readFile(failed!.file, 'utf8'));
    });
});

test('one CLI handles all profiles, profile filtering, concurrency, resume, and per-line errors with real Stockfish', async () => {
    await withDirectory(async directory => {
        const input = join(directory, 'fens.txt');
        const config = join(directory, 'config.json');
        await writeFile(input, `${DEFAULT_POSITION}\ninvalid\n${DEFAULT_POSITION.replace(' w ', ' b ')}`);
        await writeFile(config, JSON.stringify({ depths: [1, 2], multiPv: 4 }));
        const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
        const args = ['--import', 'tsx', cli, input, '--output-dir', join(directory, 'levels'),
            '--depth', '1', '--search-depth', '1', '--multi-pv', '4', '--config', config, '--concurrency', '2'];
        const result = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true, timeout: 120_000 });
        assert.ifError(result.error);
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stdout, new RegExp(`${2 * GENERATION_PROFILE_IDS.length} generated and scored, 0 skipped, ${GENERATION_PROFILE_IDS.length} failed`));
        assert.match(result.stderr, /Line 2 \[4-options-4-depth-20\]: generation failed: Invalid starting FEN/);
        for (const profile of GENERATION_PROFILE_IDS) {
            assert.match(result.stdout, new RegExp(`${profile}: 2 scored, 0 skipped, 1 failed`));
            const folder = join(directory, 'levels', basename(generationLevelFolder(profile, 1)));
            const files = await readdir(folder);
            assert.equal(files.length, profile === '2-options-4-depth-10' ? 2 : 2 * (GENERATION_PROFILE_IDS.length - 1));
            let matchingProfileCount = 0;
            for (const file of files) {
                const level = JSON.parse(await readFile(join(folder, file), 'utf8')) as GeneratedLevel;
                validateScorableLevel(level);
                if (level.generation.profileId === profile) matchingProfileCount++;
            }
            assert.equal(matchingProfileCount, 2);
        }
        await writeFile(input, DEFAULT_POSITION);
        const filtered = spawnSync(process.execPath, [...args, '--profile', '4-options-4-depth-40'], { encoding: 'utf8', windowsHide: true, timeout: 60_000 });
        assert.equal(filtered.status, 0, filtered.stderr);
        assert.match(filtered.stdout, /0 generated and scored, 1 skipped, 0 failed/);
        assert.doesNotMatch(filtered.stdout, /\[2-options-4-depth-10\]/);
        const resumed = spawnSync(process.execPath, [...args, '--resume'], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
        assert.equal(resumed.status, 0, resumed.stderr);
        assert.match(resumed.stdout, new RegExp(`0 generated and scored, ${GENERATION_PROFILE_IDS.length} skipped, 0 failed`));
        const regenerated = spawnSync(process.execPath, [...args, '--profile', '4-options-4-depth-40', '--regenerate'],
            { encoding: 'utf8', windowsHide: true, timeout: 60_000 });
        assert.equal(regenerated.status, 0, regenerated.stderr);
        assert.match(regenerated.stdout, /1 generated and scored, 0 skipped, 0 failed/);
        assert.equal((await readdir(join(directory, 'levels', '4-options-1-depth'))).length, 2 * (GENERATION_PROFILE_IDS.length - 1));
        for (const flags of [['--profile', 'bad'], ['--concurrency', '0']]) {
            const invalid = spawnSync(process.execPath, ['--import', 'tsx', cli, ...flags], { encoding: 'utf8', windowsHide: true });
            assert.equal(invalid.status, 1);
        }
    });
});
