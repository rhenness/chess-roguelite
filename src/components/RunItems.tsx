import { useEffect, useRef, useState } from 'react';
import { Check, Coins, Crown, HeartPlus, Minus, Plus, Shield, X } from 'lucide-react';
import { ITEMS, ITEM_IDS, itemCount, loadoutCost, LOADOUT_LIMIT, type ActiveEffect, type ItemId, type ItemInventory } from '../game/items';
import './Items.css';

export function ItemIcon({ id }: { id: ItemId }) {
    const Icon = id === 'triple-crown' ? Crown : id === 'kings-guard' ? Shield : HeartPlus;
    return <Icon size={20} aria-hidden="true" />;
}

export function ItemLoadout({ selected, coins, onChange, onBring }: {
    selected: ItemInventory; coins: number;
    onChange: (next: ItemInventory) => void; onBring: (id: ItemId) => void;
}) {
    const total = itemCount(selected);
    const cost = loadoutCost(selected);
    return <section className="loadout" aria-label="Run supplies">
        <div className="loadout-list">{ITEM_IDS.map(id => {
            const item = ITEMS[id];
            const affordable = coins >= cost + item.price;
            return <div className="loadout-item" key={id}>
                <div className={`loadout-icon item-${id}`}><ItemIcon id={id} /></div>
                <div className="loadout-copy"><div className="loadout-title"><strong>{item.name}</strong>
                    <span className="loadout-price" aria-label={`${item.name}: ${item.price} coins`}><Coins size={14} aria-hidden="true" />{item.price}</span></div><p>{item.summary}</p></div>
                <div className="loadout-controls"><div className="loadout-quantity">
                    <button aria-label={`Remove ${item.name}`} disabled={!(selected[id]! > 0)}
                        onClick={() => onChange({ ...selected, [id]: selected[id]! - 1 })}><Minus size={16} aria-hidden="true" /></button>
                    <span aria-label={`${item.name} selected: ${selected[id] ?? 0}`}>{selected[id] ?? 0}</span>
                    <button aria-label={`Bring ${item.name} for ${item.price} coins`}
                        disabled={total >= LOADOUT_LIMIT || !affordable} onClick={() => onBring(id)}>
                        <Plus size={16} aria-hidden="true" /></button></div>
                </div>
            </div>;
        })}</div>
        <div className="loadout-footer"><small className="loadout-note">Unused items expire after the run.</small>
            <span className="loadout-total" aria-label={`Item total: ${cost} coins`}><Coins size={16} aria-hidden="true" />Total <strong>{cost}</strong></span></div>
    </section>;
}

export function RunItems({ items, activeEffects, enabled, canUse, onUse }: {
    items: ItemInventory; activeEffects: readonly ActiveEffect[]; enabled: boolean;
    canUse: (id: ItemId) => boolean; onUse: (id: ItemId) => void;
}) {
    const [selected, setSelected] = useState<ItemId | null>(null);
    const selectedSlot = useRef<HTMLDivElement | null>(null);
    const availableItems = ITEM_IDS.filter(id => (items[id] ?? 0) > 0);
    const count = (id: ItemId) => items[id] ?? 0;
    useEffect(() => {
        if (!enabled || (selected && !canUse(selected))) setSelected(null);
    }, [enabled, canUse, selected]);
    useEffect(() => {
        if (!selected) return;
        const dismissOutside = (event: Event) => {
            if (event.target instanceof Node && !selectedSlot.current?.contains(event.target)) setSelected(null);
        };
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
        document.addEventListener('pointerdown', dismissOutside, true);
        document.addEventListener('click', dismissOutside, true);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('pointerdown', dismissOutside, true);
            document.removeEventListener('click', dismissOutside, true);
            document.removeEventListener('keydown', escape);
        };
    }, [selected]);
    if (!availableItems.length && !activeEffects.length) return null;
    return <section className="run-items" aria-label="Run items">
        {availableItems.length > 0 && <div className="item-bar">{availableItems.map(id =>
            <div className="item-slot" key={id} ref={selected === id ? selectedSlot : undefined}>
                <button className={`item-button${selected === id ? ' selected' : ''}`} disabled={!enabled || !canUse(id)}
                    aria-label={`${ITEMS[id].name}, ${count(id)} remaining`} aria-expanded={selected === id} aria-controls={selected === id ? 'item-confirmation' : undefined}
                    title={ITEMS[id].description} onClick={() => setSelected(selected === id ? null : id)}>
                    <ItemIcon id={id} /><span>{ITEMS[id].name}</span><strong>×{count(id)}</strong></button>
                {selected === id && <div className="item-confirmation" id="item-confirmation" role="group" aria-label={`Use ${ITEMS[id].name}?`}>
                    <button className="item-cancel" aria-label={`Cancel use of ${ITEMS[id].name}`} title="Cancel" onClick={() => setSelected(null)}><X size={24} aria-hidden="true" /></button>
                    <button className="item-confirm" aria-label={`Confirm use of ${ITEMS[id].name}`} title="Use item" onClick={() => { onUse(id); setSelected(null); }}><Check size={24} aria-hidden="true" /></button>
                </div>}
            </div>)}
        </div>}
        {activeEffects.length > 0 && <div className="active-effects" aria-label="Active item effects" aria-live="polite">{activeEffects.map(active => {
            const label = active.effect.kind === 'scoreMultiplier' ? `×${active.effect.multiplier}` : 'Shield';
            const description = `${ITEMS[active.sourceItemId].name}: ${active.remainingMoves} ${active.remainingMoves === 1 ? 'move' : 'moves'} remaining. ${ITEMS[active.sourceItemId].description}`;
            return <span key={active.sourceItemId} className="effect-badge" title={description} aria-label={description} tabIndex={0}>
                <ItemIcon id={active.sourceItemId} /><span>{label} · {active.remainingMoves} {active.remainingMoves === 1 ? 'move' : 'moves'}</span></span>;
        })}</div>}
    </section>;
}
