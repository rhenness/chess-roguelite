import type { RunState } from './run';

export const PLAY_TUTORIAL_STORAGE_KEY = 'knightfall.play-tutorial.v1';
export const PLAY_TUTORIAL_STEPS = ['welcome', 'piece', 'destination', 'feedback', 'health', 'healing',
    'carryover', 'waiting-checkpoint', 'item', 'ready'] as const;
export type PlayTutorialStep = typeof PLAY_TUTORIAL_STEPS[number];
export interface PlayTutorialState {
    version: 1;
    status: 'unseen' | 'active' | 'done';
    runId: string | null;
    step: PlayTutorialStep;
    startingDecision: number;
    itemUsesAtPrompt: number;
}

export const initialPlayTutorial = (): PlayTutorialState => ({
    version: 1, status: 'unseen', runId: null, step: 'welcome', startingDecision: 0, itemUsesAtPrompt: 0,
});

export function loadPlayTutorial(): PlayTutorialState {
    try {
        const stored = JSON.parse(window.localStorage.getItem(PLAY_TUTORIAL_STORAGE_KEY) ?? 'null');
        // Retire the checkpoint explanation without losing an in-progress guide.
        const value = (stored?.step === 'checkpoint' ? { ...stored, step: 'waiting-checkpoint' } : stored) as PlayTutorialState | null;
        if (value?.version === 1 && ['unseen', 'active', 'done'].includes(value.status)
            && (value.runId === null || typeof value.runId === 'string')
            && (value.status !== 'active' || !!value.runId)
            && PLAY_TUTORIAL_STEPS.includes(value.step)
            && Number.isSafeInteger(value.startingDecision) && value.startingDecision >= 0
            && Number.isSafeInteger(value.itemUsesAtPrompt) && value.itemUsesAtPrompt >= 0) {
            // Piece/option selection is transient UI state; resume by asking for the piece again.
            return value.status === 'active' && value.step === 'destination' ? { ...value, step: 'piece' } : value;
        }
    } catch { /* Unavailable or malformed storage must not prevent play. */ }
    return initialPlayTutorial();
}

export function savePlayTutorial(state: PlayTutorialState): void {
    try { window.localStorage.setItem(PLAY_TUTORIAL_STORAGE_KEY, JSON.stringify(state)); }
    catch { /* Keep tutorial progress in memory for this session. */ }
}

export const tutorialBelongsToRun = (state: PlayTutorialState, run: RunState | null): run is RunState =>
    state.status === 'active' && !!run && !run.daily && run.id === state.runId;

export function beginPlayTutorial(run: RunState): PlayTutorialState {
    return { ...initialPlayTutorial(), status: 'active', runId: run.id,
        step: run.phase === 'checkpoint' ? 'waiting-checkpoint' : 'welcome', startingDecision: run.decisionsMade,
        itemUsesAtPrompt: run.itemUses.length };
}

export const finishPlayTutorial = (state: PlayTutorialState): PlayTutorialState => ({ ...state, status: 'done' });

export const tutorialPausesPlay = (step: PlayTutorialStep): boolean =>
    ['welcome', 'feedback', 'health', 'healing', 'carryover', 'ready'].includes(step);

/** Observe real actions; tutorial explanations never change run totals or inventory. */
export function observePlayTutorial(state: PlayTutorialState, run: RunState | null): PlayTutorialState {
    if (!tutorialBelongsToRun(state, run)) return state;
    if ((state.step === 'piece' || state.step === 'destination') && run.decisionsMade > state.startingDecision) {
        return { ...state, step: 'feedback' };
    }
    if (run.phase === 'finished' && ['piece', 'destination', 'waiting-checkpoint', 'item'].includes(state.step)) {
        return finishPlayTutorial(state);
    }
    if (['piece', 'destination'].includes(state.step) && run.phase === 'checkpoint') return { ...state, step: 'waiting-checkpoint' };
    if (state.step === 'waiting-checkpoint' && run.phase === 'decision' && Object.values(run.items).some(count => (count ?? 0) > 0)) {
        return { ...state, step: 'item', itemUsesAtPrompt: run.itemUses.length };
    }
    if (state.step === 'item' && run.itemUses.length > state.itemUsesAtPrompt) return { ...state, step: 'ready' };
    return state;
}

export function advancePlayTutorial(state: PlayTutorialState, run: RunState | null): PlayTutorialState {
    if (!tutorialBelongsToRun(state, run)) return state;
    const next: Partial<Record<PlayTutorialStep, PlayTutorialStep>> = {
        welcome: 'piece', feedback: 'health', health: 'healing', healing: 'carryover',
    };
    const step = next[state.step];
    if (step) return { ...state, step };
    if (state.step === 'carryover') {
        if (run.phase === 'finished') return finishPlayTutorial(state);
        if (run.checkpointRewards.some(reward => reward.selected === null)) return { ...state, step: 'waiting-checkpoint' };
        if (Object.values(run.items).some(count => (count ?? 0) > 0)) {
            return { ...state, step: 'item', itemUsesAtPrompt: run.itemUses.length };
        }
        return finishPlayTutorial(state);
    }
    if (state.step === 'item' || state.step === 'ready') return finishPlayTutorial(state);
    return state;
}
