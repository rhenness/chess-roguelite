import { Check } from 'lucide-react';
import { SKILL_TIERS, SKILL_TIER_LABELS, type SkillTier } from '../config/difficulty';
import './SkillTierPicker.css';

export function SkillTierPicker({ value, onChange, labelledBy, cards = false }: {
    value: SkillTier | null; onChange: (tier: SkillTier) => void; labelledBy?: string; cards?: boolean;
}) {
    return <fieldset className={`skill-tier-picker${cards ? ' skill-tier-picker-cards' : ''}`} aria-label={labelledBy ? undefined : 'Skill level'} aria-labelledby={labelledBy}>
        <div className="skill-tier-options">
            {SKILL_TIERS.map((tier, index) => <button key={tier} type="button" aria-label={SKILL_TIER_LABELS[tier]}
                aria-pressed={value === tier} data-modal-focus={index === 0 ? 'true' : undefined} onClick={() => onChange(tier)}>
                <strong>{SKILL_TIER_LABELS[tier]}</strong>
                {!cards && value === tier && <Check size={16} aria-hidden="true" />}
            </button>)}
        </div>
    </fieldset>;
}

export function SkillTierBadge({ skillTier }: { skillTier: SkillTier }) {
    return <span className={`skill-tier-badge skill-tier-${skillTier}`} aria-label={`${SKILL_TIER_LABELS[skillTier]} skill level`}>{SKILL_TIER_LABELS[skillTier]}</span>;
}
