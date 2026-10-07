import { memo, useId } from 'react';
import type { ChessboardOptions } from 'react-chessboard';
import { SKILL_TIER_LABELS, type SkillTier } from '../config/difficulty';
import { foliage } from './playerJourneyArt';
import { terrainIsland as island, stoneRuin, stoneStairs, woodlandTorch } from './runTerrainArt';
import { DAILY_NEAR_SCENERY, DAILY_MIDDLE_SCENERY, DAILY_DISTANT_SCENERY } from './dailyDungeonArt';
import './RunEnvironment.css';

export const TERRAIN_BOARD_APPEARANCE = {
    darkSquareStyle: { backgroundColor: 'var(--terrain-board-dark, #41665b)' },
    lightSquareStyle: { backgroundColor: 'var(--terrain-board-light, #d7d9b2)' },
    boardStyle: { borderRadius: '12px', boxShadow: '0 0 0 1px var(--terrain-rim-shadow, #9cae86), 0 2px 8px #203e3022' },
} satisfies Pick<ChessboardOptions, 'darkSquareStyle' | 'lightSquareStyle' | 'boardStyle'>;

const SCENERY = island(154, 142, 1.28, false, true, 'point', 'near',
        foliage(24, -33, .72) + stoneRuin(54, 4, .55, 'fallen') + foliage(-46, -17, .62))
    + island(892, 224, 1.22, true, false, 'shelf', 'near',
        foliage(27, -27, .8) + stoneRuin(-5, 0, .72, 'tower'))
    + island(164, 407, .43, false, false, 'ridge') + island(42, 502, .87, false, false, 'crag')
    + island(847, 508, .48, false, false, 'crag')
    + island(968, 617, .91, false, false, 'point', 'near', stoneRuin(14, 1, .74, 'wall'))
    + island(154, 844, 1.3, false, false, 'shelf', 'near',
        stoneRuin(9, -5, .5, 'fallen') + woodlandTorch(35, 10, .88) + stoneStairs(-29, 35, .86))
    + island(876, 886, 1.1, true, false, 'crag', 'near',
        foliage(-54, -8, .64) + stoneRuin(38, 9, .43, 'fallen'))
    + island(338, 1063, .58, false, false, 'ridge') + island(44, 969, .38) + island(969, 1027, .36, false, false, 'shelf')
    + [[266, 99], [752, 74], [60, 310], [940, 338], [281, 827], [695, 910], [400, 1070], [739, 550], [180, 651]].map(([x, y], index) =>
        `<path class="run-mote" d="M${x! - 3} ${y}h6M${x} ${y! - 3}v6" stroke="#d6cb8e" stroke-width="1.2" style="animation-duration:${9 + index * .6}s;animation-delay:${-index * 1.7}s"/>`).join('')
    + [[100, 305], [775, 610]].map(([x, y], index) => `<g transform="translate(${x} ${y})"><g class="run-shooting-star" style="animation-duration:${28 + index * 9}s;animation-delay:${-index * 13}s"><path d="M-25-12 0 0" stroke="url(#run-star-trail)" stroke-width="1.4"/><circle r="1.4" fill="#e8edce"/></g></g>`).join('');

// Uneven clusters retain the shared scene scale and become simpler with distance.
const MIDDLE_SCENERY = island(1102, 118, .54, false, false, 'crag', 'middle')
    + island(-60, 261, .59, false, false, 'shelf', 'middle')
    + island(-193, 403, .31, false, false, 'point', 'middle')
    + island(1105, 452, .57, false, false, 'shelf', 'middle')
    + island(-117, 672, .57, false, false, 'ridge', 'middle')
    + island(1160, 800, .51, false, false, 'point', 'middle')
    + island(-44, 943, .62, false, false, 'crag', 'middle');
