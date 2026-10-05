import { compareEvaluations } from '../classification';
import type { EvaluatedMove } from '../types';

interface SearchResult { evaluations: EvaluatedMove[]; stable: boolean }
interface Search {
    legal: Set<string>; expected: number; depths: Map<number, Map<string, EvaluatedMove>>;
    signal: AbortSignal; resolve: (value: SearchResult) => void; reject: (error: Error) => void;
    cleanup: () => void;
}
const aborted = () => new DOMException('Analysis cancelled', 'AbortError');

/** Serialize searches so a stopped search's bestmove cannot complete a newer turn. */
export class StockfishAnalyzer {
    private worker: Worker | null = null;
    private ready: Promise<void> | null = null;
    private rejectReady: ((error: Error) => void) | null = null;
    private pending: Search | null = null;
    private queue: Promise<unknown> = Promise.resolve();
    private readyTimer: number | undefined;

    private initialize(): Promise<void> {
        if (this.ready) return this.ready;
        this.ready = new Promise<void>((resolve, reject) => {
            this.rejectReady = reject;
            const worker = new Worker(`${import.meta.env.BASE_URL}endless/stockfish/stockfish-19-lite-single.js`);
            this.worker = worker;
            this.readyTimer = window.setTimeout(() => this.fail(new Error('Stockfish took too long to start.')), 12_000);
            worker.addEventListener('message', event => {
                if (this.worker !== worker) return;
                for (const line of String(event.data).split(/\r?\n/)) {
                    if (line.trim() === 'uciok') {
                        window.clearTimeout(this.readyTimer);
                        this.readyTimer = undefined;
                        this.rejectReady = null;
                        resolve();
                    } else this.handleLine(line.trim());
                }
            });
            worker.addEventListener('error', event => {
                this.fail(new Error(event.message || 'Stockfish failed to load.'));
            });
            worker.postMessage('uci');
        });
        return this.ready;
    }

    analyze(fen: string, legalMoves: string[], signal: AbortSignal): Promise<EvaluatedMove[]> {
        const task = this.queue.catch(() => undefined).then(async () => {
            if (signal.aborted) throw aborted();
            await this.initialize();
            if (signal.aborted) throw aborted();
            const count = Math.min(legalMoves.length, 16);
            const first = await this.search(fen, legalMoves, count, 1900, signal);
            const cp = first.evaluations.filter(move => move.score.kind === 'cp').map(move => move.score.value);
            const spread = first.evaluations.some(move => move.score.kind === 'mate')
                || (cp.length > 1 && Math.max(...cp) - Math.min(...cp) > 150);
            if (legalMoves.length <= count || (spread && first.stable)) return first.evaluations;
            const second = await this.search(fen, legalMoves, Math.min(legalMoves.length, 64), 2800, signal);
            return second.evaluations;
        });
        this.queue = task;
        return task;
    }

    private search(fen: string, legalMoves: string[], expected: number, movetime: number, signal: AbortSignal): Promise<SearchResult> {
        if (signal.aborted) return Promise.reject(aborted());
        return new Promise((resolve, reject) => {
            const stop = () => this.worker?.postMessage('stop');
            const timer = window.setTimeout(() => this.fail(new Error('Stockfish analysis timed out. Try again.')), movetime + 6000);
            signal.addEventListener('abort', stop, { once: true });
            this.pending = { legal: new Set(legalMoves), expected, depths: new Map(), signal, resolve, reject,
                cleanup: () => { window.clearTimeout(timer); signal.removeEventListener('abort', stop); } };
            this.worker!.postMessage(`setoption name MultiPV value ${expected}`);
            this.worker!.postMessage(`position fen ${fen}`);
            this.worker!.postMessage(`go movetime ${movetime}`);
        });
    }

    private handleLine(line: string) {
        const pending = this.pending;
        if (!pending) return;
        if (line.startsWith('info ') && !/\b(lowerbound|upperbound)\b/.test(line)) {
            const depth = Number(line.match(/\bdepth (\d+)/)?.[1]);
            const score = line.match(/\bscore (cp|mate) (-?\d+)/);
            const uci = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1];
            if (!Number.isFinite(depth) || !score || !uci || !pending.legal.has(uci)) return;
            const atDepth = pending.depths.get(depth) ?? new Map();
            atDepth.set(uci, { uci, depth, score: { kind: score[1] as 'cp' | 'mate', value: Number(score[2]) } });
            pending.depths.set(depth, atDepth);
        }
        if (!line.startsWith('bestmove')) return;
        this.pending = null;
        pending.cleanup();
        if (pending.signal.aborted) { pending.reject(aborted()); return; }
        const snapshots = [...pending.depths.entries()].sort((a, b) => b[1].size - a[1].size || b[0] - a[0]);
        const evaluations = snapshots[0] ? [...snapshots[0][1].values()].sort(compareEvaluations) : [];
        const leaders = snapshots.filter(([, moves]) => moves.size >= Math.max(1, Math.ceil(pending.expected * 0.6)))
            .sort((a, b) => b[0] - a[0]).slice(0, 3)
            .map(([, moves]) => [...moves.values()].sort(compareEvaluations)[0]?.uci);
        if (!evaluations.length) pending.reject(new Error('Stockfish returned no legal move evaluations.'));
        else pending.resolve({ evaluations, stable: leaders.length === 3 && leaders.every(move => move === leaders[0]) });
    }

    private fail(error: Error) {
        window.clearTimeout(this.readyTimer);
        this.readyTimer = undefined;
        this.rejectReady?.(error);
        this.rejectReady = null;
        this.pending?.cleanup();
        this.pending?.reject(error);
        this.pending = null;
        this.worker?.terminate();
        this.worker = null;
        this.ready = null;
    }

    dispose() { this.fail(aborted()); }
}
