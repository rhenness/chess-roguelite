import { useId, type CSSProperties } from 'react';
import type { ChessboardOptions } from 'react-chessboard';

type PieceKind = 'P' | 'R' | 'N' | 'B' | 'Q' | 'K';
type PieceRenderers = NonNullable<ChessboardOptions['pieces']>;

// Silhouettes adapted from Cburnett's chess SVGs (CC BY-SA 3.0).
// See ATTRIBUTION.md in this directory for source, license, and changes.
function ObsidianPiece({ kind, dark, svgStyle }: { kind: PieceKind; dark: boolean; svgStyle?: CSSProperties }) {
    const id = useId().replace(/:/g, '');
    const stone = `obsidian-${id}-stone`;
    const ruby = `obsidian-${id}-ruby`;
    const outline = dark ? '#0e1119' : '#414956';
    const edge = dark ? '#9aa2b3' : '#f9fafb';
    const seam = dark ? '#8993a8' : '#606b7b';
    return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"
        style={svgStyle} aria-hidden="true" data-piece-set="obsidian">
        <defs>
            <linearGradient id={stone} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={dark ? '#626b80' : '#f3f4f7'} />
                <stop offset="0.42" stopColor={dark ? '#303747' : '#d8dce4'} />
                <stop offset="1" stopColor={dark ? '#11151f' : '#939cab'} />
            </linearGradient>
            <linearGradient id={ruby} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ff9c98" /><stop offset="0.4" stopColor="#d44656" />
                <stop offset="1" stopColor="#7e1537" />
            </linearGradient>
        </defs>
        <g fill={`url(#${stone})`} stroke={outline} strokeWidth="1.3" strokeLinejoin="miter" strokeLinecap="round">
            {kind === 'P' && <>
                <path d="M22.5 8 27 12.5 25 17 29 21 26 26 31 32 34 39H11l3-7 5-6-3-5 4-4-2-4.5Z" />
                <path d="m22.5 8-2 9 2.5 5-4 4-5 6 8.5-3Z" fill={edge} opacity=".35" stroke="none" />
                <path d="M14 34h17M19 26h7" fill="none" stroke={seam} strokeWidth=".9" />
                <path d="m22.5 17 2.5 4-2.5 4-2.5-4Z" fill={`url(#${ruby})`} strokeWidth=".7" />
            </>}
            {kind === 'R' && <>
                <path d="M11 9h5v4h4V9h5v4h4V9h5v7l-4 4v10l3 4v2h3v4H9v-4h3v-2l3-4V20l-4-4Z" />
                <path d="M11 9h5v4h4V9h2v7l-4 4v10l-4 4H12l3-4V20l-4-4Z" fill={edge} opacity=".28" stroke="none" />
                <path d="M11 16h23M15 20h15M15 30h15M12 36h21" fill="none" stroke={seam} strokeWidth=".9" />
                <path d="m22.5 21 3 4-3 4-3-4Z" fill={`url(#${ruby})`} strokeWidth=".7" />
            </>}
            {kind === 'N' && <>
                <path d="m22 9 8 4 6 9 2 17H15l2-8 7-5-1-7Z" />
                <path d="m22 9 5 9-3 8-7 5-2 8h6l7-9 2-8-3-9Z" fill={edge} opacity=".27" stroke="none" />
                <path d="m22 9-1-3-4 4h-2l-2-3-1 6-6 11v5l4 2 4-3 10-8-1-5Z" />
                <path d="m12 13-6 11 6-4 5-7-2-3Z" fill={edge} opacity=".4" stroke="none" />
                <path d="m26 15 4 7 2 11M17 36h20M8 25l3 1" fill="none" stroke={seam} strokeWidth=".9" />
                <path d="m16 14 2 1-2 2-2-1Z" fill={`url(#${ruby})`} strokeWidth=".6" />
                <path d="m27 23 3 5-3 4-2-4Z" fill={`url(#${ruby})`} strokeWidth=".7" />
            </>}
            {kind === 'B' && <>
                <path d="m22.5 6 3 3-3 3-3-3Z" />
                <path d="m22.5 11 8 9-1 5-4 3 4 5 1 3 6 1 3 3H6l3-3 6-1 1-3 4-5-4-3-1-5Z" />
                <path d="m22.5 11-4 9 2 6-4 7-1 3-6 1-3 3h6l10.5-5-1-9 4-7Z" fill={edge} opacity=".32" stroke="none" />
                <path d="m24 13-4 7M18 27h9M16 33h13M15 36h15" fill="none" stroke={seam} strokeWidth="1" />
                <path d="m22.5 20 2.5 4-2.5 3-2.5-3Z" fill={`url(#${ruby})`} strokeWidth=".7" />
            </>}
            {kind === 'Q' && <>
                <path d="m7 12 8 10-1-13 6 12 2.5-14L25 21l6-12-1 13 8-10-3 15-3 5 2 4 1 3H10l1-3 2-4-3-5Z" />
                <path d="m7 12 8 10-1-13 6 12 2.5-14v20l-7 5-2 7h-3l1-3 2-4-3-5Z" fill={edge} opacity=".3" stroke="none" />
                <path d="M10 27h25M13 32h19M11 36h23" fill="none" stroke={seam} strokeWidth=".9" />
                <path d="m22.5 22 3 4-3 4-3-4Z" fill={`url(#${ruby})`} strokeWidth=".7" />
                <path d="m7 9 2 3-2 3-2-3Zm7-3 2 3-2 3-2-3Zm8.5-2 2 3-2 3-2-3ZM31 6l2 3-2 3-2-3Zm7 3 2 3-2 3-2-3Z"
                    fill={`url(#${ruby})`} strokeWidth=".7" />
            </>}
            {kind === 'K' && <>
                <path d="M21 5h3v3h3v3h-3v6h-3v-6h-3V8h3Z" />
                <path d="m22.5 13 4 4-4 8-4-8Z" />
                <path d="m22.5 24 7-8 7 1 3 6-7 8 1 8H12l1-8-7-8 3-6 7-1Z" />
                <path d="m9 17-3 6 7 8-1 8h6l1-10 3.5-5-6.5-8Z" fill={edge} opacity=".32" stroke="none" />
                <path d="m9 21 7-1 6.5 6 6.5-6 7 1M13 31h19M12.5 35h20" fill="none" stroke={seam} strokeWidth=".9" />
                <path d="m22.5 23 3.5 4.5-3.5 4.5-3.5-4.5Z" fill={`url(#${ruby})`} strokeWidth=".7" />
            </>}
        </g>
    </svg>;
}

export const obsidianPieces: PieceRenderers = Object.fromEntries(
    (['w', 'b'] as const).flatMap(color => (['P', 'R', 'N', 'B', 'Q', 'K'] as const).map(kind => [
        `${color}${kind}`, (props?: { svgStyle?: CSSProperties }) =>
            <ObsidianPiece kind={kind} dark={color === 'b'} svgStyle={props?.svgStyle} />,
    ])),
);
