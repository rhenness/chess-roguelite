import type { ChessboardOptions } from 'react-chessboard';

export const BOARD_APPEARANCE: Pick<ChessboardOptions, 'allowDragging' | 'allowDrawingArrows' | 'showNotation'
    | 'animationDurationInMs' | 'darkSquareStyle' | 'lightSquareStyle' | 'boardStyle'> = {
    allowDragging: false,
    allowDrawingArrows: false,
    showNotation: true,
    animationDurationInMs: 220,
    darkSquareStyle: { backgroundColor: '#41665b' },
    lightSquareStyle: { backgroundColor: '#e9e3d4' },
    boardStyle: { borderRadius: '6px', boxShadow: '0 22px 55px rgba(4, 12, 10, .28)' },
};
