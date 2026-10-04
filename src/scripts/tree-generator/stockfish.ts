import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import type { Color, EngineEvaluation } from '../../types/level.js';

export interface AnalysisRequest {
    startingFen: string;
    /** Entire branch history, so Stockfish can recognize repetition. */
    moves: string[];
    sideToMove: Color;
    playerColor: Color;
    searchDepth: number;
    multiPv: number;
    /** Restrict root analysis to these legal UCI moves (offline scoring). */
    searchMoves?: string[];
    /** Clear search state so results do not depend on previously analyzed nodes. */
    resetHash?: boolean;
}

export interface AnalysisEngine {
    version: string;
    analyze(request: AnalysisRequest): Promise<EngineEvaluation[]>;
}

/** Ignore score bounds: they are not completed, comparable evaluations. */
export function parseInfo(line: string): { rank: number; evaluation: EngineEvaluation } | null {
    if (!line.startsWith('info ') || /\b(?:lowerbound|upperbound)\b/.test(line)) return null;
    const depth = /\bdepth (\d+)/.exec(line);
    const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
    const pv = /\bpv (.+)$/.exec(line);
    if (!depth || !score || !pv) return null;
    const moves = pv[1]!.trim().split(/\s+/);
    if (!moves.every(move => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) return null;
    return {
        rank: Number(/\bmultipv (\d+)/.exec(line)?.[1] ?? 1),
        evaluation: {
            depth: Number(depth[1]),
            score: { type: score[1] as 'cp' | 'mate', value: Number(score[2]) },
            pv: moves,
        },
    };
}

export class Stockfish implements AnalysisEngine {
    version = '';
    private process: ChildProcessWithoutNullStreams;
    private pending?: { onLine: (line: string) => boolean; reject: (error: Error) => void };
    private failure?: Error;
    private closing = false;
    private stderr = '';

    private constructor(enginePath: string | undefined, private timeoutMs: number) {
        const path = enginePath ?? createRequire(import.meta.url).resolve('stockfish/bin/stockfish-19-single.js');
        // JavaScript engine wrappers run under Node; native executables run directly.
        this.process = /\.[cm]?js$/i.test(path)
            ? spawn(process.execPath, [path], { windowsHide: true })
            : spawn(path, [], { windowsHide: true });
        createInterface({ input: this.process.stdout }).on('line', line => this.pending?.onLine(line));
        this.process.stderr.on('data', chunk => { this.stderr = (this.stderr + String(chunk)).slice(-2000); });
        this.process.stdin.on('error', error => this.fail(error));
        this.process.on('error', error => this.fail(new Error(`Cannot start Stockfish: ${error.message}`)));
        this.process.on('exit', (code, signal) => {
            if (!this.closing) this.fail(new Error(`Stockfish exited (${signal ?? code}). ${this.stderr}`));
        });
    }

    static async start(options: { enginePath?: string; timeoutMs?: number } = {}): Promise<Stockfish> {
        const engine = new Stockfish(options.enginePath, options.timeoutMs ?? 120_000);
        try {
            await engine.exchange(['uci'], line => {
                if (line.startsWith('id name ')) engine.version = line.slice(8);
                return line === 'uciok';
            });
            if (!/^Stockfish\b/i.test(engine.version)) throw new Error('The engine must identify itself as Stockfish.');
            await engine.exchange([
                'setoption name Threads value 1',
                'setoption name Hash value 64',
                'setoption name UCI_Chess960 value false',
                'ucinewgame', 'isready',
            ], line => line === 'readyok');
            return engine;
        } catch (error) {
            await engine.close();
            throw error;
        }
    }

    private fail(error: Error): void {
        this.failure = error;
        this.pending?.reject(error);
    }

    private exchange(commands: string[], onLine: (line: string) => boolean): Promise<void> {
        if (this.failure) return Promise.reject(this.failure);
        if (this.closing) return Promise.reject(new Error('Stockfish is closed.'));
        if (this.pending) return Promise.reject(new Error('Stockfish requests must run sequentially.'));
        return new Promise((resolve, reject) => {
            const finish = (error?: Error) => {
                clearTimeout(timer);
                this.pending = undefined;
                if (error) reject(error); else resolve();
            };
            const timer = setTimeout(() => {
                const error = new Error(`Stockfish timed out after ${this.timeoutMs}ms.`);
                this.fail(error);
                this.process.kill();
            }, this.timeoutMs);
            this.pending = {
                reject: finish,
                onLine: line => {
                    try { if (onLine(line)) finish(); }
                    catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
                    return false;
                },
            };
            this.process.stdin.write(commands.join('\n') + '\n');
        });
    }

    async analyze(request: AnalysisRequest): Promise<EngineEvaluation[]> {
        const { startingFen, moves, multiPv, searchDepth, sideToMove, playerColor, searchMoves } = request;
        if (searchMoves && (!searchMoves.length || new Set(searchMoves).size !== searchMoves.length
            || searchMoves.some(move => !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)))) {
            throw new Error('searchMoves must contain distinct UCI moves.');
        }
        const depths = new Map<number, Map<number, EngineEvaluation>>();
        let bestMove = '';
        await this.exchange([
            ...(request.resetHash ? ['ucinewgame'] : []),
            `setoption name MultiPV value ${multiPv}`, 'isready',
        ], line => line === 'readyok');
        await this.exchange([
            `position fen ${startingFen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`,
            `go depth ${searchDepth}${searchMoves ? ` searchmoves ${searchMoves.join(' ')}` : ''}`,
        ], line => {
            const info = parseInfo(line);
            if (info) {
                const entries = depths.get(info.evaluation.depth) ?? new Map<number, EngineEvaluation>();
                entries.set(info.rank, info.evaluation);
                depths.set(info.evaluation.depth, entries);
            }
            if (!line.startsWith('bestmove ')) return false;
            bestMove = line.split(/\s+/)[1]!;
            return true;
        });
        for (const depth of [...depths.keys()].sort((a, b) => b - a)) {
            const entries = depths.get(depth)!;
            const candidates = Array.from({ length: multiPv }, (_, i) => entries.get(i + 1));
            if (candidates.some(candidate => !candidate) || candidates[0]!.pv[0] !== bestMove) continue;
            return candidates.map(candidate => {
                const evaluation = candidate!;
                return {
                    ...evaluation,
                    score: {
                        ...evaluation.score,
                        value: sideToMove === playerColor ? evaluation.score.value : -evaluation.score.value,
                    },
                };
            });
        }
        throw new Error(`Stockfish did not return ${multiPv} complete candidate lines (bestmove ${bestMove}).`);
    }

    async close(): Promise<void> {
        if (this.closing) return;
        this.closing = true;
        this.pending?.reject(new Error('Stockfish was closed.'));
        if (this.process.exitCode !== null || this.process.signalCode !== null) return;
        await new Promise<void>(resolve => {
            const timer = setTimeout(() => { this.process.kill(); }, 1000);
            this.process.once('close', () => { clearTimeout(timer); resolve(); });
            if (!this.process.stdin.destroyed) this.process.stdin.end('quit\n');
            else this.process.kill();
        });
    }
}
