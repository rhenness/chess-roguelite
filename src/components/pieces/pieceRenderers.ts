import { defaultPieces, type ChessboardOptions } from 'react-chessboard';
import type { PieceSetId } from '../../game/pieceSets';
import { obsidianPieces } from './ObsidianPieces';
import { gildedPieces } from './GildedPieces';

export const PIECE_RENDERERS: Record<PieceSetId, NonNullable<ChessboardOptions['pieces']>> = {
    default: defaultPieces,
    obsidian: obsidianPieces,
    gilded: gildedPieces,
};
