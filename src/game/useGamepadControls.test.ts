import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockGamepad } from '../test/gamepad';
import { useGamepadControls } from './useGamepadControls';

// jsdom does not provide the Gamepad API.
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(enabled = true) {
    if (!navigator.getGamepads) vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { getGamepads: () => [] }));
    const gamepad = mockGamepad();
    const action = vi.fn();
    const release = vi.fn();
    const view = renderHook(({ enabled }) => useGamepadControls(enabled, action, release), { initialProps: { enabled } });
    return { ...gamepad, action, release, ...view };
}

describe('gamepad input', () => {
    it.each([[14, 'left'], [15, 'right'], [12, 'up'], [13, 'down']] as const)('reads D-pad button %i and repeats navigation after a delay', (button, direction) => {
        const pad = setup();
        pad.button(button, true);
        expect(pad.action).toHaveBeenLastCalledWith(direction);
        pad.frame(399);
        expect(pad.action).toHaveBeenCalledTimes(1);
        pad.frame(1);
        expect(pad.action).toHaveBeenCalledTimes(2);
        pad.frame(149);
        expect(pad.action).toHaveBeenCalledTimes(2);
        pad.frame(1);
        expect(pad.action).toHaveBeenCalledTimes(3);
        pad.button(button, false);
        pad.frame(1000);
        expect(pad.action).toHaveBeenCalledTimes(3);
    });

    it('ignores stick drift and uses the dominant left stick direction', () => {
        const pad = setup();
        pad.stick(0.2, -0.4);
        expect(pad.action).not.toHaveBeenCalled();
        for (const [x, y, direction] of [[0.9, 0.6, 'right'], [-0.9, 0, 'left'], [0, -0.9, 'up'], [0, 0.9, 'down']] as const) {
            pad.stick(x, y);
            expect(pad.action).toHaveBeenLastCalledWith(direction);
        }
    });

    it.each([[0, 'confirm'], [1, 'cancel']] as const)('requires release before another %s action', (button, action) => {
        const pad = setup();
        pad.button(button, true);
        pad.frame(5000);
        expect(pad.action).toHaveBeenCalledExactlyOnceWith(action);
        pad.button(button, false);
        pad.button(button, true);
        expect(pad.action).toHaveBeenCalledTimes(2);
    });

    it('waits for neutral input after focus loss, including presses while unfocused', () => {
        const pad = setup();
        fireEvent.blur(window);
        vi.mocked(document.hasFocus).mockReturnValue(false);
        pad.button(0, true);
        vi.mocked(document.hasFocus).mockReturnValue(true);
        pad.frame();
        expect(pad.action).not.toHaveBeenCalled();
        pad.button(0, false);
        pad.tap(0);
        expect(pad.action).toHaveBeenCalledExactlyOnceWith('confirm');
        expect(pad.release).toHaveBeenCalledTimes(1);
    });

    it('handles disconnects, empty slots, and reconnection', () => {
        const pad = setup();
        pad.tap(15);
        pad.connect(false);
        expect(pad.release).toHaveBeenCalledTimes(1);
        pad.connect(true);
        pad.tap(0);
        expect(pad.action.mock.calls).toEqual([['right'], ['confirm']]);
    });

    it('stops polling when disabled or unmounted', () => {
        const pad = setup(false);
        expect(pad.frames.size).toBe(0);
        pad.rerender({ enabled: true });
        pad.tap(0);
        expect(pad.action).toHaveBeenCalledTimes(1);
        pad.rerender({ enabled: false });
        expect(pad.frames.size).toBe(0);
        pad.rerender({ enabled: true });
        pad.unmount();
        expect(pad.frames.size).toBe(0);
    });

    it('gracefully handles unavailable or denied Gamepad APIs', () => {
        const action = vi.fn();
        const release = vi.fn();
        vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { getGamepads: undefined }));
        const absent = renderHook(() => useGamepadControls(true, action, release));
        absent.unmount();
        vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { getGamepads: () => [] }));
        const pad = mockGamepad();
        vi.mocked(navigator.getGamepads).mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
        renderHook(() => useGamepadControls(true, action, release));
        pad.frame();
        expect(action).not.toHaveBeenCalled();
        expect(release).toHaveBeenCalledTimes(1);
        expect(pad.frames.size).toBe(0);
    });
});
