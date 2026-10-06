import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadSave } from '../features/endless/storage';
import type { EndlessSession } from '../features/endless/types';
import { loadUserProgression } from './progression';
import { loadRunHistory } from './runHistory';
import type { RunState } from './run';
import {
    awardDungeonXp, awardEndlessXp, loadPlayerLeveling, mergePlayerLeveling, migratePlayerLeveling,
    parsePlayerLeveling, PLAYER_LEVELING_STORAGE_KEY, playerLevelProgress, savePlayerLeveling, totalPlayerXp,
    type PlayerLeveling,
} from './playerLeveling';

export function usePlayerLeveling(run: RunState | null, endless: EndlessSession | null) {
    const [state, setState] = useState(() => loadPlayerLeveling()
        ?? migratePlayerLeveling(loadUserProgression(), loadRunHistory(), loadSave()));
    const latest = useRef(state);
    const [persisted, setPersisted] = useState(true);
    const commit = useCallback((change: (before: PlayerLeveling) => PlayerLeveling) => {
        const stored = loadPlayerLeveling();
        const before = stored ? mergePlayerLeveling(latest.current, stored) : latest.current;
        const next = change(before);
        if (next !== latest.current || !stored || mergePlayerLeveling(stored, next) !== stored) {
            setPersisted(savePlayerLeveling(next));
        }
        latest.current = next;
        setState(next);
    }, []);
    const recordRun = useCallback((run: RunState) => commit(state => awardDungeonXp(state, run)), [commit]);

    useEffect(() => { commit(state => state); }, [commit]);
    useEffect(() => { if (run) recordRun(run); }, [run, recordRun]);
    useEffect(() => { if (endless) commit(state => awardEndlessXp(state, endless)); }, [endless, commit]);
    useEffect(() => {
        const sync = (event: StorageEvent) => {
            if (event.key !== PLAYER_LEVELING_STORAGE_KEY) return;
            const incoming = parsePlayerLeveling(event.newValue);
            if (incoming) commit(state => mergePlayerLeveling(state, incoming));
        };
        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, [commit]);
    const progress = useMemo(() => playerLevelProgress(totalPlayerXp(state)), [state]);
    return { state, progress, persisted, recordRun };
}
