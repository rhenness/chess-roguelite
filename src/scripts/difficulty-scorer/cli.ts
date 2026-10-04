import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_SCORING_CONFIG, resolveScoringConfig } from './config.js';
import { scoreLevelFiles } from './files.js';

const help = `Score completed branching chess levels without changing their trees.

Usage:
  npm run score:levels -- [file.json ...] [options]

Options:
  --directory <path>  Add every .json file directly inside a directory
  --config <path>     JSON overrides for centralized scoring configuration
  --engine <path>     Native Stockfish executable or JavaScript wrapper
  --rescore          Include already-scored levels (otherwise only difficulty -1)
  --dry-run          Analyze and report without writing any files
  --print-config     Print default configuration as JSON and exit
  --help             Show this help

Without file paths or --directory, process the project's src/levels directory.
Failures leave their files unchanged; other valid files continue. Exit code 1
means at least one file failed. Analysis uses one thread and clears engine state
before each search. Only the top-level difficulty number is replaced in the JSON.
Scored files are named <three-digit-difficulty>-<level-guid>.json. Rescoring
updates the difficulty prefix; existing destination files are never overwritten.
`;

async function main(): Promise<void> {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
        directory: { type: 'string' }, config: { type: 'string' }, engine: { type: 'string' },
        rescore: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, 'print-config': { type: 'boolean' }, help: { type: 'boolean' },
    } });
    if (values.help) { console.log(help); return; }
    if (values['print-config']) { console.log(JSON.stringify(DEFAULT_SCORING_CONFIG, null, 2)); return; }
    const config = resolveScoringConfig(values.config ? JSON.parse(await readFile(resolve(values.config), 'utf8')) : {});
    const files = [...positionals];
    const directory = values.directory ?? (!files.length ? fileURLToPath(new URL('../../levels/', import.meta.url)) : undefined);
    if (directory) {
        const entries = await readdir(resolve(directory), { withFileTypes: true });
        files.push(...entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
            .map(entry => resolve(directory, entry.name)).sort());
    }
    if (!files.length) { console.log('No level JSON files found.'); return; }
    let lastUpdate = 0;
    const results = await scoreLevelFiles(files, {
        config, enginePath: values.engine ?? process.env.STOCKFISH_PATH,
        rescore: values.rescore, dryRun: values['dry-run'],
        onProgress: (_, count) => {
            if (Date.now() - lastUpdate >= 5000) {
                console.error(`Scored ${count} player decision(s) in current level...`);
                lastUpdate = Date.now();
            }
        },
        onResult: outcome => {
            if (outcome.status === 'failed') console.error(`Failed ${outcome.file}: ${outcome.error}`);
            else if (outcome.status === 'skipped') console.log(`Skipped ${outcome.file}: difficulty ${outcome.difficulty}`);
            else {
                const { result } = outcome;
                const changed = result.nodes.filter(node => node.bestMoveChanged).length;
                console.log(`${values['dry-run'] ? 'Would score' : 'Scored'} ${outcome.file}: difficulty ${result.difficulty}; ${result.nodes.length} decision(s); engine ${result.engineVersion ?? 'not needed'}`);
                if (changed) console.error(`  Fresh analysis preferred a different offered move in ${changed} node(s); stored choices and labels were preserved.`);
            }
            lastUpdate = 0;
        },
    });
    const count = (status: 'scored' | 'skipped' | 'failed') => results.filter(result => result.status === status).length;
    console.log(`${count('scored')} ${values['dry-run'] ? 'analyzed' : 'scored'}, ${count('skipped')} skipped, ${count('failed')} failed.`);
    if (count('failed')) process.exitCode = 1;
}

main().catch(error => {
    console.error(`Difficulty scoring failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
