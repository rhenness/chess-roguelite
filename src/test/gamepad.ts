import { act } from '@testing-library/react';
import { vi } from 'vitest';

/** Drive browser gamepad frames independently of gameplay's animation timers. */
export function mockGamepad() {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad: Gamepad = { id: 'Test controller', index: 0, connected: true, mapping: 'standard',
        axes: [0, 0, 0, 0], buttons, timestamp: 0,
        vibrationActuator: null as unknown as GamepadHapticActuator };
    let pads: (Gamepad | null)[] = [pad];
    let time = 0;
    let nextFrame = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(navigator, 'getGamepads').mockImplementation(() => pads);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
        frames.set(++nextFrame, callback);
        return nextFrame;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
    const frame = (elapsed = 16) => act(() => {
        time += elapsed;
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach(callback => callback(time));
    });
    const button = (index: number, pressed: boolean) => {
        buttons[index]!.pressed = pressed;
        buttons[index]!.value = pressed ? 1 : 0;
        frame();
    };
    return { pad, frame, button, frames,
        tap: (index: number) => { button(index, true); button(index, false); },
        stick: (x: number, y = 0) => { (pad.axes as number[])[0] = x; (pad.axes as number[])[1] = y; frame(); },
        connect: (connected: boolean) => { pads = connected ? [null, pad] : []; frame(); },
    };
}
