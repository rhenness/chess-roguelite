import { access, link, mkdir, open, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { generateTree } from './index.js';

const help = `Generate a branching chess level for the scoring script.

Usage:
  npm run generate:tree -- --fen "<FEN>" [options]

Options:
  --name <name>           JSON filename without extension (default: unique timestamp)
  --depth <number>        Player decisions, default 4 (0-10)
  --search-depth <number> Stockfish search depth, default 10 (1-128)
  --multi-pv <number>     Candidate lines for both sides, default 256/all legal moves (4-256)
  --engine <path>         Native Stockfish executable or JS wrapper
  --timeout-ms <number>   Timeout per engine operation, default 120000
  --help                 Show this help

Writes to the project's src/levels/ directory. Existing files are preserved.
Quality labels are relative when the position has no clear evaluation gaps.
Computer replies: 40% Best, 40% Good, 18% Inaccuracy, 2% Blunder.
`;

async function main(): Promise<void> {
    const { values } = parseArgs({ options: {
        fen: { type: 'string' }, name: { type: 'string' }, depth: { type: 'string' },
        'search-depth': { type: 'string' }, 'multi-pv': { type: 'string' },
        engine: { type: 'string' }, 'timeout-ms': { type: 'string' }, help: { type: 'boolean' },
    } });
    if (values.help) { console.log(help); return; }
    if (!values.fen) throw new Error('Missing --fen. Use --help for usage.');
    const name = values.name ?? `level-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(name)) {
        throw new Error('--name must contain 1-120 letters, numbers, underscores or hyphens, starting with a letter or number.');
    }
    const directory = fileURLToPath(new URL('../../levels/', import.meta.url));
    await mkdir(directory, { recursive: true });
    const output = resolve(directory, `${name}.json`);
    try {
        await access(output);
        throw new Error(`Output already exists: ${output}. Choose another --name.`);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const temporary = `${output}.${randomUUID()}.tmp`;
    try {
        let lastUpdate = 0;
        const level = await generateTree({
            fen: values.fen,
            decisionDepth: values.depth === undefined ? undefined : Number(values.depth),
            searchDepth: values['search-depth'] === undefined ? undefined : Number(values['search-depth']),
            multiPv: values['multi-pv'] === undefined ? undefined : Number(values['multi-pv']),
            timeoutMs: values['timeout-ms'] === undefined ? undefined : Number(values['timeout-ms']),
            enginePath: values.engine ?? process.env.STOCKFISH_PATH,
            onProgress: ({ decisionsGenerated }) => {
                if (Date.now() - lastUpdate >= 5000) {
                    console.error(`Analyzed ${decisionsGenerated} player decision(s)...`);
                    lastUpdate = Date.now();
                }
            },
        });
        const file = await open(temporary, 'wx');
        try { await file.writeFile(JSON.stringify(level, null, 2) + '\n'); }
        finally { await file.close(); }
        // Publishing a hard link is atomic and fails if the destination exists.
        // Scoring never sees a partial JSON file, and existing output is preserved.
        await link(temporary, output);
        console.log(`Generated ${output}\nDifficulty: -1 (ready for scoring)`);
    } finally {
        await rm(temporary, { force: true });
    }
}

main().catch(error => {
    console.error(`Tree generation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
