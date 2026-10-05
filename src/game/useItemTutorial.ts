import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunState } from './run';
import { finishItemTutorial, initialItemTutorial, loadItemTutorial, observeItemTutorial,
    saveItemTutorial, type ItemTutorialState } from './itemTutorial';

export function useItemTutorial(run: RunState | null, enabled: boolean) {
    const [state, setState] = useState(loadItemTutorial);
    const latest = useRef(state);
    const update = useCallback((transform: (before: ItemTutorialState) => ItemTutorialState) => {
        const next = transform(latest.current);
        if (next === latest.current) return;
        latest.current = next;
        saveItemTutorial(next);
        setState(next);
    }, []);
    useEffect(() => { update(before => observeItemTutorial(before, run, enabled)); }, [run, enabled, state.step, update]);
    const dismiss = useCallback(() => update(finishItemTutorial), [update]);
    const replay = useCallback(() => update(initialItemTutorial), [update]);
    const step = enabled && state.status === 'active' && run?.id === state.runId && run.phase === 'decision' ? state.step : null;
    return { step, paused: step === 'ready', next: dismiss, skip: dismiss, replay };
}
