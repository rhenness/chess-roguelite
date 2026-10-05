import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItemId, ItemInventory } from '../../game/items';
import type { PieceSetId } from '../../game/pieceSets';
import { StockfishAnalyzer } from './engine/stockfish';
import { BranchPreloader } from './engine/preloader';
import { currentPosition, nextBranches } from './engine/branches';
import { acceptOptions, advanceReveal, nextBoard, playMove, sessionRecord, startSession, useItem } from './session';
import { loadSave, saveState } from './storage';
import type { EndlessMode, EndlessSession } from './types';

export function useEndlessSession(active: boolean, claimCoins: (id: string, coins: number) => boolean) {
    const [save, setSave] = useState(loadSave);
    const latest = useRef(save);
    const preloader = useRef<BranchPreloader | null>(null);
    const branchKeys = useRef(new Map<string, string>());
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [persisted, setPersisted] = useState(true);
    const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
    const running = active && visible;

    useEffect(() => {
        const onVisibility = () => setVisible(document.visibilityState !== 'hidden');
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

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

    useEffect(() => () => { preloader.current?.dispose(); preloader.current = null; }, []);

    const session = save.session;
    useEffect(() => {
        if (!running || session?.phase !== 'reveal') return;
        const timer = window.setTimeout(() => update(current => {
            const next = advanceReveal(current);
            if (next.phase !== 'analyzing') return next;
            const position = currentPosition(next);
            if (!position) return next;
            const options = preloader.current?.peek(position);
            return options ? acceptOptions(next, position.fen, options) : next;
        }), 1400);
        return () => window.clearTimeout(timer);
    }, [running, session, update]);

    useEffect(() => {
        if (!running || session?.phase !== 'between-games') return;
        const timer = window.setTimeout(() => update(nextBoard), 1500);
        return () => window.clearTimeout(timer);
    }, [running, session, update]);

    const preparation = session?.phase === 'ready' ? 'branches'
        : session?.phase === 'analyzing' || (session?.phase === 'reveal' && !session.boardResult) ? 'current' : 'idle';
    // Reveal and analyzing share one request so the reveal timer never restarts a search.
    useEffect(() => {
        if (!running || !session || preparation === 'idle') {
            preloader.current?.setActive(false);
            if (preparation === 'idle') preloader.current?.keep([]);
            return;
        }
        const loader = preloader.current ?? (preloader.current = new BranchPreloader(new StockfishAnalyzer()));
        if (preparation === 'branches') {
            const branches = nextBranches(session);
            branchKeys.current = new Map(branches.map(branch => [branch.move, branch.key]));
            loader.keep(branches);
            loader.setActive(true);
            return;
        }
        const position = currentPosition(session);
        if (!position) return;
        branchKeys.current.clear();
        loader.keep([position]);
        loader.setActive(true);
        const controller = new AbortController();
        setError(null);
        loader.load(position, controller.signal)
            .then(options => {
                if (controller.signal.aborted) return;
                update(current => current.id === session.id && current.gamesCompleted === session.gamesCompleted && current.pgn === position.pgn
                    ? acceptOptions(current, position.fen, options) : current);
            }).catch(reason => {
                if (controller.signal.aborted) return;
                setError(reason instanceof Error ? reason.message : 'The chess engine could not analyze this position.');
            });
        return () => controller.abort();
    }, [running, preparation, session?.id, session?.gamesCompleted, session?.pgn, session?.options, retryCount, update]);

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
    const prioritize = useCallback((uci: string | null) => {
        preloader.current?.prioritize(latest.current.session?.phase === 'ready' && uci ? branchKeys.current.get(uci) ?? null : null);
    }, []);
    const retry = useCallback(() => {
        preloader.current?.dispose(); preloader.current = null;
        setError(null); setRetryCount(value => value + 1);
    }, []);
    return { session, records: save.records, error, persisted, start, play, use, prioritize, retry };
}
export type EndlessController = ReturnType<typeof useEndlessSession>;
