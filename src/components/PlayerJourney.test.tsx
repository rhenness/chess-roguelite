import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialPlayerProfile } from '../game/playerProfile';
import { playerLevelProgress } from '../game/playerLeveling';
import { PlayerJourney } from './PlayerJourney';

afterEach(() => vi.restoreAllMocks());

describe('player journey', () => {
    it('shows all material tiers, the real current tile and chosen avatar, and future XP', () => {
        const profile = { ...initialPlayerProfile(), avatarId: 'rook' as const, avatarBackgroundColor: '#345d85' };
        const view = render(<PlayerJourney progress={playerLevelProgress(1840)} profile={profile} />);
        expect(screen.getAllByRole('group')).toHaveLength(8);
        expect(screen.getByRole('group', { name: 'Silver, levels 9 through 16' })).toBeInTheDocument();
        const current = screen.getByRole('button', { name: 'Level 14, Current level' });
        expect(current).toHaveAttribute('aria-current', 'step');
        expect(current.querySelector('image')).toHaveAttribute('href', '/profile/avatars/rook.svg');
        const future = screen.getByRole('button', { name: 'Level 17, 460 XP to go' });
        fireEvent.keyDown(future, { key: 'Enter' });
        const detail = view.container.querySelector('.journey-detail')!;
        expect(within(detail as HTMLElement).getByText('Gold')).toBeInTheDocument();
        expect(detail).toHaveTextContent('Level 17');
        expect(future).toHaveAttribute('aria-pressed', 'true');
        fireEvent.keyDown(future, { key: 'Escape' });
        expect(view.container.querySelector('.journey-detail')).toBeNull();
    });

    it('allows inspecting reached levels without changing the current progress', () => {
        render(<PlayerJourney progress={playerLevelProgress(2300)} profile={initialPlayerProfile()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Level 1, Reached' }));
        expect(screen.getByText('Reached')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close level details' }));
        expect(screen.queryByText('Reached')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Level 17, Current level' })).toHaveAttribute('aria-current', 'step');
    });

    it('keeps a single current tile and hides controls while the pawn is in view', () => {
        const view = render(<PlayerJourney progress={playerLevelProgress(0)} profile={initialPlayerProfile()} />);
        expect(screen.queryByRole('button', { name: 'Return to current level' })).not.toBeInTheDocument();
        expect(view.container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
        view.rerender(<PlayerJourney progress={playerLevelProgress(30000)} profile={initialPlayerProfile()} />);
        expect(screen.queryByRole('button', { name: 'View future tiers' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Level 64, Current level' })).toHaveAttribute('aria-current', 'step');
    });

    it('shows only the direction back to an offscreen pawn and hides it on return', () => {
        let pawnCenter = 250;
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
            const top = this.classList.contains('journey-pawn') ? pawnCenter - 20 : 100;
            return { top, bottom: this.classList.contains('journey-pawn') ? pawnCenter + 20 : 400,
                height: this.classList.contains('journey-pawn') ? 40 : 300, left: 0, right: 320, width: 320, x: 0, y: top, toJSON: () => ({}) };
        });
        render(<PlayerJourney progress={playerLevelProgress(1840)} profile={initialPlayerProfile()} />);
        const region = screen.getByRole('region', { name: 'Scroll through player levels' });
        const scrollTo = vi.fn(() => { pawnCenter = 250; });
        Object.defineProperty(region, 'scrollTo', { value: scrollTo });
        expect(screen.queryByRole('button', { name: 'Return to current level' })).not.toBeInTheDocument();
        pawnCenter = 600;
        fireEvent.scroll(region);
        let arrow = screen.getByRole('button', { name: 'Return to current level' });
        expect(arrow).toHaveClass('journey-return-down');
        fireEvent.click(arrow);
        expect(scrollTo).toHaveBeenCalledOnce();
        expect(screen.queryByRole('button', { name: 'Return to current level' })).not.toBeInTheDocument();
        pawnCenter = 0;
        fireEvent.scroll(region);
        arrow = screen.getByRole('button', { name: 'Return to current level' });
        expect(arrow).toHaveClass('journey-return-up');
    });
});