const DISTANT_SCENERY = island(-269, 147, .32, false, false, 'point', 'distant')
    + island(1314, 308, .33, false, false, 'shelf', 'distant')
    + island(-319, 520, .36, false, false, 'shelf', 'distant')
    + island(-372, 631, .23, false, false, 'crag', 'distant')
    + island(1366, 653, .27, false, false, 'crag', 'distant')
    + island(-257, 892, .31, false, false, 'ridge', 'distant')
    + island(1287, 1013, .35, false, false, 'point', 'distant');

export const RunScenery = memo(function RunScenery({ dungeon = false }: { dungeon?: boolean }) {
    return <div className="run-scenery" aria-hidden="true">
        <svg className="run-scene-background run-scene-distant" viewBox="-500 0 2000 1120" fill="none" dangerouslySetInnerHTML={{ __html: dungeon ? DAILY_DISTANT_SCENERY : DISTANT_SCENERY }} />
        <svg className="run-scene-background run-scene-middle" viewBox="-500 0 2000 1120" fill="none" dangerouslySetInnerHTML={{ __html: dungeon ? DAILY_MIDDLE_SCENERY : MIDDLE_SCENERY }} />
        <svg className="run-scene-near" viewBox="0 0 1000 1120" fill="none">
            <defs>
                <linearGradient id="run-star-trail" x1="-25" y1="-12" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#d7e1b8" stopOpacity="0" /><stop offset="1" stopColor="#e8edce" stopOpacity=".7" /></linearGradient>
                <radialGradient id="run-woodland-glow"><stop stopColor="#efb96b" stopOpacity=".32" /><stop offset="1" stopColor="#efb96b" stopOpacity="0" /></radialGradient>
                <radialGradient id="dungeon-crystal-glow"><stop stopColor="#bd86ee" stopOpacity=".3" /><stop offset="1" stopColor="#bd86ee" stopOpacity="0" /></radialGradient>
                <linearGradient id="dungeon-portal" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#9671bc" stopOpacity=".35" /><stop offset=".65" stopColor="#694587" stopOpacity=".08" /><stop offset="1" stopColor="#ba86e8" stopOpacity=".4" /></linearGradient>
            </defs>
            <g dangerouslySetInnerHTML={{ __html: dungeon ? DAILY_NEAR_SCENERY : SCENERY }} />
        </svg>
    </div>;
});

function Torch({ x }: { x: number }) {
    return <g transform={`translate(${x} 103)`}>
        <path d="M-23 0 0 13V-68L-23-80Z" fill="var(--terrain-stone-light, #729080)" />
        <path d="M0 13 23 0V-80L0-68Z" fill="var(--terrain-stone-dark, #466c5d)" />
        <path d="M-28-83 0-99 28-83 0-67Z" fill="var(--terrain-stone-cap, #cad0a9)" />
        <path d="M-28-83 0-67V-58L-28-74Z" fill="var(--terrain-cap-light, #8fa58a)" />
        <path d="M0-67 28-83V-74L0-58Z" fill="var(--terrain-cap-dark, #618473)" />
        <path d="M-28 0 0 16 28 0V9L0 25-28 9Z" fill="var(--terrain-mortar, #375a4c)" />
        <path d="M-13-38 0-31M8-22 18-28" stroke="var(--terrain-stone-edge, #c7d0a2)" strokeOpacity=".2" strokeWidth="2" />
        <ellipse className="run-torch-glow" cy="-108" rx="42" ry="45" fill="url(#run-torch-glow)" style={{ animationDelay: `${-x / 100}s` }} />
        <path d="M-7-99V-112H7V-99L0-95Z" fill="var(--terrain-torch-metal, #84613e)" />
        <g className="run-flame" style={{ animationDelay: `${-x / 200}s` }}>
            <path d="M0-149C7-132 15-130 12-120 8-108-10-110-12-120-15-132-4-132 0-149Z" fill="var(--terrain-flame, #eeb55d)" />
            <path d="M0-136C4-128 7-125 6-120 3-113-5-114-6-120-7-126-2-129 0-136Z" fill="var(--terrain-flame-core, #fff0b3)" />
        </g>
    </g>;
}

