import { createChess } from '../chess';
import { buildOptions } from '../options';
import type { EvaluatedMove, MoveOption } from '../types';
import type { AnalysisPosition } from './branches';

export interface Analyzer {
    analyze(fen: string, legalMoves: string[], signal: AbortSignal): Promise<EvaluatedMove[]>;
    dispose(): void;
}
interface Waiter { resolve: (options: MoveOption[]) => void; reject: (error: Error) => void; cleanup: () => void }
interface Entry {
    position: AnalysisPosition;
    options: MoveOption[] | null;
    error: Error | null;
    waiters: Set<Waiter>;
}
const cancelled = () => new DOMException('Analysis cancelled', 'AbortError');

/** One worker, one search at a time, and only the current turn's candidate boards. */
export class BranchPreloader {
    private entries = new Map<string, Entry>();
    private running: { entry: Entry; controller: AbortController } | null = null;
    private preferred: string | null = null;
    private enabled = false;
    private disposed = false;
    private speculationBlocked = false;
    private scope = '';

    constructor(private engine: Analyzer) {}

    keep(positions: readonly AnalysisPosition[]) {
        if (this.disposed) return;
        const scope = JSON.stringify(positions.map(position => position.key));
        if (scope !== this.scope) { this.scope = scope; this.speculationBlocked = false; }
        const wanted = new Set(positions.map(position => position.key));
        for (const [key, entry] of this.entries) if (!wanted.has(key)) {
            this.entries.delete(key);
            this.settle(entry, cancelled());
        }
        for (const position of positions) if (!this.entries.has(position.key)) {
            this.entries.set(position.key, { position, options: null, error: null, waiters: new Set() });
        }
        if (this.preferred && !wanted.has(this.preferred)) this.preferred = null;
        if (this.running && !wanted.has(this.running.entry.position.key)) this.running.controller.abort();
        this.pump();
    }

    setActive(enabled: boolean) {
        this.enabled = enabled;
        if (!enabled) this.running?.controller.abort();
        else this.pump();
    }

    prioritize(key: string | null) {
        this.preferred = key && this.entries.has(key) ? key : null;
        this.pump();
    }

    peek(position: AnalysisPosition): MoveOption[] | null {
        return this.entries.get(position.key)?.options ?? null;
    }

    load(position: AnalysisPosition, signal: AbortSignal): Promise<MoveOption[]> {
        if (this.disposed || signal.aborted) return Promise.reject(cancelled());
        const entry = this.entries.get(position.key);
        if (!entry) return Promise.reject(new Error('The requested board is no longer being prepared.'));
        if (entry.options) return Promise.resolve(entry.options);
        if (entry.error) return Promise.reject(entry.error);
        return new Promise((resolve, reject) => {
            const abort = () => {
                entry.waiters.delete(waiter);
                waiter.cleanup();
                reject(cancelled());
                this.pump();
            };
            const waiter: Waiter = { resolve, reject, cleanup: () => signal.removeEventListener('abort', abort) };
            signal.addEventListener('abort', abort, { once: true });
            entry.waiters.add(waiter);
            this.pump();
        });
    }

    private settle(entry: Entry, error?: Error) {
        for (const waiter of entry.waiters) {
            waiter.cleanup();
            if (error) waiter.reject(error);
            else waiter.resolve(entry.options!);
        }
        entry.waiters.clear();
    }

    private pump() {
        if (!this.enabled || this.disposed) return;
        const pending = [...this.entries.values()].filter(entry => !entry.options && !entry.error);
        const demanded = pending.find(entry => entry.waiters.size > 0);
        const preferred = pending.find(entry => entry.position.key === this.preferred);
        if (this.running) {
            const urgent = demanded ?? preferred;
            if (urgent && urgent !== this.running.entry) this.running.controller.abort();
            return;
        }
        const entry = demanded ?? (this.speculationBlocked ? undefined : preferred ?? pending[0]);
        if (!entry) return;
        const job = { entry, controller: new AbortController() };
        this.running = job;
        this.engine.analyze(entry.position.fen, entry.position.legalMoves, job.controller.signal)
            .then(evaluated => {
                if (job.controller.signal.aborted || this.entries.get(entry.position.key) !== entry) return;
                const options = buildOptions(createChess(entry.position.pgn), evaluated);
                if (!options.length) throw new Error('No legal move choices were returned.');
                entry.options = options;
                this.settle(entry);
            }).catch(reason => {
                if (job.controller.signal.aborted || this.entries.get(entry.position.key) !== entry) return;
                entry.error = reason instanceof Error ? reason : new Error('The chess engine could not analyze this position.');
                // A speculative failure stays quiet and stops background retries until the next turn.
                this.speculationBlocked = true;
                this.settle(entry, entry.error);
            }).finally(() => {
                if (this.running === job) this.running = null;
                // Aborted Stockfish output has drained before another position can start.
                this.pump();
            });
    }

    dispose() {
        this.disposed = true;
        this.enabled = false;
        this.running?.controller.abort();
        for (const entry of this.entries.values()) this.settle(entry, cancelled());
        this.entries.clear();
        this.engine.dispose();
    }
}
