import { link, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { GeneratedLevel } from '../../types/level.js';
import type { AnalysisEngine } from '../tree-generator/stockfish.js';
import { scoreLevel, validateScorableLevel, type ScoringOptions, type ScoringResult } from './index.js';
import { resolveScoringConfig } from './config.js';
import { scoredLevelPath } from '../level-files.js';

/** Replace only the top-level numeric token; preserve whitespace and all other bytes. */
export function replaceDifficulty(source: string, difficulty: number): string {
    if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 100) throw new Error('Difficulty must be an integer from 0 to 100.');
    JSON.parse(source);
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
            if (depth !== 1 || JSON.parse(source.slice(start, i + 1)) !== 'difficulty') continue;
            let valueStart = i + 1;
            while (/\s/.test(source[valueStart] ?? '') && valueStart < source.length) valueStart++;
            if (source[valueStart] !== ':') continue;
            valueStart++;
            while (/\s/.test(source[valueStart] ?? '') && valueStart < source.length) valueStart++;
            const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
            number.lastIndex = valueStart;
            const match = number.exec(source);
            if (!match) throw new Error('Top-level difficulty must be numeric.');
            locations.push({ start: valueStart, end: number.lastIndex });
        }
    }
    if (locations.length !== 1) throw new Error('Expected exactly one top-level difficulty property.');
    const location = locations[0]!;
    return source.slice(0, location.start) + difficulty + source.slice(location.end);
}

export interface FileScoringOptions extends ScoringOptions {
    rescore?: boolean;
    dryRun?: boolean;
    onResult?: (result: FileScoringResult) => void;
}

export type FileScoringResult =
    | { file: string; status: 'scored'; result: ScoringResult }
    | { file: string; status: 'skipped'; difficulty: number }
    | { file: string; status: 'failed'; error: string };

async function writeDifficulty(file: string, destination: string, source: string, updated: string): Promise<void> {
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

/** Failures leave the source untouched and do not stop other files. */
export async function scoreLevelFiles(files: string[], options: FileScoringOptions = {}, engine?: AnalysisEngine): Promise<FileScoringResult[]> {
    const config = resolveScoringConfig(options.config);
    const results: FileScoringResult[] = [];
    for (const file of new Set(files.map(file => resolve(file)))) {
        let outcome: FileScoringResult;
        try {
            const source = await readFile(file, 'utf8');
            const level = JSON.parse(source) as GeneratedLevel;
            validateScorableLevel(level);
            // Validate a unique editable property even on dry runs and already-scored files.
            replaceDifficulty(source, 0);
            if (level.difficulty !== -1 && !options.rescore) outcome = { file, status: 'skipped', difficulty: level.difficulty };
            else {
                const result = await scoreLevel(level, { ...options, config }, engine);
                const destination = options.dryRun ? file : scoredLevelPath(file, result.difficulty, level.id);
                if (!options.dryRun) await writeDifficulty(file, destination, source, replaceDifficulty(source, result.difficulty));
                outcome = { file: destination, status: 'scored', result };
            }
        } catch (error) {
            outcome = { file, status: 'failed', error: error instanceof Error ? error.message : String(error) };
        }
        results.push(outcome);
        options.onResult?.(outcome);
    }
    return results;
}
