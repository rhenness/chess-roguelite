import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockfishAnalyzer } from './stockfish';

class FakeWorker extends EventTarget {
    static instances: FakeWorker[] = [];
    messages: string[] = [];
    terminate = vi.fn();
    constructor(public url: string) { super(); FakeWorker.instances.push(this); }
    postMessage(message: string) { this.messages.push(message); }
    emit(message: string) { this.dispatchEvent(new MessageEvent('message', { data: message })); }
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const analyzer = () => new StockfishAnalyzer();
beforeEach(() => { FakeWorker.instances = []; vi.stubGlobal('Worker', FakeWorker); vi.useFakeTimers(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Endless Stockfish worker', () => {
    it('uses consistent-depth legal evaluations and ignores bounds and unknown moves', async () => {
        const engine = analyzer();
        const result = engine.analyze('fen', ['e2e4', 'd2d4'], new AbortController().signal);
        await flush();
        const worker = FakeWorker.instances[0]!;
        expect(worker.url).toContain('endless/stockfish/stockfish-19-lite-single.js');
        worker.emit('uciok'); await flush();
        worker.emit('info depth 7 multipv 1 score cp 50 pv e2e4');
        worker.emit('info depth 7 multipv 2 score cp 20 pv d2d4');
        worker.emit('info depth 8 multipv 1 score cp 100 lowerbound pv e2e4');
        worker.emit('info depth 8 multipv 1 score cp 999 pv a1a2');
        worker.emit('bestmove e2e4');
        expect(await result).toEqual([
            { uci: 'e2e4', depth: 7, score: { kind: 'cp', value: 50 } },
            { uci: 'd2d4', depth: 7, score: { kind: 'cp', value: 20 } },
        ]);
        engine.dispose();
    });

    it('waits for a cancelled search to finish before starting the next position', async () => {
        const engine = analyzer();
        const firstController = new AbortController();
        const first = engine.analyze('first', ['e2e4'], firstController.signal);
        const rejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });
        await flush();
        const worker = FakeWorker.instances[0]!;
        worker.emit('uciok'); await flush();
        firstController.abort();
        const second = engine.analyze('second', ['d2d4'], new AbortController().signal);
        await flush();
        expect(worker.messages).not.toContain('position fen second');
        expect(worker.messages.at(-1)).toBe('stop');
        worker.emit('info depth 9 score cp 300 pv e2e4');
        worker.emit('bestmove e2e4'); await flush();
        await rejection;
        expect(worker.messages).toContain('position fen second');
        worker.emit('info depth 10 score cp 10 pv d2d4');
        worker.emit('bestmove d2d4');
        expect(await second).toEqual([{ uci: 'd2d4', depth: 10, score: { kind: 'cp', value: 10 } }]);
        engine.dispose();
    });

    it('expands the search when the initial candidates do not provide useful categories', async () => {
        const engine = analyzer();
        const legal = Array.from({ length: 20 }, (_, index) => `${String.fromCharCode(97 + index % 8)}2${String.fromCharCode(97 + index % 8)}${3 + Math.floor(index / 8)}`);
        const promise = engine.analyze('fen', legal, new AbortController().signal);
        await flush();
        const worker = FakeWorker.instances[0]!;
        worker.emit('uciok'); await flush();
        worker.emit(`info depth 7 score cp 20 pv ${legal[0]}`);
        worker.emit('bestmove ' + legal[0]); await flush();
        expect(worker.messages).toContain('setoption name MultiPV value 20');
        expect(worker.messages).toContain('go movetime 2800');
        worker.emit(`info depth 6 score cp 30 pv ${legal[0]}`);
        worker.emit(`info depth 6 score cp -200 pv ${legal[1]}`);
        worker.emit('bestmove ' + legal[0]);
        expect(await promise).toHaveLength(2);
        engine.dispose();
    });

    it('times out a stuck search and allows a new worker to retry', async () => {
        const engine = analyzer();
        const first = engine.analyze('fen', ['e2e4'], new AbortController().signal);
        const rejected = expect(first).rejects.toThrow('timed out');
        await flush();
        const worker = FakeWorker.instances[0]!;
        worker.emit('uciok'); await flush();
        vi.advanceTimersByTime(8000); await flush();
        await rejected;
        expect(worker.terminate).toHaveBeenCalledOnce();
        const second = engine.analyze('retry', ['e2e4'], new AbortController().signal);
        await flush();
        const replacement = FakeWorker.instances[1]!;
        replacement.emit('uciok'); await flush();
        replacement.emit('info depth 5 score cp 0 pv e2e4');
        replacement.emit('bestmove e2e4');
        expect(await second).toHaveLength(1);
        engine.dispose();
        expect(vi.getTimerCount()).toBe(0);
    });
});