export function RunGate({ floor, skillTier, heading, subtitle, dungeon = false }: { floor?: number; skillTier?: SkillTier; heading?: string; subtitle?: string; dungeon?: boolean }) {
    const title = useId();
    return <div className="run-gate">
        <svg viewBox="0 -60 520 196" aria-hidden="true">
            <defs><radialGradient id="run-torch-glow"><stop stopColor="var(--terrain-glow, #f0bc69)" stopOpacity=".27" /><stop offset="1" stopColor="var(--terrain-glow, #f0bc69)" stopOpacity="0" /></radialGradient></defs>
            {dungeon ? <g>
                <path d="M150 97V30Q150-4 260-55 370-4 370 30V97H349V32Q349 8 260-33 171 8 171 32V97Z" fill="var(--terrain-stone-dark)" stroke="var(--terrain-border)" strokeWidth="2" />
                <path d="M150 30Q150-4 260-55L274-63Q164-12 164 22Z" fill="var(--terrain-stone-cap)" />
                <path d="M370 97 384 89V22Q384-12 274-63L260-55Q370-4 370 30Z" fill="var(--terrain-rock-dark)" />
                <path d="M160 2 180 11M187-21 202-4M221-39 230-20M291-39 282-20M333-21 318-4M360 2 340 11" stroke="var(--terrain-mortar)" strokeWidth="3" />
                <path d="M258-52 260-47 263-51M165 27 168 20 174 23M348 26 354 22 359 27" stroke="var(--terrain-stone-edge)" strokeOpacity=".45" strokeWidth="2" fill="none" />
            </g> : <g>
                <path d="M63 101 161 5 224-17H296L359 5 457 101" fill="var(--terrain-gate, #193a31)" stroke="var(--terrain-border, #365d4b)" strokeWidth="14" />
                <path d="M153 18 174 5 194 16 175 29Z M181-1 202-14 222-3 203 10Z M302-3 323-14 343-1 322 10Z M330 16 351 5 372 18 350 30Z" fill="var(--terrain-cap-light, #8ba080)" />
                <path d="M224-17V-44L246-56 268-44V-14 M267-15V-35L287-47 308-35V-9" fill="var(--terrain-stone-light, #658573)" stroke="var(--terrain-stone-edge, #aebd97)" strokeWidth="2" />
            </g>}
            <path d="M152 119 130 97V51L152 29H368L390 51V97L368 119Z" fill="var(--terrain-plaque, #17382f)" stroke="var(--terrain-border, #587462)" strokeWidth="3" />
            <path d="M152 113 136 95V53L154 35H366L384 53V95L366 113Z" stroke="var(--terrain-stone-edge, #b4c299)" strokeOpacity=".22" strokeWidth="1" fill="none" />
            <Torch x={87} /><Torch x={433} />
        </svg>
        <div className="run-gate-copy" aria-labelledby={title}>
            <h1 id={title}>{heading ?? `Floor ${floor}`}</h1>
            <span className="run-gate-skill" aria-label={skillTier ? `${SKILL_TIER_LABELS[skillTier]} skill level` : undefined}>
                {skillTier && <svg viewBox="0 0 23 21" aria-hidden="true"><path d="M2 18V12M10 18V7M18 18V2" stroke="currentColor" strokeWidth="5" opacity=".95" /></svg>}
                {subtitle ?? (skillTier ? SKILL_TIER_LABELS[skillTier] : '')}
            </span>
        </div>
    </div>;
}

