import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialPlayerProfile } from '../game/playerProfile';
import type { ShareRunData } from '../game/shareRun';
import { ShareRunDialog } from './ShareRunDialog';

const exportImage = vi.hoisted(() => vi.fn());
vi.mock('html-to-image', () => ({ toBlob: exportImage }));
const profile = { ...initialPlayerProfile(), displayName: 'Castle Keeper', bannerId: 'celestial' as const };
const result: ShareRunData = { id: 'result-1', mode: 'regular', modeLabel: 'Regular run', date: 'Oct 4, 2026',
    outcome: 'Run over', score: 8400, scoreLabel: 'Final score', decisionCounts: { best: 13, good: 10, inaccuracy: 0, bad: 1 }, stats: [
        { label: 'Floors completed', value: '8 / 10', icon: 'floors' },
        { label: 'Decisions', value: '24', icon: 'moves' },
        { label: 'Coins earned', value: '+120', icon: 'coins' },
    ] };

beforeEach(() => {
    exportImage.mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:run-image') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Share run preview', () => {
    it('exports only the square card at 1080px, keeps the player styling, and downloads the PNG', async () => {
        const view = render(<ShareRunDialog result={result} profile={profile} />);
        expect(screen.getByRole('button', { name: 'Save image' })).toBeDisabled();
        const card = within(screen.getByRole('article'));
        expect(card.getByText('Castle Keeper')).toBeInTheDocument();
        expect(card.getByLabelText('Player identity')).toHaveClass('banner-celestial');
        expect(within(card.getByLabelText('Decision counts')).getByText('B').nextElementSibling?.textContent).toBe('10');
        expect(within(card.getByLabelText('Decision counts')).getByText('F').nextElementSibling?.textContent).toBe('1');
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save image' })).toBeEnabled());
        expect(exportImage).toHaveBeenCalledWith(screen.getByRole('article'), expect.objectContaining({ width: 540, height: 540, pixelRatio: 2 }));
        expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            expect(this.download).toBe('knightfall-regular-result-1-profile.png');
            expect(this.href).toBe('blob:run-image');
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save image' }));
        expect(click).toHaveBeenCalledOnce();
        view.unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:run-image');
    });

    it('shares a prepared PNG from the click and treats cancel as a normal action', async () => {
        const share = vi.fn().mockRejectedValue(new DOMException('Canceled', 'AbortError'));
        Object.defineProperty(navigator, 'share', { configurable: true, value: share });
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });
        render(<ShareRunDialog result={result} profile={profile} />);
        const button = await screen.findByRole('button', { name: 'Share' });
        await waitFor(() => expect(button).toBeEnabled());
        await act(async () => fireEvent.click(button));
        expect(share).toHaveBeenCalledWith({ files: [expect.any(File)], title: 'Knightfall · Regular run' });
        expect(button).toBeEnabled();
        expect(screen.queryByText(/Sharing is unavailable/)).not.toBeInTheDocument();
    });

    it('offers download when native sharing fails and selectable text when clipboard access fails', async () => {
        Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockRejectedValue(new Error('Denied')) });
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
        render(<ShareRunDialog result={result} profile={profile} />);
        const shareButton = await screen.findByRole('button', { name: 'Share' });
        await waitFor(() => expect(shareButton).toBeEnabled());
        await act(async () => fireEvent.click(shareButton));
        expect(screen.getByText(/Use Save image instead/)).toBeInTheDocument();
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy text' })));
        expect((screen.getByRole('textbox', { name: 'Run result text' }) as HTMLTextAreaElement).value).toContain('8,400 points');
        expect(screen.getByRole('textbox', { name: 'Run result text' })).toHaveFocus();
    });

    it('keeps text sharing available if image export fails and can retry', async () => {
        exportImage.mockRejectedValueOnce(new Error('Image failed'));
        render(<ShareRunDialog result={result} profile={profile} />);
        await screen.findByRole('alert');
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy text' })));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Castle Keeper · Run over'));
        expect(screen.getByText('Result copied.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save image' })).toBeEnabled());
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('lets the player browse styles with buttons and keys, exports the chosen style, and reuses prepared images', async () => {
        const view = render(<ShareRunDialog result={result} profile={profile} />);
        const save = screen.getByRole('button', { name: 'Save image' });
        await waitFor(() => expect(save).toBeEnabled());
        expect(screen.getByRole('button', { name: 'Previous card style' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Next card style' }));
        expect(screen.getByRole('article')).toHaveClass('run-share-style-spotlight');
        await waitFor(() => expect(save).toBeEnabled());
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            expect(this.download).toBe('knightfall-regular-result-1-spotlight.png');
        });
        fireEvent.click(save);
        expect(click).toHaveBeenCalledOnce();
        const carousel = screen.getByRole('region', { name: 'Run card styles' });
        fireEvent.keyDown(carousel, { key: 'End' });
        expect(screen.getByRole('article')).toHaveClass('run-share-style-decisions');
        expect(screen.getByRole('button', { name: 'Next card style' })).toBeDisabled();
        await waitFor(() => expect(save).toBeEnabled());
        expect(exportImage).toHaveBeenCalledTimes(3);
        fireEvent.click(screen.getByRole('button', { name: 'Use Player card style' }));
        expect(save).toBeEnabled();
        expect(exportImage).toHaveBeenCalledTimes(3);
        expect(screen.getByRole('button', { name: 'Use Player card style' })).toHaveAttribute('aria-pressed', 'true');
        view.unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
    });

    it('selects the card scrolled into view', async () => {
        render(<ShareRunDialog result={result} profile={profile} />);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save image' })).toBeEnabled());
        screen.getAllByRole('group', { hidden: true }).filter(element => element.classList.contains('share-run-slide'))
            .forEach((slide, index) => Object.defineProperty(slide, 'offsetLeft', { configurable: true, value: index * 552 }));
        const carousel = screen.getByRole('region', { name: 'Run card styles' });
        fireEvent.scroll(carousel, { target: { scrollLeft: 1104 } });
        expect(screen.getByRole('article')).toHaveClass('run-share-style-decisions');
        expect(screen.getByRole('button', { name: 'Use Decision breakdown style' })).toHaveAttribute('aria-pressed', 'true');
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save image' })).toBeEnabled());
    });

    it('discards an export that finishes after the player changes styles', async () => {
        let finishFirst!: (blob: Blob) => void;
        exportImage.mockImplementationOnce(() => new Promise<Blob>(resolve => { finishFirst = resolve; }));
        render(<ShareRunDialog result={result} profile={profile} />);
        await waitFor(() => expect(exportImage).toHaveBeenCalledOnce());
        fireEvent.click(screen.getByRole('button', { name: 'Next card style' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save image' })).toBeEnabled());
        await act(async () => finishFirst(new Blob(['old image'], { type: 'image/png' })));
        expect(URL.createObjectURL).toHaveBeenCalledOnce();
        expect(screen.getByRole('article')).toHaveClass('run-share-style-spotlight');
        expect(screen.getByRole('button', { name: 'Save image' })).toBeEnabled();
    });

    it('keeps the same share controls while a new card is generating, without a loading message', async () => {
        const share = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'share', { configurable: true, value: share });
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
        let finishImage!: (blob: Blob) => void;
        exportImage.mockImplementationOnce(() => new Promise<Blob>(resolve => { finishImage = resolve; }));
        render(<ShareRunDialog result={result} profile={profile} />);
        const shareButton = screen.getByRole('button', { name: 'Share' });
        const saveButton = screen.getByRole('button', { name: 'Save image' });
        expect(shareButton).toBeDisabled();
        expect(saveButton).toBeDisabled();
        expect(saveButton).toHaveClass('text-button');
        expect(screen.queryByText(/Preparing your image/)).not.toBeInTheDocument();
        await waitFor(() => expect(exportImage).toHaveBeenCalledOnce());
        await act(async () => finishImage(new Blob(['profile'], { type: 'image/png' })));
        expect(shareButton).toBeEnabled();

        exportImage.mockImplementationOnce(() => new Promise<Blob>(resolve => { finishImage = resolve; }));
        fireEvent.click(screen.getByRole('button', { name: 'Next card style' }));
        expect(screen.getByRole('button', { name: 'Share' })).toBe(shareButton);
        expect(screen.getByRole('button', { name: 'Save image' })).toBe(saveButton);
        expect(shareButton).toBeDisabled();
        expect(saveButton).toBeDisabled();
        expect(saveButton).toHaveClass('text-button');
        expect(screen.getByRole('button', { name: 'Copy text' })).toBeEnabled();
        expect(screen.queryByText(/Preparing your image/)).not.toBeInTheDocument();
        fireEvent.click(shareButton);
        expect(share).not.toHaveBeenCalled();
        await waitFor(() => expect(exportImage).toHaveBeenCalledTimes(2));
        await act(async () => finishImage(new Blob(['spotlight'], { type: 'image/png' })));
        expect(shareButton).toBeEnabled();
        expect(saveButton).toBeEnabled();
    });
});

