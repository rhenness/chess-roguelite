import { Check } from 'lucide-react';
import type { CSSProperties, ReactNode, RefObject } from 'react';

export const OPTION_COLORS = ['#c28b26', '#477c9e', '#a95843', '#785b96'];
export const CONFIRM_COLOR = '#2f8a5c';

export interface MoveOptionButton {
    uci: string;
    label: string;
    content?: ReactNode;
}

/** Rendering is shared; each mode owns selection, validation, and committing moves. */
export function MoveOptions({ options, pending, onSelect, onPreview, groupRef }: {
    options: readonly MoveOptionButton[];
    pending: string | null;
    onSelect: (uci: string) => void;
    onPreview: (uci: string | null) => void;
    groupRef?: RefObject<HTMLDivElement | null>;
}) {
    return <div className="move-picker"><div ref={groupRef} className="move-options" role="group" aria-label="Available moves">
        {options.map((option, index) => <button className={`move-option${pending === option.uci ? ' pending' : ''}`} key={option.uci}
            onClick={() => onSelect(option.uci)}
            onMouseEnter={() => onPreview(option.uci)} onMouseLeave={() => onPreview(null)}
            onFocus={() => onPreview(option.uci)} onBlur={() => onPreview(null)}
            aria-pressed={pending === option.uci} aria-label={option.label}
            style={{ '--option-color': OPTION_COLORS[index] } as CSSProperties}>
            {option.content}
            {pending === option.uci && <Check className="selection-check" aria-hidden="true" strokeWidth={3} />}
        </button>)}
    </div></div>;
}