function BoardPillarShaft({ x, y }: { x: number; y: number }) {
    return <g transform={`translate(${x} ${y})`}>
        <path d="M-20 4 0 16V44L-20 32Z" fill="var(--terrain-stone-light, #769486)" />
        <path d="M0 16 20 4V32L0 44Z" fill="var(--terrain-stone-dark, #537b6c)" />
        <path d="M-20 32 0 44-2 61-18 50Z" fill="var(--terrain-stone-light, #648879)" />
        <path d="M0 44 20 32 18 50-2 61Z" fill="var(--terrain-stone-dark, #426a5d)" />
        <path d="M-18 50-2 61V78L-18 68-20 56Z" fill="var(--terrain-rock-light, #567b6e)" />
        <path d="M-2 61 18 50 16 67-2 78Z" fill="var(--terrain-rock-dark, #345a50)" />
        <path d="M-20 4-13 8-12 36-20 32Z" fill="var(--terrain-stone-edge, #90a58d)" opacity=".35" />
        <path d="M-19 31 0 43 19 32" fill="none" stroke="var(--terrain-mortar, #284d42)" strokeOpacity=".25" />
        <path d="M-7 24-3 27V35" fill="none" stroke="var(--terrain-stone-edge, #bdc6a0)" strokeOpacity=".25" />
    </g>;
}

function BoardPillarCap({ x, y }: { x: number; y: number }) {
    return <g transform={`translate(${x} ${y})`}>
        <path d="M-22 8 0 21 22 8 19 13 0 25-20 13Z" fill="var(--terrain-rock-shade, #173f32)" opacity=".35" />
        <path d="M-25-3 0 12V21L-24 7Z" fill="var(--terrain-cap-light, #a3b394)" />
        <path d="M0 12 25-3 24 7 0 21Z" fill="var(--terrain-cap-dark, #809b82)" />
        <path d="M-25-3 0-19 25-3 0 12Z" fill="var(--terrain-board-light, #d7d9b2)" stroke="var(--terrain-stone-edge, #e8e5c5)" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M-9-3 0-9 9-3 0 3Z" fill="var(--terrain-cap-inset, #b0bc97)" />
        <path d="M-9-3 0-9 9-3" fill="none" stroke="var(--terrain-stone-cap, #c1c9a4)" strokeWidth="1.5" />
        <path d="M0 13V20" stroke="var(--terrain-stone-edge, #d0d5ad)" strokeWidth="1.5" />
    </g>;
}

function BoardMoss({ x, y, rotation = 0, scale = 1 }: { x: number; y: number; rotation?: number; scale?: number }) {
    return <g transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}>
        <path d="M-25-5-17-10-8-7-4-12 5-9 10-4 18-8 26-3 23 3 28 8 18 12 14 21 5 23 0 15-6 16-10 9-19 10-16 4-24 1Z" fill="var(--terrain-rock-shade, #153f2e)" opacity=".3" />
        <path d="M-26-7-18-12-10-9-6-14 3-11 8-6 16-10 24-5 20 1 26 6 16 10 12 18 4 20-1 12-8 13-12 6-21 7-18 1-25-2Z" fill="var(--terrain-lichen, #567c50)" />
        <path d="M-23-6-15-11-9-7-13-1-21 2Z M-7-10 1-13 7-6 2-1-6-3Z M8-3 17-8 23-4 17 3 9 4Z" fill="var(--terrain-lichen-light, #8faa6b)" />
        <path d="M-12 3-5-1 2 3-2 10-8 11Z M7 5 15 1 22 5 15 10 9 11Z M5 13 12 10 10 17 4 18Z" fill="var(--terrain-lichen, #72955d)" />
        <path d="M-16-5-11-7M-3-7 1-8M13-3 17-5" fill="none" stroke="var(--terrain-lichen-edge, #b0c48a)" strokeWidth="2" strokeLinecap="round" />
        <path d="M-3 13 1 11 4 14 0 17Z M19 12 23 10 25 13 21 15Z" fill="var(--terrain-lichen-light, #9cb77a)" />
    </g>;
}

