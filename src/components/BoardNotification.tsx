import { useEffect, type CSSProperties, type ReactNode } from 'react';
import './BoardNotification.css';

export interface BoardNotice {
    /** A new ID restarts the animation, even for consecutive notices of the same kind. */
    id: string;
    visual: ReactNode;
    label: string;
    announcement: string;
    caption?: string;
    tone?: 'health' | 'reward' | 'danger';
    animation?: 'reward' | 'death';
    durationMs?: number;
}

/** Render inside a positioned board wrapper, keyed by notice.id. Visuals can be SVGs or images. */
export function BoardNotification({ notice, onComplete }: {
    notice: BoardNotice;
    onComplete: () => void;
}) {
    const durationMs = notice.durationMs ?? 1500;
    useEffect(() => {
        const timer = window.setTimeout(onComplete, durationMs);
        return () => window.clearTimeout(timer);
    }, [durationMs, onComplete]);

    return <div className={`board-notification-layer animation-${notice.animation ?? 'reward'}`} role="status" aria-live="polite"
        aria-atomic="true" aria-label={notice.announcement}
        style={{ '--notice-duration': `${durationMs}ms` } as CSSProperties}>
        <div className={`board-notification-badge tone-${notice.tone ?? 'reward'}`} aria-hidden="true">
            <span className="board-notification-visual">{notice.visual}</span>
            <div className="board-notification-copy">
                <strong>{notice.label}</strong>
                {notice.caption && <span>{notice.caption}</span>}
            </div>
        </div>
        <span className="board-notification-announcement">{notice.announcement}</span>
    </div>;
}
