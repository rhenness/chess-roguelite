import { useCallback, useEffect, useRef, useState } from 'react';
import type { PayoutResult } from './multipliers';
import type { RunState } from './run';
import { loadRunHistory, mergeRunHistory, recordRunResult, RUN_HISTORY_STORAGE_KEY, saveRunHistory } from './runHistory';

export function useRunHistory() {
    const [history, setHistory] = useState(loadRunHistory);
    const latest = useRef(history);
    const recordRun = useCallback((run: RunState, payout: PayoutResult, finishedAt?: number) => {
        const before = mergeRunHistory(latest.current, loadRunHistory());
        const after = recordRunResult(before, run, payout, finishedAt);
        if (after === latest.current) return;
        latest.current = after;
        saveRunHistory(after);
        setHistory(after);
    }, []);

    useEffect(() => {
        const synchronize = (event: StorageEvent) => {
            if (event.key !== RUN_HISTORY_STORAGE_KEY) return;
            const merged = mergeRunHistory(latest.current, loadRunHistory());
            if (merged === latest.current) return;
            latest.current = merged;
            setHistory(merged);
        };
        window.addEventListener('storage', synchronize);
        return () => window.removeEventListener('storage', synchronize);
    }, []);
    return { history, recordRun };
}
