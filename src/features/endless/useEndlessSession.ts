import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItemId, ItemInventory } from '../../game/items';
import type { PieceSetId } from '../../game/pieceSets';
import { createChess, moveToUci } from './chess';
import { StockfishAnalyzer } from './engine/stockfish';
import { buildOptions } from './options';
import { acceptOptions, advanceReveal, nextBoard, playMove, sessionRecord, startSession, useItem } from './session';
import { loadSave, saveState } from './storage';
import type { EndlessMode, EndlessSession } from './types';

export function useEndlessSession(active: boolean, claimCoins: (id: string, coins: number) => boolean) {
    const [save, setSave] = useState(loadSave);
    const latest = useRef(save);
    const analyzer = useRef<StockfishAnalyzer | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [persisted, setPersisted] = useState(true);

    const update = useCallback((change: (session: EndlessSession) => EndlessSession) => {
        const current = latest.current;
        if (!current.session) return;
        const session = change(current.session);
        if (session === current.session) return;
        const record = sessionRecord(session);
        const records = record && !current.records.some(saved => saved.id === record.id) ? [...current.records, record] : current.records;
        const next = { ...current, session, records };
        latest.current = next;
        setSave(next);
        setPersisted(saveState(next));
    }, []);

    useEffect(() => {
        const record = save.session && sessionRecord(save.session);
        if (record) claimCoins(`endless:${record.id}`, record.coins);
    }, [save.session, claimCoins]);

    useEffect(() => () => { analyzer.current?.dispose(); analyzer.current = null; }, []);

    const session = save.session;
    useEffect(() => {
        if (!active || session?.phase !== 'reveal') return;
        const timer = window.setTimeout(() => update(advanceReveal), 1400);
        return () => window.clearTimeout(timer);
    }, [active, session, update]);

    useEffect(() => {
        if (!active || session?.phase !== 'between-games') return;
        const timer = window.setTimeout(() => update(nextBoard), 1500);
        return () => window.clearTimeout(timer);
    }, [active, session, update]);

    useEffect(() => {
        if (!active || session?.phase !== 'analyzing') return;
        const controller = new AbortController();
        const chess = createChess(session.pgn);
        const fen = chess.fen();
        setError(null);
        const engine = analyzer.current ?? (analyzer.current = new StockfishAnalyzer());
        engine.analyze(fen, chess.moves({ verbose: true }).map(moveToUci), controller.signal)
            .then(evaluated => {
                if (controller.signal.aborted) return;
                const options = buildOptions(chess, evaluated);
                if (!options.length) throw new Error('No legal move choices were returned.');
                update(current => current.id === session.id ? acceptOptions(current, fen, options) : current);
            }).catch(reason => {
                if (controller.signal.aborted) return;
                setError(reason instanceof Error ? reason.message : 'The chess engine could not analyze this position.');
            });
        return () => controller.abort();
    }, [active, session?.id, session?.phase, session?.pgn, retryCount, update]);

    const start = useCallback((mode: EndlessMode, set: PieceSetId, items: ItemInventory) => {
        const session = startSession(mode, set, items);
        const next = { ...latest.current, session };
        latest.current = next;
        setSave(next);
        setError(null);
        setPersisted(saveState(next));
    }, []);
    const play = useCallback((uci: string) => update(current => playMove(current, uci)), [update]);
    const use = useCallback((id: ItemId) => update(current => useItem(current, id)), [update]);
    const retry = useCallback(() => {
        analyzer.current?.dispose(); analyzer.current = null;
        setError(null); setRetryCount(value => value + 1);
    }, []);
    return { session, records: save.records, error, persisted, start, play, use, retry };
}
export type EndlessController = ReturnType<typeof useEndlessSession>;
