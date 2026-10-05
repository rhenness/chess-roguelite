import { Heart, Skull, Sparkles, Trophy } from 'lucide-react';
import type { BoardNotice } from './BoardNotification';
import type { PayoutPreviewOptions } from '../game/useBoardPayout';

export interface NotificationOptions {
    label: string;
    caption?: string;
    announcement?: string;
    icon?: 'heart' | 'skull' | 'sparkles' | 'trophy';
    image?: string;
    tone?: BoardNotice['tone'];
    animation?: BoardNotice['animation'];
    durationMs?: number;
}

export interface NotificationConsole {
    notify: (options: NotificationOptions | string) => void;
    health: (amount?: number) => void;
    death: () => void;
    payout: (options?: PayoutPreviewOptions) => void;
    dismiss: () => void;
    resetDailyDungeon: () => string;
}

declare global {
    interface Window {
        knightfall?: NotificationConsole;
    }
}

const icons = { heart: Heart, skull: Skull, sparkles: Sparkles, trophy: Trophy };
let nextNoticeId = 0;

function createNotice(options: NotificationOptions): BoardNotice {
    if (typeof options.label !== 'string' || !options.label.trim()) {
        throw new Error('Notification label must be a nonempty string.');
    }
    if (options.durationMs !== undefined && (!Number.isFinite(options.durationMs) || options.durationMs <= 0)) {
        throw new Error('Notification durationMs must be a positive finite number.');
    }
    const icon = options.icon ?? 'sparkles';
    if (!Object.hasOwn(icons, icon)) throw new Error('Notification icon must be heart, skull, sparkles, or trophy.');
    const Icon = icons[icon];
    return {
        id: `notice-${++nextNoticeId}`,
        visual: options.image ? <img src={options.image} alt="" />
            : <Icon fill={icon === 'heart' ? 'currentColor' : 'none'} strokeWidth={1.5} />,
        label: options.label,
        announcement: options.announcement ?? [options.label, options.caption].filter(Boolean).join('. '),
        caption: options.caption,
        tone: options.tone,
        animation: options.animation,
        durationMs: options.durationMs,
    };
}

/** Positive amounts show health gained; negative amounts show health lost. */
export function createHealthNotice(amount = 1): BoardNotice {
    if (!Number.isInteger(amount) || amount === 0) throw new Error('Health notification amount must be a nonzero integer.');
    const label = `${amount > 0 ? '+' : '−'}${Math.abs(amount)}`;
    return createNotice({ label, announcement: `${label} health`, icon: 'heart', tone: amount > 0 ? 'health' : 'danger' });
}

/** Lethal moves get a dedicated ending instead of a numeric health-loss badge. */
export function createDeathNotice(): BoardNotice {
    return createNotice({
        label: 'Run over', announcement: 'Run over. No health remaining.',
        icon: 'skull', tone: 'danger', animation: 'death', durationMs: 1800,
    });
}

/** Install while the app is mounted; restore any previous object on cleanup. */
export function installNotificationConsole(show: (notice: BoardNotice) => void, dismiss: () => void,
    previewPayout: (options?: PayoutPreviewOptions) => void, resetDailyDungeon: () => string): () => void {
    const previous = window.knightfall;
    const api: NotificationConsole = {
        notify: options => show(createNotice(typeof options === 'string' ? { label: options } : options)),
        health: amount => show(createHealthNotice(amount)),
        death: () => show(createDeathNotice()),
        payout: previewPayout,
        dismiss,
        resetDailyDungeon,
    };
    window.knightfall = api;
    return () => {
        if (window.knightfall !== api) return;
        if (previous) window.knightfall = previous;
        else delete window.knightfall;
    };
}
