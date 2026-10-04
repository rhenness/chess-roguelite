import { access, link, mkdir, open, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTree, integerOption, type GeneratorOptions } from '../tree-generator/index.js';
import type { AnalysisEngine } from '../tree-generator/stockfish.js';
import { resolveScoringConfig } from '../difficulty-scorer/config.js';
import { scoreLevelFiles } from '../difficulty-scorer/files.js';

export interface BatchEntry {
    line: number;
    fen: string;
    file: string;
}

export type BatchResult = BatchEntry & (
    | { status: 'scored'; difficulty: number }
    | { status: 'failed'; stage: 'generation' | 'scoring'; error: string }
);

export interface BatchOptions extends Omit<GeneratorOptions, 'fen' | 'onProgress'> {
    /** Maximum simultaneous FEN jobs. Defaults to 1; each job owns its engine processes. */
    concurrency?: number;
    outputDirectory?: string;
    prefix?: string;
    config?: unknown;
    onStart?: (entry: BatchEntry) => void;
    onProgress?: (progress: { line: number; stage: 'generation' | 'scoring'; decisions: number }) => void;
    onResult?: (result: BatchResult) => void;
}

/** Generate then score each FEN with bounded parallelism; results retain input order. */
export async function generateLevelBatch(inputFile: string, options: BatchOptions = {}, engine?: AnalysisEngine): Promise<BatchResult[]> {
    const config = resolveScoringConfig(options.config);
    const concurrency = integerOption('concurrency', options.concurrency ?? 1, 1, 32);
    if (engine && concurrency > 1) {
        throw new Error('A supplied engine cannot be shared by concurrent FEN jobs. Use concurrency 1 or omit the supplied engine.');
    }
    const generation = {
        decisionDepth: integerOption('decisionDepth', options.decisionDepth ?? 4, 0, 10),
        searchDepth: integerOption('searchDepth', options.searchDepth ?? 10, 1, 128),
        multiPv: integerOption('multiPv', options.multiPv ?? 256, 4, 256),
        timeoutMs: integerOption('timeoutMs', options.timeoutMs ?? 120_000, 1, 2_147_483_647),
        enginePath: options.enginePath ?? process.env.STOCKFISH_PATH,
        random: options.random,
    };
    const prefix = options.prefix ?? `batch-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,109}$/.test(prefix)) {
        throw new Error('prefix must contain 1-110 letters, numbers, underscores or hyphens, starting with a letter or number.');
    }
    const lines = (await readFile(resolve(inputFile), 'utf8')).replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
    const directory = resolve(options.outputDirectory ?? fileURLToPath(new URL('../../levels/', import.meta.url)));
    const entries: BatchEntry[] = [];
    for (const [index, source] of lines.entries()) {
        const fen = source.trim();
        if (!fen || fen.startsWith('#')) continue;
        entries.push({ line: index + 1, fen, file: resolve(directory, `${prefix}-${String(index + 1).padStart(4, '0')}.json`) });
    }

    async function processEntry(entry: BatchEntry): Promise<BatchResult> {
        options.onStart?.(entry);
        let stage: 'generation' | 'scoring' = 'generation';
        let outcome: BatchResult;
        try {
            await mkdir(directory, { recursive: true });
            try {
                await access(entry.file);
                throw new Error(`Output already exists: ${entry.file}. Choose another prefix.`);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
            const level = await generateTree({ ...generation, fen: entry.fen, onProgress: ({ decisionsGenerated }) => {
                options.onProgress?.({ line: entry.line, stage: 'generation', decisions: decisionsGenerated });
            } }, engine);
            const temporary = `${entry.file}.${randomUUID()}.tmp`;
            try {
                const file = await open(temporary, 'wx');
                try { await file.writeFile(JSON.stringify(level, null, 2) + '\n'); }
                finally { await file.close(); }
                // Atomic publication never overwrites an existing level.
                await link(temporary, entry.file);
            } finally { await rm(temporary, { force: true }); }
            stage = 'scoring';
            const [scored] = await scoreLevelFiles([entry.file], {
                config, enginePath: generation.enginePath,
                onProgress: (_, decisions) => options.onProgress?.({ line: entry.line, stage: 'scoring', decisions }),
            }, engine);
            if (!scored || scored.status !== 'scored') {
                throw new Error(scored?.status === 'failed' ? scored.error : 'Generated level was not scored.');
            }
            outcome = { ...entry, file: scored.file, status: 'scored', difficulty: scored.result.difficulty };
        } catch (error) {
            outcome = { ...entry, status: 'failed', stage, error: error instanceof Error ? error.message : String(error) };
        }
        options.onResult?.(outcome);
        return outcome;
    }

    const results = new Array<BatchResult>(entries.length);
    let nextEntry = 0;
    async function worker(): Promise<void> {
        while (nextEntry < entries.length) {
            // Claim synchronously before awaiting, so workers never process the same entry.
            const index = nextEntry++;
            results[index] = await processEntry(entries[index]!);
        }
    }
    // Wait for every worker, even if a caller's callback throws, so owned engines
    // finish and close before the batch returns or rejects.
    const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
    const failedWorker = workers.find(result => result.status === 'rejected');
    if (failedWorker?.status === 'rejected') throw failedWorker.reason;
    return results;
}