export const RunBoardFrame = memo(function RunBoardFrame() {
    return <><svg className="run-board-frame" viewBox="0 0 560 560" aria-hidden="true">
        {/* The rear shafts sit behind the deck, while their caps project above the rim. */}
        <BoardPillarShaft x={20} y={16} /><BoardPillarShaft x={540} y={16} />
        <path d="M15 22H545V544L526 570H34L15 544Z" fill="var(--terrain-rock-light, #355c4e)" />
        <path d="M15 544H545L526 570H34Z" fill="var(--terrain-rock-dark, #24483d)" />
        <rect x="16" y="16" width="528" height="528" rx="4" fill="var(--terrain-rim, #c5cba6)" stroke="var(--terrain-stone-edge, #e0dfb8)" strokeWidth="3" />
        <rect x="25" y="25" width="510" height="510" rx="18" fill="var(--terrain-rim, #c5cba6)" stroke="var(--terrain-rim-shadow, #8ea17e)" strokeWidth="2" />
        <path d="M115 17V25M222 17V25M337 17V25M446 17V25M115 535V544M222 535V544M337 535V544M446 535V544M16 119H25M16 226H25M16 339H25M16 446H25M535 119H544M535 226H544M535 339H544M535 446H544" stroke="var(--terrain-rim-shadow, #8da381)" strokeWidth="2" />
        <path d="M222 15 218 20 224 25M442 536 448 540 445 546M15 337 20 332 25 335" fill="none" stroke="var(--terrain-mortar, #55735b)" strokeWidth="2" />
        <path d="M38 7 44 4 51 9 43 13Z M499 550 506 546 512 550 505 555Z M5 195 11 190 17 194 10 200Z" fill="var(--terrain-lichen, #89a365)" />
        <BoardPillarCap x={20} y={16} /><BoardPillarCap x={540} y={16} />
        <BoardPillarShaft x={20} y={543} /><BoardPillarShaft x={540} y={543} />
        <BoardPillarCap x={20} y={543} /><BoardPillarCap x={540} y={543} />
        <path d="M26 33 32 29 37 31 35 37 28 39Z M527 520 534 516 539 520 535 526 530 529Z" fill="var(--terrain-rock-shade, #082b20)" opacity=".22" />
        <path d="M23 29 30 25 35 28 31 34 25 35Z M528 519 535 515 540 518 534 524Z" fill="var(--terrain-lichen, #7e9c65)" />
        <g transform="translate(55 -5)">
            <path d="M121 529 125 524 130 524 134 530 132 538 138 542 127 548 122 543Z" fill="#062a2180" />
            <path d="M122 535 125 529 131 529 130 536 136 539 127 542 120 539Z" fill="var(--terrain-lichen-light, #8eaa70)" />
            <path d="M380 536 384 527 389 532 386 539 390 544" fill="none" stroke="var(--terrain-lichen, #587453)" strokeWidth="3" strokeLinecap="round" />
            <path d="M384 530 391 526 395 529 389 534Z" fill="var(--terrain-lichen-light, #9bb27c)" />
        </g>
        <path d="M25 525 35 522 39 526 33 531Z M520 534 528 530 534 534 528 538Z" fill="var(--terrain-stone-cap, #e0ddbb)" />
    </svg>
    <svg className="run-board-moss" viewBox="0 0 560 560" aria-hidden="true">
        <BoardMoss x={226} y={25} />
        <BoardMoss x={25} y={209} rotation={-90} />
        <BoardMoss x={25} y={431} rotation={-90} scale={.65} />
        <BoardMoss x={535} y={151} rotation={90} scale={.7} />
        <BoardMoss x={535} y={354} rotation={90} />
        <BoardMoss x={177} y={535} rotation={180} />
        <BoardMoss x={433} y={535} rotation={180} scale={.8} />
    </svg></>;
});

