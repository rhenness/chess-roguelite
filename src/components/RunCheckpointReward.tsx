import { useEffect, useRef } from 'react';
import type { CheckpointReward } from '../game/checkpointRewards';
import { ITEMS, type ItemId } from '../game/items';
import { RewardItemArt } from './RewardItemArt';
import './RunCheckpointReward.css';

export function RunCheckpointReward({ reward, enabled, onChoose }: {
    reward: CheckpointReward; enabled: boolean; onChoose: (id: ItemId) => void;
}) {
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
    return <section className="checkpoint-reward" aria-labelledby="checkpoint-title">
        <div className="checkpoint-panel">
            <svg className="checkpoint-frame" viewBox="0 0 400 270" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <path d="M9 1H391L399 9V261L391 269H9L1 261V9Z" fill="var(--reward-panel)" stroke="#dfb65e" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            </svg>
            <header>
                <h2 id="checkpoint-title" ref={heading} tabIndex={-1}>Choose your reward</h2>
                <span className="checkpoint-divider" aria-hidden="true">
                    <svg viewBox="0 0 6 6" focusable="false"><path d="M3 0 6 3 3 6 0 3Z" fill="currentColor" /></svg>
                </span>
            </header>
            <div className="checkpoint-offers" role="group" aria-label="Checkpoint items">
                {reward.offers.map(id => <button key={id} className="checkpoint-item" title={ITEMS[id].description}
                    aria-label={`Take ${ITEMS[id].name}. ${ITEMS[id].description}`} disabled={!enabled} onClick={() => onChoose(id)}>
                    <RewardItemArt id={id} />
                    <span className="checkpoint-item-copy"><strong>{ITEMS[id].name}</strong>
                        <span>{ITEMS[id].summary}</span></span>
                </button>)}
            </div>
        </div>
    </section>;
}
