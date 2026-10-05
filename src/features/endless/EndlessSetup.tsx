import { useRef, useState } from 'react';
import { Flame, Heart } from 'lucide-react';
import { PieceSetPicker } from '../../components/PieceSetPicker';
import { ItemLoadout } from '../../components/RunItems';
import { ITEMS, itemCount, loadoutCost, LOADOUT_LIMIT, type ItemId, type ItemInventory } from '../../game/items';
import { isPieceSetUnlocked, type UserProgression } from '../../game/progression';
import type { PageLocation } from '../../game/usePageNavigation';
import type { PieceSetId } from '../../game/pieceSets';
import type { EndlessController } from './useEndlessSession';
import type { EndlessMode } from './types';

export function EndlessSetup({ page, controller, profile, buyLoadout, navigate }: {
    page: 'endless' | 'endless-items'; controller: EndlessController; profile: UserProgression;
    buyLoadout: (items: ItemInventory) => boolean; navigate: (location: PageLocation) => void;
}) {
    const [mode, setMode] = useState<EndlessMode>(controller.session?.mode ?? 'standard');
    const [set, setSet] = useState<PieceSetId>(controller.session?.set ?? 'default');
    const [items, setItems] = useState<ItemInventory>({});
    const latestItems = useRef(items);
    latestItems.current = items;
    const [error, setError] = useState<string | null>(null);
    const itemsStep = page === 'endless-items';
    const resumable = !!controller.session && controller.session.phase !== 'finished';
    const currentMode = itemsStep ? 'standard' : mode;
    const begin = () => {
        if (!isPieceSetUnlocked(set, profile)) return;
        const selected = currentMode === 'hardcore' ? {} : latestItems.current;
        if (!buyLoadout(selected)) { setError('Not enough coins for these items.'); return; }
        controller.start(currentMode, set, selected);
        setItems({});
        navigate({ page: 'endless-game' });
    };
    const bring = (id: ItemId) => {
        const selected = latestItems.current;
        if (itemCount(selected) >= LOADOUT_LIMIT || loadoutCost(selected) + ITEMS[id].price > profile.coins) return;
        const next = { ...selected, [id]: (selected[id] ?? 0) + 1 };
        latestItems.current = next;
        setItems(next);
    };
    return <section className="regular-page endless-setup" aria-labelledby="endless-setup-title">
        <div className="regular-setup-body" data-page-scroll="endless-setup">
            <header className="page-heading"><h1 id="endless-setup-title" tabIndex={-1} data-page-focus>{itemsStep ? 'Choose your items' : 'Endless'}</h1></header>
            {itemsStep ? <ItemLoadout selected={items} coins={profile.coins} onChange={setItems} onBring={bring} /> : <>
                <div className="endless-modes" role="group" aria-label="Endless difficulty">
                    <button aria-pressed={mode === 'standard'} onClick={() => setMode('standard')}>
                        <Heart size={22} aria-hidden="true" /><strong>Standard</strong><span>Lives and items</span>
                    </button>
                    <button aria-pressed={mode === 'hardcore'} onClick={() => setMode('hardcore')}>
                        <Flame size={22} aria-hidden="true" /><strong>Hardcore</strong><span>One mistake ends the streak</span>
                    </button>
                </div>
                <PieceSetPicker showHeading={false} selectionOnly selectedSet={set} onSelect={setSet}
                    onUpgrade={() => undefined} showUpgrades={false} showMultipliers={false}
                    healthOverride={mode === 'hardcore' ? 1 : undefined} progression={profile} />
            </>}
            {error && <p className="endless-error" role="alert">{error}</p>}
        </div>
        <footer className="regular-setup-footer"><div className={`setup-actions${!itemsStep && resumable ? ' setup-actions-resumable' : ''}`}>
            {itemsStep ? <>
                <button className="text-button" onClick={() => navigate({ page: 'endless' })}>Back to sets</button>
                <button className="primary-small" disabled={loadoutCost(items) > profile.coins || !isPieceSetUnlocked(set, profile)} onClick={begin}>Start endless</button>
            </> : <>
                {controller.session && <button className={resumable ? 'primary-small' : 'text-button'} onClick={() => navigate({ page: 'endless-game' })}>
                    {controller.session.phase === 'finished' ? 'View last result' : 'Resume endless'}</button>}
                <button className={resumable ? 'text-button' : 'primary-small'} disabled={!isPieceSetUnlocked(set, profile)}
                    onClick={mode === 'hardcore' ? begin : () => navigate({ page: 'endless-items' })}>
                    {resumable ? 'Start new' : mode === 'hardcore' ? 'Start hardcore' : 'Next: items'}</button>
            </>}
        </div></footer>
    </section>;
}
