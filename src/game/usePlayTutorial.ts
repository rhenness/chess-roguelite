import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunState } from './run';
import { advancePlayTutorial, beginPlayTutorial, finishPlayTutorial, loadPlayTutorial, observePlayTutorial,
    savePlayTutorial, tutorialBelongsToRun, tutorialPausesPlay, type PlayTutorialState } from './playTutorial';

export function usePlayTutorial(run: RunState | null) {
    const [state, setState] = useState(loadPlayTutorial);
    const latest = useRef(state);
    const update = useCallback((transform: (before: PlayTutorialState) => PlayTutorialState) => {
        const next = transform(latest.current);
        if (next === latest.current) return;
        latest.current = next;
        savePlayTutorial(next);
        setState(next);
    }, []);
    useEffect(() => { update(before => observePlayTutorial(before, run)); }, [run, state.step, update]);
    const begin = useCallback((nextRun: RunState, eligible: boolean, replay = false) => {
        if (nextRun.daily || nextRun.phase === 'finished') return;
        update(before => replay || (eligible && before.status !== 'done') ? beginPlayTutorial(nextRun) : before);
    }, [update]);
    const selectedPiece = useCallback(() => {
        update(before => tutorialBelongsToRun(before, run) && before.step === 'piece' ? { ...before, step: 'destination' } : before);
    }, [run, update]);
    const next = useCallback(() => update(before => advancePlayTutorial(before, run)), [run, update]);
    const skip = useCallback(() => update(finishPlayTutorial), [update]);
    const active = tutorialBelongsToRun(state, run);
    return { state, begin, selectedPiece, next, skip,
        step: active && run.phase !== 'checkpoint' && state.step !== 'waiting-checkpoint' ? state.step : null,
        paused: active && tutorialPausesPlay(state.step) };
}
