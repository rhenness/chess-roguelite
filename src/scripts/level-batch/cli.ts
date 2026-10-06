import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isGenerationProfileId, GENERATION_PROFILE_IDS } from '../../config/generation.js';
import { generateLevelBatch } from './index.js';

const help = `Generate complete scored levels from fens.txt for every generation profile.

Usage:
  npm run generate:levels -- [input.txt] [options]

Options:
  --profile <id>      ${GENERATION_PROFILE_IDS.join(', ')} (default: all profiles)
  --concurrency <n>    Maximum simultaneous FEN/profile jobs, default 1 (1-32)
  --resume             Score pending trees without regenerating completed jobs
  --regenerate         Rebuild and rescore; delete matching old files after success
  --output-dir <path>  Output root (default: src/levels); option/depth folders are created
  --depth <number>     Override player decisions per floor (default: profile config)
  --search-depth <n>   Generation search depth, default 10 (1-128)
  --multi-pv <number>  Generation candidate lines, default 256 (4-256)
  --timeout-ms <n>     Generation timeout, default 120000
  --config <path>      Difficulty-scoring JSON overrides
  --engine <path>      Native Stockfish executable or JavaScript wrapper
  --help               Show this help

Blank lines, # comments and duplicate FENs are skipped. Without an input path, read fens.txt
from the project root. Each job generates and scores with one Stockfish process.
Save finished levels as <three-digit-score>-<guid>.json in <options>-options-<depth>-depth.
Default folders are 2-options-4-depth and 4-options-4-depth, including in .staging.
Depth overrides use a matching folder; the profile ID identifies the original recipe.
Unscored trees stay in .staging for --resume using the same input file, profile and depth.
Existing FEN/profile/depth combinations are skipped unless --regenerate is supplied.
Legacy beginner/intermediate/expert tags map to 2-options-4-depth-10/4-options-4-depth-10/4-options-4-depth-20.
Untagged existing levels map to 4-options-4-depth-10. Regeneration replaces only
the selected FENs and profiles; failures keep their old levels. --resume remembers
pending regeneration and finishes its cleanup. Failures do not stop other jobs; exit code is 1
if any job fails. Progress and summaries identify both the source line and profile.
`;

async function main(): Promise<void> {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
        profile: { type: 'string' }, concurrency: { type: 'string' }, resume: { type: 'boolean' }, regenerate: { type: 'boolean' },
        'output-dir': { type: 'string' }, depth: { type: 'string' },
        'search-depth': { type: 'string' }, 'multi-pv': { type: 'string' }, 'timeout-ms': { type: 'string' },
        config: { type: 'string' }, engine: { type: 'string' }, help: { type: 'boolean' },
    } });
    if (values.help) { console.log(help); return; }
    if (positionals.length > 1) throw new Error('Provide at most one FEN text file. Use --help for usage.');
    if (values.profile !== undefined && !isGenerationProfileId(values.profile)) throw new Error(`--profile must be ${GENERATION_PROFILE_IDS.join(', ')}.`);
    const config = values.config ? JSON.parse(await readFile(resolve(values.config), 'utf8')) : {};
    const updates = new Map<string, { time: number; stage: string }>();
    const results = await generateLevelBatch(positionals[0], {
        outputDirectory: values['output-dir'], profileId: values.profile, resume: values.resume, regenerate: values.regenerate, config,
        concurrency: values.concurrency === undefined ? undefined : Number(values.concurrency),
        decisionDepth: values.depth === undefined ? undefined : Number(values.depth),
        searchDepth: values['search-depth'] === undefined ? undefined : Number(values['search-depth']),
        multiPv: values['multi-pv'] === undefined ? undefined : Number(values['multi-pv']),
        timeoutMs: values['timeout-ms'] === undefined ? undefined : Number(values['timeout-ms']),
        enginePath: values.engine,
        onStart: entry => console.log(`Line ${entry.line} [${entry.profileId}]: ${entry.fen}`),
        onProgress: ({ line, profileId, stage, decisions }) => {
            const key = `${line}:${profileId}`;
            const last = updates.get(key);
            const now = Date.now();
            if (!last || stage !== last.stage || now - last.time >= 5000) {
                console.error(`Line ${line} [${profileId}]: ${stage}, ${decisions} player decision(s)...`);
                updates.set(key, { time: now, stage });
            }
        },
        onResult: result => {
            updates.delete(`${result.line}:${result.profileId}`);
            if (result.status === 'scored') console.log(`Scored [${result.profileId}] ${result.file}: difficulty score ${result.difficultyScore}`);
            else if (result.status === 'skipped') console.log(`Line ${result.line} [${result.profileId}]: skipped, ${result.reason}`);
            else {
                console.error(`Line ${result.line} [${result.profileId}]: ${result.stage} failed: ${result.error}`);
                if (result.stage !== 'generation') console.error(`Pending tree: ${result.file}. Retry with --resume.`);
            }
        },
    });
    const count = (status: 'scored' | 'skipped' | 'failed') => results.filter(result => result.status === status).length;
    for (const profile of values.profile ? [values.profile] : GENERATION_PROFILE_IDS) {
        const entries = results.filter(result => result.profileId === profile);
        console.log(`${profile}: ${entries.filter(result => result.status === 'scored').length} scored, `
            + `${entries.filter(result => result.status === 'skipped').length} skipped, `
            + `${entries.filter(result => result.status === 'failed').length} failed.`);
    }
    console.log(`${count('scored')} generated and scored, ${count('skipped')} skipped, ${count('failed')} failed.`);
    if (count('failed')) process.exitCode = 1;
}

main().catch(error => {
    console.error(`Level generation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
