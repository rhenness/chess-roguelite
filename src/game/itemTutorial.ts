import { itemCount, type ItemInventory } from './items';
import { PLAY_TUTORIAL_STORAGE_KEY } from './playTutorial';

export const ITEM_TUTORIAL_STORAGE_KEY = 'knightfall.item-tutorial.v1';
export interface ItemTutorialState {
    version: 1;
    status: 'unseen' | 'active' | 'done';
    step: 'item' | 'ready';
    runId: string | null;
    itemUsesAtPrompt: number;
}
export interface ItemTutorialRun {
    id: string;
    phase: string;
    items: ItemInventory;
    itemUses: readonly unknown[];
}
export const initialItemTutorial = (): ItemTutorialState => ({
    version: 1, status: 'unseen', step: 'item', runId: null, itemUsesAtPrompt: 0,
});
export const finishItemTutorial = (state: ItemTutorialState): ItemTutorialState => ({ ...state, status: 'done' });

export function loadItemTutorial(): ItemTutorialState {
    try {
        const stored = window.localStorage.getItem(ITEM_TUTORIAL_STORAGE_KEY);
        if (stored !== null) {
            const value = JSON.parse(stored) as ItemTutorialState | null;
            if (value?.version === 1 && ['unseen', 'active', 'done'].includes(value.status)
                && ['item', 'ready'].includes(value.step)
                && (value.runId === null || typeof value.runId === 'string')
                && (value.status !== 'active' || !!value.runId)
                && Number.isSafeInteger(value.itemUsesAtPrompt) && value.itemUsesAtPrompt >= 0) return value;
        } else {
            // Preserve item lessons completed or in progress before they were tracked separately.
            const legacy = JSON.parse(window.localStorage.getItem(PLAY_TUTORIAL_STORAGE_KEY) ?? 'null');
            if (legacy?.version === 1 && ['item', 'ready'].includes(legacy.step)) {
                if (legacy.status === 'done') return finishItemTutorial(initialItemTutorial());
                if (legacy.status === 'active' && typeof legacy.runId === 'string' && legacy.runId
                    && Number.isSafeInteger(legacy.itemUsesAtPrompt) && legacy.itemUsesAtPrompt >= 0) {
                    return { version: 1, status: 'active', step: legacy.step,
                        runId: legacy.runId, itemUsesAtPrompt: legacy.itemUsesAtPrompt };
                }
            }
        }
    } catch { /* Unavailable storage must not prevent play. */ }
    return initialItemTutorial();
}

export function saveItemTutorial(state: ItemTutorialState): void {
    try { window.localStorage.setItem(ITEM_TUTORIAL_STORAGE_KEY, JSON.stringify(state)); }
    catch { /* Keep progress in memory for this session. */ }
}

export function observeItemTutorial(state: ItemTutorialState, run: ItemTutorialRun | null, enabled: boolean): ItemTutorialState {
    if (!run || state.status === 'done') return state;
    if (state.status === 'active' && state.runId === run.id) {
        if (run.phase === 'finished') return finishItemTutorial(state);
        if (state.step === 'item' && run.itemUses.length > state.itemUsesAtPrompt) return { ...state, step: 'ready' };
        return state;
    }
    if (!enabled || run.phase !== 'decision' || itemCount(run.items) === 0) return state;
    return { version: 1, status: 'active', step: 'item', runId: run.id, itemUsesAtPrompt: run.itemUses.length };
}
