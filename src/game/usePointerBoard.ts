import { useCallback } from 'react';

/** Move choices handle keyboard input; board pieces remain available to the pointer. */
export function usePointerBoard() {
    return useCallback((board: HTMLDivElement | null) => {
        if (!board) return;
        const skipPieces = () => {
            board.querySelectorAll<HTMLElement>('[data-square] [tabindex]').forEach(piece => {
                if (piece.tabIndex !== -1) piece.tabIndex = -1;
            });
        };
        skipPieces();
        // The chessboard adds new focusable pieces when positions and animations change.
        const observer = new MutationObserver(skipPieces);
        observer.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['tabindex'] });
        return () => observer.disconnect();
    }, []);
}
