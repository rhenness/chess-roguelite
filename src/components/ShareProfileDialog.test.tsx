import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialPlayerProfile } from '../game/playerProfile';
import { initialRunHistory, type RunHistory } from '../game/runHistory';
import { profileHighScores } from '../game/shareProfile';
import type { EndlessRecord } from '../features/endless/types';
import { ShareProfileDialog } from './ShareProfileDialog';

const exportImage = vi.hoisted(() => vi.fn());
vi.mock('html-to-image', () => ({ toBlob: exportImage }));
const profile = { ...initialPlayerProfile(), displayName: 'Castle Keeper', bannerId: 'celestial' as const };
const history: RunHistory = { version: 1, runs: [
    { id: 'regular', mode: 'regular', finishedAt: 1, score: 8400, floorsCompleted: 8, floorsTotal: 10, checkmates: 1, result: 'defeat' },
    { id: 'daily', mode: 'daily', dailyDay: '2026-10-05', finishedAt: 2, score: 15000, floorsCompleted: 10, floorsTotal: 10, checkmates: 1, result: 'complete' },
] };
const record = (id: string, mode: EndlessRecord['mode'], score: number): EndlessRecord => ({
    id, mode, score, longestStreak: score, moves: 50, gamesCompleted: 1, coins: 10, finishedAt: 1,
});
const highScores = profileHighScores(history, [record('standard', 'standard', 3000), record('hardcore', 'hardcore', 28),
    record('newer-standard', 'standard', 100), record('newer-hardcore', 'hardcore', 12)]);

beforeEach(() => {
    exportImage.mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:profile-image') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.stubGlobal('navigator', { share: undefined, canShare: undefined, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Share profile', () => {
    it('exports the player identity and all four best scores without controls or a style picker, and downloads the PNG', async () => {
        const view = render(<ShareProfileDialog profile={profile} highScores={highScores} />);
        const card = screen.getByRole('region', { name: 'Player card' });
        expect(within(card).getByText('Castle Keeper')).toBeInTheDocument();
        expect(within(card).getByLabelText('Player identity')).toHaveClass('banner-celestial');
        expect(within(card).getByLabelText('8,400 points')).toHaveTextContent('8,400');
        expect(within(card).getByLabelText('15,000 points')).toHaveTextContent('15,000');
        expect(within(card).getByLabelText('3,000 points')).toHaveTextContent('3,000');
        expect(within(card).getByLabelText('28 moves')).toHaveTextContent('28');
        expect(within(card).queryByRole('button')).not.toBeInTheDocument();
        expect(within(card).queryByRole('link')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Next card style' })).not.toBeInTheDocument();
        expect(screen.queryByText(/Swipe through/)).not.toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save image' })).toBeEnabled());
        expect(exportImage).toHaveBeenCalledWith(card, expect.objectContaining({ width: 540, height: 540, pixelRatio: 2 }));
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            expect(this.download).toBe('knightfall-player-profile.png');
            expect(this.href).toBe('blob:profile-image');
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save image' }));
        expect(click).toHaveBeenCalledOnce();
        view.unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:profile-image');
    });

    it('shares the prepared profile PNG through native sharing', async () => {
        const share = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { share, canShare: () => true });
        render(<ShareProfileDialog profile={profile} highScores={highScores} />);
        const button = screen.getByRole('button', { name: 'Share' });
        expect(button).toBeDisabled();
        await waitFor(() => expect(button).toBeEnabled());
        await act(async () => fireEvent.click(button));
        expect(share).toHaveBeenCalledWith({ files: [expect.objectContaining({ name: 'knightfall-player-profile.png', type: 'image/png' })], title: 'Knightfall · Castle Keeper' });
    });

    it('copies profile text and the game URL even when image export fails, with selectable text if clipboard access fails', async () => {
        exportImage.mockRejectedValue(new Error('Image failed'));
        render(<ShareProfileDialog profile={profile} highScores={highScores} />);
        await screen.findByRole('alert');
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy text' })));
        const text = `Knightfall · Castle Keeper\nRegular: 8,400 points\nDungeon: 15,000 points\nEndless: 3,000 points\nHardcore: 28 moves\n${window.location.origin}/`;
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(text);
        expect(screen.getByRole('status')).toHaveTextContent('Profile copied.');
        vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('Denied'));
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy text' })));
        expect(screen.getByRole('textbox', { name: 'Profile text' })).toHaveValue(text);
        expect(screen.getByRole('textbox', { name: 'Profile text' })).toHaveFocus();
    });

    it('distinguishes an unplayed mode from a recorded zero score', async () => {
        const scores = profileHighScores(initialRunHistory(), [record('zero', 'standard', 0)]);
        render(<ShareProfileDialog profile={profile} highScores={scores} />);
        const card = screen.getByRole('region', { name: 'Player card' });
        expect(within(card).getAllByLabelText('No score yet')).toHaveLength(3);
        expect(within(card).getByLabelText('0 points')).toHaveTextContent('0');
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy text' })));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Regular: —\nDungeon: —\nEndless: 0 points\nHardcore: —'));
    });
});
