import { link, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess, validateFen } from 'chess.js';
import { GENERATION_PROFILE_IDS, GENERATION_PROFILES, generationLevelFolder, isGenerationProfileId, type GenerationProfileId } from '../../config/generation.js';
import { normalizeLevel } from '../../types/level-schema.js';
import type { GeneratedLevel } from '../../types/level.js';
import { generateTree, integerOption, type GeneratorOptions } from '../tree-generator/index.js';
import { Stockfish, type AnalysisEngine } from '../tree-generator/stockfish.js';
import { resolveScoringConfig } from '../difficulty-scorer/config.js';
import { scoreLevel, validateScorableLevel } from '../difficulty-scorer/index.js';
import { replaceDifficultyScore } from '../difficulty-scorer/files.js';
import { scoredLevelPath } from '../level-files.js';

export interface BatchEntry {
    line: number;
    fen: string;
    profileId: GenerationProfileId;
    file: string;
}

export type BatchResult = BatchEntry & (
    | { status: 'scored'; difficultyScore: number }
    | { status: 'skipped'; reason: string }
    | { status: 'failed'; stage: 'generation' | 'scoring' | 'publication'; error: string }
);

export interface BatchOptions extends Omit<GeneratorOptions, 'fen' | 'onProgress'> {
    /** Global limit across all FEN/profile jobs, default 1 (1–32). */
    concurrency?: number;
    /** Output root; option-count/depth subfolders and .staging are created inside it. */
    outputDirectory?: string;
    /** Retry only saved unscored trees matching the input file and selected profiles. */
    resume?: boolean;
    /** Rebuild and rescore matching levels; remove old files after publication. */
    regenerate?: boolean;
    config?: unknown;
    onStart?: (entry: BatchEntry) => void;
    onProgress?: (progress: { line: number; profileId: GenerationProfileId; stage: 'generation' | 'scoring'; decisions: number }) => void;
    onResult?: (result: BatchResult) => void;
}

/** Atomic publication; only pending trees are replaced during regeneration. */
async function publish(file: string, source: string, replace = false): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
        const output = await open(temporary, 'wx');
        try { await output.writeFile(source, 'utf8'); await output.sync(); }
        finally { await output.close(); }
        if (replace) await rename(temporary, file);
        else await link(temporary, file);
    } finally { await rm(temporary, { force: true }); }
}

interface ExistingLevel {
    file: string;
    source: string;
}

const levelKey = (fen: string, profileId: GenerationProfileId, decisionDepth: number) => `${profileId}\n${decisionDepth}\n${fen}`;

/** Read only the output root and requested option-count/depth folders. */
async function findExistingLevels(folders: readonly string[]): Promise<Map<string, ExistingLevel[]>> {
    const levels = new Map<string, ExistingLevel[]>();
    for (const folder of new Set(folders)) {
        let files;
        try { files = await readdir(folder, { withFileTypes: true }); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
            throw error;
        }
        for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
            if (!file.isFile() || !file.name.endsWith('.json')) continue;
            const path = resolve(folder, file.name);
            const source = await readFile(path, 'utf8');
            let level;
            try { level = JSON.parse(source); }
            catch { continue; }
            const fen = level?.root?.fen;
            const generation = (normalizeLevel(level) as GeneratedLevel | null)?.generation;
            const profileId = generation?.profileId;
            if (typeof fen !== 'string' || !validateFen(fen).ok || !isGenerationProfileId(profileId)
                || !Number.isInteger(generation?.decisionDepth)) continue;
            const key = levelKey(new Chess(fen).fen(), profileId, generation!.decisionDepth);
            const previous = levels.get(key) ?? [];
            previous.push({ file: path, source });
            levels.set(key, previous);
        }
    }
    return levels;
}

