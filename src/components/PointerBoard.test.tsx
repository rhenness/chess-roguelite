import { StrictMode } from 'react';
import { Chess } from 'chess.js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Chessboard } from 'react-chessboard';
import { BOARD_APPEARANCE } from './boardAppearance';
import { usePointerBoard } from '../game/usePointerBoard';

function PointerBoard({ position, onSquareClick }: { position: string; onSquareClick: (square: string) => void }) {
    const board = usePointerBoard();
    return <div ref={board}>
        <Chessboard options={{ ...BOARD_APPEARANCE, position, showAnimations: false,
            onSquareClick: ({ square }) => onSquareClick(square) }} />
        <button>Choose reward</button>
    </div>;
}

describe('pointer board', () => {
    it('skips installed chessboard pieces in the tab order and preserves clicks and other controls', () => {
        const onSquareClick = vi.fn();
        const { container } = render(<StrictMode><PointerBoard position={new Chess().fen()} onSquareClick={onSquareClick} /></StrictMode>);
        const pieces = container.querySelectorAll<HTMLElement>('[data-square] [tabindex]');
        expect(pieces).toHaveLength(32);
        expect([...pieces].every(piece => piece.tabIndex === -1)).toBe(true);
        expect(screen.getByRole('button', { name: 'Choose reward' }).tabIndex).toBe(0);
        fireEvent.click(container.querySelector('[data-square="e2"] [data-piece]')!);
        expect(onSquareClick).toHaveBeenLastCalledWith('e2');
        fireEvent.click(container.querySelector('[data-square="e4"]')!);
        expect(onSquareClick).toHaveBeenLastCalledWith('e4');
    });

    it('keeps newly mounted pieces out of the tab order after moves and captures', async () => {
        const chess = new Chess();
        const onSquareClick = vi.fn();
        const { container, rerender } = render(<PointerBoard position={chess.fen()} onSquareClick={onSquareClick} />);
        chess.move('e4'); chess.move('d5'); chess.move('exd5');
        rerender(<PointerBoard position={chess.fen()} onSquareClick={onSquareClick} />);
        await waitFor(() => {
            const pieces = container.querySelectorAll<HTMLElement>('[data-square] [tabindex]');
            expect(pieces).toHaveLength(31);
            expect([...pieces].every(piece => piece.tabIndex === -1)).toBe(true);
            expect(container.querySelector('[data-square="d5"] [data-piece]')).toHaveAttribute('data-piece', 'wP');
        });
        fireEvent.click(container.querySelector('[data-square="d5"] [data-piece]')!);
        expect(onSquareClick).toHaveBeenLastCalledWith('d5');
    });
});
