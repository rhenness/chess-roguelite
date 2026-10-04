import { useId, type CSSProperties } from 'react';
import type { ChessboardOptions } from 'react-chessboard';

type PieceKind = 'P' | 'R' | 'N' | 'B' | 'Q' | 'K';
type PieceRenderers = NonNullable<ChessboardOptions['pieces']>;

// Silhouettes adapted from Cburnett's chess SVGs (CC BY-SA 3.0).
// See ATTRIBUTION.md for the source, license, and changes.
function GildedPiece({ kind, dark, svgStyle }: { kind: PieceKind; dark: boolean; svgStyle?: CSSProperties }) {
    const id = useId().replace(/:/g, '');
    const enamel = `court-${id}-enamel`;
    const gold = `court-${id}-gold`;
    const emerald = `court-${id}-emerald`;
    const outline = dark ? '#d7b568' : '#755321';
    const engraving = dark ? '#e7cd88' : '#997039';
    const goldFill = `url(#${gold})`;
    const gemFill = `url(#${emerald})`;
    return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"
        style={svgStyle} aria-hidden="true" data-piece-set="gilded">
        <defs>
            <linearGradient id={enamel} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={dark ? '#4f645b' : '#fff9e9'} />
                <stop offset=".45" stopColor={dark ? '#203e36' : '#f1e4c6'} />
                <stop offset="1" stopColor={dark ? '#091e1a' : '#c7ad7c'} />
            </linearGradient>
            <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fff1bd" /><stop offset=".45" stopColor="#e3bd60" />
                <stop offset="1" stopColor="#966023" />
            </linearGradient>
            <linearGradient id={emerald} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#a0efd0" /><stop offset=".4" stopColor="#349c7b" />
                <stop offset="1" stopColor="#12533f" />
            </linearGradient>
        </defs>
        <g fill={`url(#${enamel})`} stroke={outline} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round">
            {kind === 'P' && <>
                <path d="M22.5 9a4 4 0 0 0-3.22 6.38A6.5 6.5 0 0 0 16 21c0 2.03.94 3.84 2.41 5.03C15.41 27.09 11 31.58 11 39.5h23c0-7.92-4.41-12.41-7.41-13.47A6.48 6.48 0 0 0 29 21a6.5 6.5 0 0 0-3.28-5.62A4 4 0 0 0 22.5 9Z" />
                <path d="M19.3 15.5q3.2 1.6 6.4 0M18.4 26q4.1 1.6 8.2 0" fill="none" stroke={engraving} strokeWidth="1.4" />
                <path d="M17 33q2-3 5.5-4 3.5 1 5.5 4M22.5 29v5" fill="none" stroke={engraving} strokeWidth=".8" />
                <circle cx="22.5" cy="21.5" r="2.1" fill={gemFill} strokeWidth=".7" />
                <path d="M20.5 11q-2 1-1.5 3" fill="none" stroke="#fff9df" strokeWidth=".9" />
            </>}
            {kind === 'R' && <>
                <path d="M11 9h5v3h4V9h5v3h4V9h5v6l-4 4v11l3 4v5H12v-5l3-4V19l-4-4Z" />
                <path d="M11 15h23l-4 4H15Z" fill={goldFill} strokeWidth=".8" />
                <path d="M15 30h15l2.5 4h-20Z" fill={goldFill} strokeWidth=".8" />
                <path d="M18 20v8M27 20v8" fill="none" stroke={engraving} strokeWidth=".8" />
                <path d="M20.2 28v-4.2q0-3.8 2.3-3.8t2.3 3.8V28Z" fill={gemFill} strokeWidth=".8" />
                <path d="M22.5 22v4.5" fill="none" stroke="#a0efd0" strokeWidth=".6" />
                <path d="M13 10v3M21.8 10v2M30.8 10v3" fill="none" stroke="#fff0bc" strokeWidth=".8" />
            </>}
            {kind === 'N' && <>
                <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
                <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.99-.5-2-.5-3.5 1-1 3 2.5 3 2.5h2s.78-1.99 2.5-3c1 0 1 3 1 3" />
                <path d="M25 11q11 5 10.5 22" fill="none" stroke={engraving} strokeWidth="1.8" />
                <path d="m26.7 14 3-1m-.8 4 3-.5m-1.5 4 3.5-.3m-2.4 4 3.2.3m-2.5 3.9 3.3.5" fill="none" stroke={engraving} strokeWidth=".7" />
                <path d="M12 19q4 .5 8 3M8 25l3 1" fill="none" stroke={engraving} strokeWidth=".9" />
                <ellipse cx="15.2" cy="15.4" rx="1" ry="1.3" fill={goldFill} strokeWidth=".5" />
                <path d="m27 25 3 2v4l-3 2-3-2v-4Z" fill={gemFill} strokeWidth=".8" />
                <path d="M27 27v4" fill="none" stroke="#a0efd0" strokeWidth=".6" />
            </>}
            {kind === 'B' && <>
                <circle cx="22.5" cy="8" r="2.4" fill={goldFill} />
                <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2Z" />
                <path d="m24 13-4 6" fill="none" stroke={engraving} strokeWidth="1.5" />
                <path d="M17.5 26q5 1.5 10 0M15 30q7.5 2 15 0" fill="none" stroke={engraving} strokeWidth="1.25" />
                <path d="M18.5 22q-1 2 2 2M26.5 22q1 2-2 2" fill="none" stroke={engraving} strokeWidth=".8" />
                <path d="m22.5 20 2 2.5-2 2.5-2-2.5Z" fill={gemFill} strokeWidth=".7" />
                <path d="M15 32q7.5 4 15 0l3 4H12Z" fill={goldFill} strokeWidth=".8" />
            </>}
            {kind === 'Q' && <>
                <path d="M9 26q15-3 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5Z" />
                <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1 2.5-1 2.5-1.5 1.5 0 2.5 0 2.5q11.5 2 23 0s1.5-1 0-2.5c0 0 .5-1.5-1-2.5-.5-2.5-.5-2  .5-3.5 1-2 2.5-2 2.5-4q-13.5-3-27 0Z" />
                <path d="M10.5 27.5q12-2.8 24 0M12 32q10.5-2 21 0" fill="none" stroke={engraving} strokeWidth="1.3" />
                <path d="M14 34q2-2 4 0m9 0q2-2 4 0" fill="none" stroke={engraving} strokeWidth=".8" />
                {[['6', '12'], ['14', '9'], ['22.5', '8'], ['31', '9'], ['39', '12']].map(([cx, cy], index) =>
                    <circle key={index} cx={cx} cy={cy} r="2" fill={goldFill} strokeWidth=".8" />)}
                <path d="m22.5 25 2.5 3-2.5 3-2.5-3Z" fill={gemFill} strokeWidth=".7" />
                <circle cx="22.5" cy="8" r=".8" fill={gemFill} stroke="none" />
            </>}
            {kind === 'K' && <>
                <path d="M21 4.5h3v3H27v3h-3v5h-3v-5h-3v-3h3Z" fill={goldFill} strokeWidth=".9" />
                <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
                <path d="M12.5 37q10 7 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5Z" />
                <path d="M8.5 21q6.5-6 14 5 7.5-11 14-5M12.5 30q10-6 20 0M12.5 34q10-6 20 0" fill="none" stroke={engraving} strokeWidth="1.1" />
                <path d="M16 32q2.5-2.5 4 0m5 0q1.5-2.5 4 0" fill="none" stroke={engraving} strokeWidth=".8" />
                <path d="m22.5 25 3 3.5-3 3.5-3-3.5Z" fill={gemFill} strokeWidth=".8" />
                <circle cx="22.5" cy="9" r=".9" fill={gemFill} stroke="none" />
            </>}
            <path d={kind === 'P' ? 'M12 36.5q10.5-2 21 0l1 3H11Z' : 'M10 36.5q12.5-2 25 0l1 3H9Z'}
                fill={goldFill} strokeWidth="1" />
            <path d={kind === 'P' ? 'M14 37.5h17' : 'M12 37.5h21'} fill="none" stroke="#fff0bc" strokeWidth=".7" />
        </g>
    </svg>;
}

export const gildedPieces: PieceRenderers = Object.fromEntries(
    (['w', 'b'] as const).flatMap(color => (['P', 'R', 'N', 'B', 'Q', 'K'] as const).map(kind => [
        `${color}${kind}`, (props?: { svgStyle?: CSSProperties }) =>
            <GildedPiece kind={kind} dark={color === 'b'} svgStyle={props?.svgStyle} />,
    ])),
);