async function requireUnchanged(level: ExistingLevel): Promise<void> {
    try {
        if (await readFile(level.file, 'utf8') !== level.source) {
            throw new Error(`Existing level changed during regeneration; refusing to delete it: ${level.file}`);
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
}

/** One engine per active job, shared sequentially by generation and scoring. */
export async function generateLevelBatch(
    inputFile = fileURLToPath(new URL('../../../fens.txt', import.meta.url)),
    options: BatchOptions = {}, suppliedEngine?: AnalysisEngine,
): Promise<BatchResult[]> {
    const config = resolveScoringConfig(options.config);
    const concurrency = integerOption('concurrency', options.concurrency ?? 1, 1, 32);
    if (suppliedEngine && concurrency > 1) throw new Error('A supplied engine cannot be shared by concurrent jobs. Use concurrency 1.');
    if (options.profileId !== undefined && !isGenerationProfileId(options.profileId)) throw new Error('Unknown generation profile.');
    const profiles = options.profileId ? [options.profileId] : GENERATION_PROFILE_IDS;
    const generation = {
        searchDepth: integerOption('searchDepth', options.searchDepth ?? 10, 1, 128),
        multiPv: integerOption('multiPv', options.multiPv ?? 256, 4, 256),
        timeoutMs: integerOption('timeoutMs', options.timeoutMs ?? 120_000, 1, 2_147_483_647),
        enginePath: options.enginePath ?? process.env.STOCKFISH_PATH,
        random: options.random,
    };
    if (options.decisionDepth !== undefined) integerOption('decisionDepth', options.decisionDepth, 0, 10);
    const project = fileURLToPath(new URL('../../../', import.meta.url));
    const directory = resolve(options.outputDirectory ?? resolve(project, 'src/levels'));
    const decisionDepth = (profileId: GenerationProfileId) => options.decisionDepth ?? GENERATION_PROFILES[profileId].treeGeneration.decisionDepth;
    const profileFolder = (profileId: GenerationProfileId) => basename(generationLevelFolder(profileId, decisionDepth(profileId)));
    const profileDirectory = (profileId: GenerationProfileId) => resolve(directory, profileFolder(profileId));
    const entryKey = (fen: string, profileId: GenerationProfileId) => levelKey(fen, profileId, decisionDepth(profileId));
    const lines = (await readFile(resolve(inputFile), 'utf8')).replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
    const existing = await findExistingLevels([directory, ...profiles.map(profileDirectory)]);
    const seen = new Map<string, number>();
    const entries: (BatchEntry & { validationError?: string; duplicateOf?: number })[] = [];
    for (const [index, source] of lines.entries()) {
        const inputFen = source.trim();
        if (!inputFen || inputFen.startsWith('#')) continue;
        const validation = validateFen(inputFen);
        const fen = validation.ok ? new Chess(inputFen).fen() : inputFen;
        for (const profileId of profiles) {
            const duplicateOf = validation.ok ? seen.get(entryKey(fen, profileId)) : undefined;
            if (validation.ok && duplicateOf === undefined) seen.set(entryKey(fen, profileId), index + 1);
            const key = createHash('sha256').update(JSON.stringify({ input: resolve(inputFile), line: index + 1,
                fen, profileId, decisionDepth: decisionDepth(profileId), profileVersion: GENERATION_PROFILES[profileId].profileVersion })).digest('hex').slice(0, 24);
            entries.push({ line: index + 1, fen, profileId, file: resolve(directory, '.staging', profileFolder(profileId), `${key}.json`),
                ...(duplicateOf !== undefined ? { duplicateOf } : {}),
                ...(!validation.ok ? { validationError: `Invalid starting FEN: ${validation.error}` } : {}) });
        }
    }

    async function processEntry(entry: typeof entries[number]): Promise<BatchResult> {
        options.onStart?.(entry);
        let stage: 'generation' | 'scoring' | 'publication' = 'generation';
        let ownedEngine: Stockfish | undefined;
        let outcome: BatchResult | undefined;
        try {
            if (entry.validationError) throw new Error(entry.validationError);
            if (entry.duplicateOf !== undefined) {
                outcome = { ...entry, status: 'skipped', reason: `Duplicate FEN and profile from line ${entry.duplicateOf}.` };
                return outcome;
            }
            const previous = existing.get(entryKey(entry.fen, entry.profileId)) ?? [];
            const completed = previous[0];
            if (!options.resume && !options.regenerate && completed) {
                outcome = { ...entry, file: completed.file, status: 'skipped', reason: 'A level already exists for this FEN and profile.' };
                return outcome;
            }
            let level: GeneratedLevel;
            let source: string;
            if (options.resume) {
                try { source = await readFile(entry.file, 'utf8'); }
                catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                    outcome = { ...entry, status: 'skipped', reason: 'No pending tree for this FEN and profile.' };
                    return outcome;
                }
                stage = 'scoring';
                level = normalizeLevel(JSON.parse(source)) as GeneratedLevel;
                validateScorableLevel(level);
                if (level.generation.profileId !== entry.profileId || level.root.fen !== entry.fen
                    || level.generation.decisionDepth !== decisionDepth(entry.profileId)
                    || level.generation.profileVersion !== GENERATION_PROFILES[entry.profileId].profileVersion || level.difficultyScore !== -1) {
                    throw new Error('Pending tree does not match this FEN, profile, depth and version.');
                }
            } else {
                let pendingSource: string | undefined;
                try {
                    pendingSource = await readFile(entry.file, 'utf8');
                    if (!options.regenerate) throw new Error('An unscored tree already exists for this job. Use --resume to score it.');
                    const pending = normalizeLevel(JSON.parse(pendingSource)) as GeneratedLevel;
                    if (pending.root.fen !== entry.fen || pending.generation.profileId !== entry.profileId
                        || pending.generation.decisionDepth !== decisionDepth(entry.profileId)) {
                        throw new Error('Pending tree does not match this FEN, profile and depth.');
                    }
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                }
                const engine = suppliedEngine ?? (ownedEngine = await Stockfish.start({ enginePath: generation.enginePath,
                    timeoutMs: Math.max(generation.timeoutMs, config.timeoutMs) }));
                level = await generateTree({ ...generation, profileId: entry.profileId, fen: entry.fen,
                    decisionDepth: decisionDepth(entry.profileId),
                    onProgress: ({ decisionsGenerated }) => options.onProgress?.({ line: entry.line,
                        profileId: entry.profileId, stage: 'generation', decisions: decisionsGenerated }),
                }, engine);
                if (options.regenerate) level.generation.regenerated = true;
                source = JSON.stringify(level, null, 2) + '\n';
                if (pendingSource !== undefined && await readFile(entry.file, 'utf8') !== pendingSource) {
                    throw new Error('Pending tree changed during generation; refusing to replace it.');
                }
                await publish(entry.file, source, pendingSource !== undefined);
            }

            stage = 'scoring';
            const engine = suppliedEngine ?? ownedEngine ?? (level.root.kind === 'decision'
                ? (ownedEngine = await Stockfish.start({ enginePath: generation.enginePath, timeoutMs: config.timeoutMs })) : undefined);
            const scored = await scoreLevel(level, { config, onProgress: (_, decisions) => options.onProgress?.({
                line: entry.line, profileId: entry.profileId, stage: 'scoring', decisions }),
            }, engine);
            stage = 'publication';
            const destination = scoredLevelPath(resolve(profileDirectory(entry.profileId), 'level.json'), scored.difficultyScore, level.id);
            const updated = replaceDifficultyScore(source, scored.difficultyScore);
            if (await readFile(entry.file, 'utf8') !== source) throw new Error('Pending tree changed during scoring; refusing to publish it.');
            const obsolete = options.regenerate || level.generation.regenerated
                ? previous.filter(level => level.file !== destination) : [];
            for (const old of obsolete) await requireUnchanged(old);
            try { await publish(destination, updated); }
            catch (error) {
                // Recover a crash after publication but before removing the pending tree.
                if (!options.resume || (error as NodeJS.ErrnoException).code !== 'EEXIST'
                    || await readFile(destination, 'utf8') !== updated) throw error;
            }
            for (const old of obsolete) {
                await requireUnchanged(old);
                await rm(old.file, { force: true });
            }
            await rm(entry.file);
            outcome = { ...entry, file: destination, status: 'scored', difficultyScore: scored.difficultyScore };
        } catch (error) {
            outcome = { ...entry, status: 'failed', stage, error: error instanceof Error ? error.message : String(error) };
        } finally {
            await ownedEngine?.close();
            if (outcome) options.onResult?.(outcome);
        }
        return outcome!;
    }

    const results = new Array<BatchResult>(entries.length);
    let nextEntry = 0;
    async function worker(): Promise<void> {
        while (nextEntry < entries.length) {
            const index = nextEntry++;
            results[index] = await processEntry(entries[index]!);
        }
    }
    const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
    const failure = workers.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    return results;
}
