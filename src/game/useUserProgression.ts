import { useCallback, useEffect, useRef, useState } from 'react';
import type { Square } from 'chess.js';
import type { MultiplierBoard } from './multipliers';
import { purchaseMultiplierUpgrade } from './economy';
import type { PieceSetId } from './pieceSets';
import type { RunState } from './run';
import { loadUserProgression, newlyUnlockedSets, recordFinishedRun, saveUserProgression } from './progression';

export function useUserProgression(run: RunState | null) {
    const [profile, setProfile] = useState(loadUserProgression);
    const latestProfile = useRef(profile);
    const recordedRun = useRef<string | null>(null);
    const [pendingUnlocks, setPendingUnlocks] = useState<PieceSetId[]>([]);

    const recordRun = useCallback((run: RunState) => {
        if (run.phase !== 'finished' || recordedRun.current === run.id) return;
        recordedRun.current = run.id;
        if (run.daily && latestProfile.current.lastDailyRewardDay && latestProfile.current.lastDailyRewardDay >= run.daily.day) return;
        // Include runs saved by another tab, while retaining progress if storage failed.
        const stored = loadUserProgression();
        const before = stored.finishedRuns > latestProfile.current.finishedRuns || stored.lastFinishedRunId === run.id
            || (run.daily && stored.lastDailyRewardDay && stored.lastDailyRewardDay >= run.daily.day)
            ? stored : latestProfile.current;
        const after = recordFinishedRun(before, run);
        if (after !== before) saveUserProgression(after);
        latestProfile.current = after;
        setProfile(after);
        const unlocked = newlyUnlockedSets(before, after);
        if (unlocked.length) setPendingUnlocks(current => [...current, ...unlocked]);
    }, []);

    useEffect(() => { if (run) recordRun(run); }, [run, recordRun]);

    const advanceUnlock = useCallback(() => setPendingUnlocks(current => current.slice(1)), []);
    const dismissUnlocks = useCallback(() => setPendingUnlocks([]), []);
    const buyUpgrade = useCallback((set: PieceSetId, square: Square, baseBoard: MultiplierBoard) => {
        // Read the latest balance synchronously so rapid taps cannot overspend.
        const purchase = purchaseMultiplierUpgrade(latestProfile.current, set, square, baseBoard);
        if (!purchase) return null;
        latestProfile.current = purchase.profile;
        saveUserProgression(purchase.profile);
        setProfile(purchase.profile);
        return purchase.upgrade;
    }, []);
    return { profile, pendingUnlocks, advanceUnlock, dismissUnlocks, buyUpgrade, recordRun };
}
