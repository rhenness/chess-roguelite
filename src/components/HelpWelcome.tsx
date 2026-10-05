import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import './HelpWelcome.css';

export const HELP_WELCOME_STORAGE_KEY = 'knightfall.help-welcome.dismissed.v1';

export function HelpWelcome({ home, blocked, anchor }: {
    home: boolean;
    blocked: boolean;
    anchor: RefObject<HTMLButtonElement | null>;
}) {
    const [dismissed, setDismissed] = useState(() => {
        try { return window.localStorage.getItem(HELP_WELCOME_STORAGE_KEY) === 'true'; }
        catch { return false; }
    });
    const appeared = useRef(false);
    const tip = useRef<HTMLElement>(null);
    const visible = home && !blocked && !dismissed;

    const dismiss = useCallback((remember = false) => {
        if (remember) {
            try { window.localStorage.setItem(HELP_WELCOME_STORAGE_KEY, 'true'); }
            catch { /* Dismiss for this visit when browser storage is unavailable. */ }
        }
        if (tip.current?.contains(document.activeElement)) anchor.current?.focus();
        setDismissed(true);
    }, [anchor]);

    useEffect(() => {
        if (visible) appeared.current = true;
        else if (appeared.current) setDismissed(true);
    }, [visible]);

    useLayoutEffect(() => {
        if (!visible) return;
        const position = () => {
            const button = anchor.current;
            const bubble = tip.current;
            if (!button || !bubble) return;
            const bounds = button.getBoundingClientRect();
            const width = bubble.getBoundingClientRect().width;
            const center = bounds.left + bounds.width / 2;
            const left = Math.max(16, Math.min(center - width / 2, window.innerWidth - width - 16));
            bubble.style.setProperty('--help-tip-left', `${left - bounds.left}px`);
            bubble.style.setProperty('--help-tip-arrow', `${center - left}px`);
        };
        position();
        window.addEventListener('resize', position);
        return () => window.removeEventListener('resize', position);
    }, [visible, anchor]);

    useEffect(() => {
        if (!visible) return;
        const outside = (event: PointerEvent) => {
            if (event.target instanceof Node && !tip.current?.contains(event.target) && !anchor.current?.contains(event.target)) dismiss();
        };
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('pointerdown', outside);
            document.removeEventListener('keydown', escape);
        };
    }, [visible, anchor, dismiss]);

    if (!visible) return null;
    return <aside ref={tip} className="help-welcome" aria-labelledby="help-welcome-title">
        <p role="status"><strong id="help-welcome-title">Need help?</strong> This Help menu explains whatever page you’re viewing.</p>
        <div className="help-welcome-actions">
            <button className="primary-small" onClick={() => dismiss(true)}>OK</button>
        </div>
    </aside>;
}
