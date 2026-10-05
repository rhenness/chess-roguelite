import { useEffect, useRef } from 'react';
import type { CheckpointReward } from '../game/checkpointRewards';
import { ITEMS, type ItemId } from '../game/items';
import { ItemIcon } from './RunItems';
import './RunCheckpointReward.css';

export function RunCheckpointReward({ reward, enabled, onChoose }: {
    reward: CheckpointReward; enabled: boolean; onChoose: (id: ItemId) => void;
}) {
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
    return <section className="checkpoint-reward" aria-labelledby="checkpoint-title">
        <header>
            <span className="checkpoint-eyebrow">Round {reward.afterRound} cleared</span>
            <h2 id="checkpoint-title" ref={heading} tabIndex={-1}>Choose your reward</h2>
        </header>
        <div className="checkpoint-offers" role="group" aria-label="Checkpoint items">
            {reward.offers.map(id => <button key={id} className="checkpoint-item" title={ITEMS[id].description}
                aria-label={`Take ${ITEMS[id].name}. ${ITEMS[id].description}`} disabled={!enabled} onClick={() => onChoose(id)}>
                <span className={`loadout-icon item-${id}`}><ItemIcon id={id} /></span>
                <span className="checkpoint-item-copy"><strong>{ITEMS[id].name}</strong>
                    <span>{ITEMS[id].summary}</span></span>
            </button>)}
        </div>
    </section>;
}
