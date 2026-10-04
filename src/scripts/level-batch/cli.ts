import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { generateLevelBatch } from './index.js';

const help = `Generate and score levels from a text file of FENs.

Usage:
  npm run generate:levels -- [options]

Options:
  --concurrency <n>     Simultaneous FEN jobs, default 1 (1-32)
  --output-dir <path>    Output directory (default: project's src/levels)
  --prefix <name>        Unscored filename prefix (default: unique batch timestamp)
  --depth <number>       Player decisions, default 4 (0-10)
  --search-depth <n>     Generation search depth, default 10 (1-128)
  --multi-pv <number>    Generation candidate lines, default 256 (4-256)
  --timeout-ms <number>  Generation engine timeout, default 120000
  --config <path>        Difficulty scoring JSON overrides
  --engine <path>        Native Stockfish executable or JavaScript wrapper
  --help                Show this help

Put one FEN on each line in fens.txt. Blank lines and lines starting with # are skipped.
Scored files are named <difficulty>-<level-guid>.json, with a
three-digit difficulty prefix for sorting; existing files are preserved.
Each tree is saved before scoring. If scoring fails, its difficulty stays -1
and can be retried with score:levels. Other lines continue; failures exit with 1.
Scoring depth and timeout are controlled separately through --config.
Concurrent jobs use separate Stockfish processes; each job generates then scores.
`;

async function main(): Promise<void> {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
        'output-dir': { type: 'string' }, prefix: { type: 'string' }, depth: { type: 'string' },
        'search-depth': { type: 'string' }, 'multi-pv': { type: 'string' }, 'timeout-ms': { type: 'string' },
        config: { type: 'string' }, engine: { type: 'string' }, help: { type: 'boolean' },
        concurrency: { type: 'string' },
    } });
    if (values.help) { console.log(help); return; }
    if (positionals.length !== 1) throw new Error('Provide one FEN text file. Use --help for usage.');
    const config = values.config ? JSON.parse(await readFile(resolve(values.config), 'utf8')) : {};
    const updates = new Map<number, { time: number; stage: string }>();
    const results = await generateLevelBatch(positionals[0]!, {
        outputDirectory: values['output-dir'], prefix: values.prefix, config,
        concurrency: values.concurrency === undefined ? undefined : Number(values.concurrency),
        decisionDepth: values.depth === undefined ? undefined : Number(values.depth),
        searchDepth: values['search-depth'] === undefined ? undefined : Number(values['search-depth']),
        multiPv: values['multi-pv'] === undefined ? undefined : Number(values['multi-pv']),
        timeoutMs: values['timeout-ms'] === undefined ? undefined : Number(values['timeout-ms']),
        enginePath: values.engine,
        onStart: entry => { console.log(`Line ${entry.line}: ${entry.fen}`); },
        onProgress: ({ line, stage, decisions }) => {
            const last = updates.get(line);
            const now = Date.now();
            if (!last || stage !== last.stage || now - last.time >= 5000) {
                console.error(`Line ${line}: ${stage}, ${decisions} player decision(s)...`);
                updates.set(line, { time: now, stage });
            }
        },
        onResult: result => {
            updates.delete(result.line);
            if (result.status === 'scored') console.log(`Scored ${result.file}: difficulty ${result.difficulty}`);
            else {
                console.error(`Line ${result.line}: ${result.stage} failed: ${result.error}`);
                if (result.stage === 'scoring') console.error(`Tree saved for scoring retry: ${result.file}`);
            }
        },
    });
    const failed = results.filter(result => result.status === 'failed').length;
    console.log(`${results.length - failed} generated and scored, ${failed} failed.`);
    if (failed) process.exitCode = 1;
}

main().catch(error => {
    console.error(`Level batch failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
