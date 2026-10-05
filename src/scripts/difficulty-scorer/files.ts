import { link, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { GeneratedLevel } from '../../types/level.js';
import { normalizeLevel } from '../../types/level-schema.js';
import type { AnalysisEngine } from '../tree-generator/stockfish.js';
import { integerOption } from '../tree-generator/index.js';
import { scoreLevel, validateScorableLevel, type NodeDifficulty, type ScoringOptions, type ScoringResult } from './index.js';
import { resolveScoringConfig } from './config.js';
import { scoredLevelPath } from '../level-files.js';

/** Replace only the top-level numeric token; preserve whitespace and all other bytes. */
export function replaceDifficultyScore(source: string, difficultyScore: number): string {
    if (!Number.isInteger(difficultyScore) || difficultyScore < 0 || difficultyScore > 100) throw new Error('Difficulty must be an integer from 0 to 100.');
    const level = JSON.parse(source);
    if (level && Object.hasOwn(level, 'difficulty') && Object.hasOwn(level, 'difficultyScore')) {
        throw new Error('Expected exactly one top-level difficultyScore property, or difficulty for a version 1 level.');
    }
    const propertyName = level?.schemaVersion === 1 ? 'difficulty' : 'difficultyScore';
    let depth = 0;
    const locations: { start: number; end: number }[] = [];
    for (let i = 0; i < source.length; i++) {
        const character = source[i];
        if (character === '{' || character === '[') depth++;
        else if (character === '}' || character === ']') depth--;
        else if (character === '"') {
            const start = i;
            for (i++; i < source.length; i++) {
                if (source[i] === '\\') i++;
                else if (source[i] === '"') break;
            }
            if (depth !== 1 || JSON.parse(source.slice(start, i + 1)) !== propertyName) continue;
            let valueStart = i + 1;
            while (/\s/.test(source[valueStart] ?? '') && valueStart < source.length) valueStart++;
            if (source[valueStart] !== ':') continue;
            valueStart++;
            while (/\s/.test(source[valueStart] ?? '') && valueStart < source.length) valueStart++;
            const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
            number.lastIndex = valueStart;
            const match = number.exec(source);
            if (!match) throw new Error(`Top-level ${propertyName} must be numeric.`);
            locations.push({ start: valueStart, end: number.lastIndex });
        }
    }
    if (locations.length !== 1) throw new Error(`Expected exactly one top-level ${propertyName} property.`);
    const location = locations[0]!;
    return source.slice(0, location.start) + difficultyScore + source.slice(location.end);
}

export interface FileScoringOptions extends ScoringOptions {
    /** Maximum simultaneous files. Defaults to 1; each file owns its engine process. */
    concurrency?: number;
    rescore?: boolean;
    dryRun?: boolean;
    onFileProgress?: (file: string, node: NodeDifficulty, decisionsScored: number) => void;
    onResult?: (result: FileScoringResult) => void;
}

export type FileScoringResult =
    | { file: string; status: 'scored'; result: ScoringResult }
    | { file: string; status: 'skipped'; difficultyScore: number }
    | { file: string; status: 'failed'; error: string };

async function writeDifficultyScore(file: string, destination: string, source: string, updated: string): Promise<void> {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
        const metadata = await stat(file);
        const output = await open(temporary, 'wx', metadata.mode);
        try { await output.writeFile(updated, 'utf8'); await output.sync(); }
        finally { await output.close(); }
        if (await readFile(file, 'utf8') !== source) throw new Error('Level changed during scoring; refusing to overwrite it.');
        if (destination === file) await rename(temporary, file);
        else {
            // Publish without overwriting another level, then remove the old name.
            await link(temporary, destination);
            try { await rm(file); }
            catch (error) {
                await rm(destination);
                throw error;
            }
        }
    } finally { await rm(temporary, { force: true }); }
}

/** Bounded parallel scoring retains input order; failures do not stop other files. */
export async function scoreLevelFiles(files: string[], options: FileScoringOptions = {}, engine?: AnalysisEngine): Promise<FileScoringResult[]> {
    const config = resolveScoringConfig(options.config);
    const concurrency = integerOption('concurrency', options.concurrency ?? 1, 1, 32);
    if (engine && concurrency > 1) {
        throw new Error('A supplied engine cannot be shared by concurrent scoring jobs. Use concurrency 1 or omit the supplied engine.');
    }
    const uniqueFiles = [...new Set(files.map(file => resolve(file)))];
    async function processFile(file: string): Promise<FileScoringResult> {
        let outcome: FileScoringResult;
        try {
            const source = await readFile(file, 'utf8');
            const level = normalizeLevel(JSON.parse(source)) as GeneratedLevel;
            validateScorableLevel(level);
            // Validate a unique editable property even on dry runs and already-scored files.
            replaceDifficultyScore(source, 0);
            if (level.difficultyScore !== -1 && !options.rescore) outcome = { file, status: 'skipped', difficultyScore: level.difficultyScore };
            else {
                const result = await scoreLevel(level, { ...options, config, onProgress: (node, count) => {
                    options.onProgress?.(node, count);
                    options.onFileProgress?.(file, node, count);
                } }, engine);
                const destination = options.dryRun ? file : scoredLevelPath(file, result.difficultyScore, level.id);
                if (!options.dryRun) await writeDifficultyScore(file, destination, source, replaceDifficultyScore(source, result.difficultyScore));
                outcome = { file: destination, status: 'scored', result };
            }
        } catch (error) {
            outcome = { file, status: 'failed', error: error instanceof Error ? error.message : String(error) };
        }
        return outcome;
    }
    const results = new Array<FileScoringResult>(uniqueFiles.length);
    let nextFile = 0;
    async function worker(): Promise<void> {
        while (nextFile < uniqueFiles.length) {
            // Claim before awaiting so each file is processed by exactly one worker.
            const index = nextFile++;
            const outcome = await processFile(uniqueFiles[index]!);
            results[index] = outcome;
            options.onResult?.(outcome);
        }
    }
    // Wait for owned engines to finish and close even if a caller's callback throws.
    const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, uniqueFiles.length) }, worker));
    const failedWorker = workers.find(result => result.status === 'rejected');
    if (failedWorker?.status === 'rejected') throw failedWorker.reason;
    return results;
}
