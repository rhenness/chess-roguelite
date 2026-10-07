import { useEffect, useRef } from 'react';

export type GamepadAction = 'left' | 'right' | 'up' | 'down' | 'confirm' | 'cancel';
type Direction = Exclude<GamepadAction, 'confirm' | 'cancel'>;
interface PadState { direction: Direction | null; confirm: boolean; cancel: boolean; repeatAt: number }

const DEAD_ZONE = 0.55;
const REPEAT_DELAY = 400;
const REPEAT_INTERVAL = 150;

function directionOf(pad: Gamepad): Direction | null {
    const horizontal = Number(!!pad.buttons[15]?.pressed) - Number(!!pad.buttons[14]?.pressed);
    const vertical = Number(!!pad.buttons[13]?.pressed) - Number(!!pad.buttons[12]?.pressed);
    if (horizontal) return horizontal > 0 ? 'right' : 'left';
    if (vertical) return vertical > 0 ? 'down' : 'up';
    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;
    if (Math.max(Math.abs(x), Math.abs(y)) < DEAD_ZONE) return null;
    return Math.abs(x) >= Math.abs(y) ? x > 0 ? 'right' : 'left' : y > 0 ? 'down' : 'up';
}

/** Face buttons fire on a new press; only navigation repeats while held. */
export function useGamepadControls(enabled: boolean, onAction: (action: GamepadAction) => void, onRelease: () => void) {
    const callbacks = useRef({ onAction, onRelease });
    useEffect(() => { callbacks.current = { onAction, onRelease }; });

    useEffect(() => {
        if (!enabled || typeof navigator.getGamepads !== 'function') return;
        const previous = new Map<number, PadState>();
        let frame = 0;
        let needsNeutral = false;
        const suspend = () => { needsNeutral = true; callbacks.current.onRelease(); };
        const visibilityChanged = () => { if (document.hidden) suspend(); };
        const poll = (time: number) => {
            let pads: (Gamepad | null)[];
            try { pads = Array.from(navigator.getGamepads()); }
            catch { callbacks.current.onRelease(); return; }
            const connected = pads.filter((pad): pad is Gamepad => !!pad?.connected && pad.mapping === 'standard');
            const canAct = !document.hidden && document.hasFocus();
            if (!canAct) needsNeutral = true;
            const samples = connected.map(pad => ({ pad, direction: directionOf(pad),
                confirm: !!pad.buttons[0]?.pressed, cancel: !!pad.buttons[1]?.pressed }));
            if (canAct && samples.every(sample => !sample.direction && !sample.confirm && !sample.cancel)) needsNeutral = false;
            let dispatched = false;
            for (const { pad, direction, confirm, cancel } of samples) {
                const before = previous.get(pad.index);
                const changed = direction !== (before?.direction ?? null);
                const repeat = !!direction && !changed && time >= (before?.repeatAt ?? Infinity);
                const action: GamepadAction | null = cancel && !before?.cancel ? 'cancel'
                    : direction && (changed || repeat) ? direction
                    : confirm && !before?.confirm ? 'confirm' : null;
                previous.set(pad.index, { direction, confirm, cancel,
                    repeatAt: changed ? time + REPEAT_DELAY : repeat ? time + REPEAT_INTERVAL : before?.repeatAt ?? 0 });
                if (action && canAct && !needsNeutral && !dispatched) {
                    dispatched = true;
                    callbacks.current.onAction(action);
                }
            }
            if (previous.size && !connected.length) callbacks.current.onRelease();
            for (const index of previous.keys()) {
                if (!connected.some(pad => pad.index === index)) previous.delete(index);
            }
            frame = requestAnimationFrame(poll);
        };
        window.addEventListener('blur', suspend);
        document.addEventListener('visibilitychange', visibilityChanged);
        frame = requestAnimationFrame(poll);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('blur', suspend);
            document.removeEventListener('visibilitychange', visibilityChanged);
        };
    }, [enabled]);
}