export function RunMoveArt() {
    const sheen = useId();
    return <svg className="run-move-art" viewBox="0 0 120 150" aria-hidden="true">
        <defs><linearGradient id={sheen} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#fff4ce" stopOpacity=".17" /><stop offset="1" stopColor="#fff4ce" stopOpacity=".02" />
        </linearGradient></defs>
        <ellipse cx="60" cy="143" rx="49" ry="6" fill="#031b1455" />
        <path d="M13 110H107L103 137 89 146H33L17 137Z" fill="var(--terrain-rock-light, #345746)" />
        <path d="M13 110H44L39 146H33L17 137Z" fill="var(--terrain-rock-facet, #496b54)" />
        <path d="M72 110H107L103 137 89 146H74Z" fill="var(--terrain-rock-dark, #274b3d)" />
        <path d="M44 115 64 118 62 145H39Z" fill="var(--terrain-rock-light, #3b604c)" />
        <path d="M5 99 18 112H102L115 100V121L102 129H18L5 121Z" fill="var(--terrain-stone-dark, #4a6e55)" />
        <path d="M5 99 18 112V129L5 121Z" fill="var(--terrain-stone-light, #648168)" />
        <path d="M102 112 115 100V121L102 129Z" fill="var(--terrain-stone-dark, #355a47)" />
        <path d="M31 112H50V128H32Z M83 113H98V128H82Z" fill="var(--terrain-stone-light, #55775b)" />
        <path d="M5 49 18 37H101L115 49V101L102 113H18L5 101Z" fill="var(--terrain-rock-top, #819564)" />
        <path d="M12 53 23 45H96L108 53V96L97 105H24L12 97Z" fill="var(--terrain-rock-patch, #94a575)" />
        <path d="M5 49 18 37 27 40 16 53V79L5 74Z M99 43 109 47 115 57 108 66 104 56Z" fill="var(--terrain-lichen, #6b8b57)" />
        <path d="M12 94 21 90 30 96 25 103 16 101Z M91 99 100 93 107 99 100 106Z" fill="var(--terrain-lichen-edge, #b0bf82)" />
        <path d="M37 108 42 103 50 107 46 113Z M105 76 112 73 115 79 109 84Z" fill="var(--terrain-lichen, #678950)" />
        <rect x="16" y="19" width="88" height="86" rx="12" fill="var(--terrain-rock-shade, #17382a)" opacity=".3" />
        <g className="run-move-panel">
            <rect x="17" y="12" width="86" height="86" rx="12" fill="var(--option-color)" />
            <rect x="17" y="12" width="86" height="86" rx="12" fill="var(--terrain-rock-shade, #0b281d)" opacity=".36" />
            <rect x="17" y="4" width="86" height="86" rx="12" fill="var(--option-color)" stroke="var(--run-button-rim)" strokeWidth="3" />
            <rect x="17" y="4" width="86" height="86" rx="12" fill={`url(#${sheen})`} />
            <rect x="22" y="9" width="76" height="76" rx="7" fill="none" stroke="#fff3d5" strokeOpacity=".88" strokeWidth="4" />
            <path d="M31 8H88" stroke="#fff9df" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
        </g>
    </svg>;
}

export function RunHearts({ health, maxHealth }: { health: number; maxHealth: number }) {
    const visible = Math.min(3, Math.max(maxHealth, health));
    return <span className="run-hearts health-count" aria-label={`Health: ${health}`}>
        {Array.from({ length: visible }, (_, index) => <svg key={index} viewBox="0 0 34 34" aria-hidden="true" className={index < health ? 'full' : 'lost'}>
            <path d="M17 29 4 16C-5 5 8-4 17 6 26-4 39 5 30 16Z" fill="currentColor" stroke="var(--heart-edge)" strokeWidth="2" />
            {index < health && <path d="M5 10Q8 3 14 8" stroke="#ef9b91" strokeWidth="2.5" strokeLinecap="round" fill="none" />}
        </svg>)}
        {health > visible && <strong className="run-extra-hearts" aria-hidden="true">+{health - visible}</strong>}
    </span>;
}

export function RunScorePlaque() {
    return <svg className="run-score-plaque" viewBox="0 0 140 64" preserveAspectRatio="none" aria-hidden="true">
        <path d="M11 2H129Q129 11 138 11V53Q129 53 129 62H11Q11 53 2 53V11Q11 11 11 2Z" fill="var(--terrain-plaque, #12372e)" stroke="var(--terrain-border, #607d66)" strokeWidth="2" />
        <path d="M14 5H126M14 59H126" stroke="var(--terrain-stone-edge, #aebe90)" strokeOpacity=".25" />
    </svg>;
}
