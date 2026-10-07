import { memo, useId } from 'react';
import { SKILL_TIER_LABELS, type SkillTier } from '../config/difficulty';
import { castle, foliage, JOURNEY_PALETTES } from './playerJourneyArt';
import './RunEnvironment.css';

// Hand-shaped silhouettes share the trees, ruins, and palette used by the Home journey.
const ISLAND_FORMS = {
    point: {
        top: 'M-100 0 0-54 100 0 0 53Z',
        left: 'M-100 0 0 53 0 184-39 149-72 122-100 66Z',
        right: 'M0 53 100 0 96 83 62 121 36 151 0 184Z',
        facets: 'M-100 0-68 17-64 91-40 112-39 149-72 122-100 66Z',
        shade: 'M0 53 30 37 32 125 0 184Z M62 20 100 0 96 83 62 121Z',
        grass: 'M-100 0-45-30 14 1-40 31Z M0-54 58-23 10 4-45-30Z',
        trees: [[-17, -24, .9], [65, 4, .62], [-70, 5, .54]],
        water: [48, 27, 125],
        shadow: [167, 86],
    },
    shelf: {
        top: 'M-112-8-48-45 26-38 105 3 78 27 16 54-53 31-89 34-113 19Z',
        left: 'M-112-8-113 19-89 34-53 31 16 54 12 139-26 133-64 110-96 107-112 68Z',
        right: 'M16 54 78 27 105 3 101 81 74 121 28 152 12 139Z',
        facets: 'M-113 19-89 34-53 31-59 85-64 110-96 107-103 65Z',
        shade: 'M16 54 42 43 40 121 28 152 12 139Z M78 27 105 3 101 81 74 121Z',
        grass: 'M-112-8-48-45-7-23-53 2-89 34-113 19Z M26-38 71-16 33 6-7-23Z',
        trees: [[-48, -20, .65], [64, 0, .38]],
        water: [58, 36, 89],
        shadow: [141, 92],
    },
    crag: {
        top: 'M-91 12-78-8-10-49 34-36 89-5 70 13 16 46-20 38-41 45Z',
        left: 'M-91 12-41 45-20 38 16 46 8 211-19 172-44 181-59 116-82 94Z',
        right: 'M16 46 70 13 89-5 85 82 57 121 35 166 8 211Z',
        facets: 'M-91 12-65 29-55 105-44 181-59 116-82 94Z',
        shade: 'M16 46 35 34 29 141 8 211Z M70 13 89-5 85 82 57 121Z',
        grass: 'M-78-8-10-49 9-36-41-6-65 29-91 12Z',
        trees: [[-14, -24, .88], [46, 4, .32]],
        water: [51, 25, 147],
        shadow: [194, 74],
    },
    ridge: {
        top: 'M-126-9-55-49 4-29 40-48 119-6 68 40 4 51-65 19Z',
        left: 'M-126-9-65 19 4 51 0 87-49 102-79 90-118 60Z',
        right: 'M4 51 68 40 119-6 112 68 66 79 47 87 21 109 0 87Z',
        facets: 'M-126-9-91 7-79 90-118 60Z M-65 19-32 35-33 92-49 102Z',
        shade: 'M4 51 29 47 21 109 0 87Z M68 40 119-6 112 68 66 79Z',
        grass: 'M-126-9-55-49 4-29-65 19Z M40-48 79-26 24 4-9-13Z',
        trees: [[36, -16, .48], [-65, -7, .36]],
        water: [66, 40, 47],
        shadow: [96, 101],
    },
} as const;

function island(x: number, y: number, scale: number, waterfall = false, banner = false,
    form: keyof typeof ISLAND_FORMS = 'point', detail: 'near' | 'middle' | 'distant' = 'near') {
    const shape = ISLAND_FORMS[form];
    const [waterX, waterY, waterDrop] = shape.water;
    const trees = shape.trees.slice(0, detail === 'near' ? shape.trees.length : detail === 'middle' ? 2 : 1)
        .map(([treeX, treeY, size]) => detail === 'distant'
            ? `<g transform="translate(${treeX} ${treeY}) scale(${size})"><path d="M0-52-24 9 18 9Z" fill="#527c56"/><path d="M0-52V9H18Z" fill="#345e47"/></g>`
            : foliage(treeX, treeY, size)).join('');
    return `<g class="run-terrain-island" data-form="${form}" data-depth="${detail}" transform="translate(${x} ${y}) scale(${scale})" style="--run-float-duration:${12 + Math.abs(x) % 5}s;--run-float-delay:${-(Math.abs(x) % 11)}s">
        <ellipse class="run-island-shadow" cy="${shape.shadow[0]}" rx="${shape.shadow[1]}" ry="19" fill="#04171355"/>
        <g class="run-island-drift">
        <path d="${shape.left}" fill="#35594d"/>
        <path d="${shape.right}" fill="#24463d"/>
        ${detail === 'near' ? `<path d="${shape.facets}" fill="#466c5a"/><path d="${shape.shade}" fill="#173a32" opacity=".65"/>` : ''}
        <path d="${shape.top}" fill="#759163"/>
        ${detail !== 'distant' ? `<path d="${shape.grass}" fill="#9bad78" opacity=".75"/>` : ''}
        ${detail === 'near' ? `<path d="M-60-3-39-14-18-3-39 9Z M24 17 38 9 53 17 38 26Z" fill="#c1c49a" opacity=".6"/><path d="M-80 39-55 53M-36 67-11 81M46 77 73 61" stroke="#9fb58a" stroke-opacity=".13" stroke-width="2"/>` : ''}
        ${waterfall && detail === 'near' ? `<g transform="translate(${waterX} ${waterY})"><path d="M-30-8-14-16 0 0-16 8Z" fill="#b6e2d3"/><path d="M-16 8 0 0V${waterDrop}Q-4 ${waterDrop + 22}-22 ${waterDrop + 22}L-16 ${waterDrop}Z" fill="#59adae" opacity=".8"/><path class="run-water-flow" d="M-13 11V${waterDrop - 4}Q-13 ${waterDrop + 10}-19 ${waterDrop + 13}M-4 5V${waterDrop}" fill="none" stroke="#b3e9dd" stroke-width="3" stroke-dasharray="18 34" stroke-linecap="round" opacity=".5"/><ellipse cx="-17" cy="${waterDrop + 19}" rx="24" ry="6" fill="#71c4b7" opacity=".18"/></g>` : ''}
        ${banner && detail === 'near' ? `<path d="M-76 16-36 37V113L-46 103-56 113-66 91-76 92Z" fill="#925547" stroke="#c6a063" stroke-width="2"/><path d="M-78 13-33 37" stroke="#d5bb80" stroke-width="4"/><path d="M-59 53-50 68-59 78-66 74-63 68-66 61Z M-67 82-50 91" fill="#e2bf76"/>` : ''}
        ${trees}
        </g>
    </g>`;
}

const SCENERY = island(154, 142, 1.28, false, true) + island(892, 224, 1.22, true, false, 'shelf')
    + island(164, 407, .43, false, false, 'ridge') + island(42, 502, .87, false, false, 'crag')
    + island(847, 508, .48, false, false, 'crag') + island(968, 617, .91)
    + island(154, 844, 1.3, false, false, 'shelf') + island(876, 886, 1.1, true, false, 'crag')
    + island(338, 1063, .58, false, false, 'ridge') + island(44, 969, .38) + island(969, 1027, .36, false, false, 'shelf')
    + `<g transform="translate(148 836) scale(.75)">${castle(0, 0, JOURNEY_PALETTES[3])}</g>`
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

export const RunScenery = memo(function RunScenery() {
    return <div className="run-scenery" aria-hidden="true">
        <svg className="run-scene-background run-scene-distant" viewBox="-500 0 2000 1120" fill="none" dangerouslySetInnerHTML={{ __html: DISTANT_SCENERY }} />
        <svg className="run-scene-background run-scene-middle" viewBox="-500 0 2000 1120" fill="none" dangerouslySetInnerHTML={{ __html: MIDDLE_SCENERY }} />
        <svg className="run-scene-near" viewBox="0 0 1000 1120" fill="none">
            <defs><linearGradient id="run-star-trail" x1="-25" y1="-12" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#d7e1b8" stopOpacity="0" /><stop offset="1" stopColor="#e8edce" stopOpacity=".7" /></linearGradient></defs>
            <g dangerouslySetInnerHTML={{ __html: SCENERY }} />
        </svg>
    </div>;
});

function Torch({ x }: { x: number }) {
    return <g transform={`translate(${x} 103)`}>
        <path d="M-23 0 0 13V-68L-23-80Z" fill="#729080" />
        <path d="M0 13 23 0V-80L0-68Z" fill="#466c5d" />
        <path d="M-28-83 0-99 28-83 0-67Z" fill="#cad0a9" />
        <path d="M-28-83 0-67V-58L-28-74Z" fill="#8fa58a" />
        <path d="M0-67 28-83V-74L0-58Z" fill="#618473" />
        <path d="M-28 0 0 16 28 0V9L0 25-28 9Z" fill="#375a4c" />
        <path d="M-13-38 0-31M8-22 18-28" stroke="#c7d0a2" strokeOpacity=".2" strokeWidth="2" />
        <ellipse className="run-torch-glow" cy="-108" rx="42" ry="45" fill="url(#run-torch-glow)" style={{ animationDelay: `${-x / 100}s` }} />
        <path d="M-7-99V-112H7V-99L0-95Z" fill="#84613e" />
        <g className="run-flame" style={{ animationDelay: `${-x / 200}s` }}>
            <path d="M0-149C7-132 15-130 12-120 8-108-10-110-12-120-15-132-4-132 0-149Z" fill="#eeb55d" />
            <path d="M0-136C4-128 7-125 6-120 3-113-5-114-6-120-7-126-2-129 0-136Z" fill="#fff0b3" />
        </g>
    </g>;
}

export function RunGate({ floor, skillTier }: { floor: number; skillTier: SkillTier }) {
    const title = useId();
    return <div className="run-gate">
        <svg viewBox="0 -60 520 196" aria-hidden="true">
            <defs><radialGradient id="run-torch-glow"><stop stopColor="#f0bc69" stopOpacity=".27" /><stop offset="1" stopColor="#f0bc69" stopOpacity="0" /></radialGradient></defs>
            <path d="M63 101 161 5 224-17H296L359 5 457 101" fill="#193a31" stroke="#365d4b" strokeWidth="14" />
            <path d="M153 18 174 5 194 16 175 29Z M181-1 202-14 222-3 203 10Z M302-3 323-14 343-1 322 10Z M330 16 351 5 372 18 350 30Z" fill="#8ba080" />
            <path d="M224-17V-44L246-56 268-44V-14 M267-15V-35L287-47 308-35V-9" fill="#658573" stroke="#aebd97" strokeWidth="2" />
            <path d="M152 119 130 97V51L152 29H368L390 51V97L368 119Z" fill="#17382f" stroke="#587462" strokeWidth="3" />
            <path d="M152 113 136 95V53L154 35H366L384 53V95L366 113Z" stroke="#b4c299" strokeOpacity=".22" strokeWidth="1" fill="none" />
            <Torch x={87} /><Torch x={433} />
        </svg>
        <div className="run-gate-copy" aria-labelledby={title}>
            <h1 id={title}>Floor {floor}</h1>
            <span className="run-gate-skill" aria-label={`${SKILL_TIER_LABELS[skillTier]} skill level`}>
                <svg viewBox="0 0 23 21" aria-hidden="true"><path d="M2 18V12M10 18V7M18 18V2" stroke="currentColor" strokeWidth="5" opacity=".95" /></svg>
                {SKILL_TIER_LABELS[skillTier]}
            </span>
        </div>
    </div>;
}

function BoardPillarShaft({ x, y }: { x: number; y: number }) {
    return <g transform={`translate(${x} ${y})`}>
        <path d="M-20 4 0 16V44L-20 32Z" fill="#769486" />
        <path d="M0 16 20 4V32L0 44Z" fill="#537b6c" />
        <path d="M-20 32 0 44-2 61-18 50Z" fill="#648879" />
        <path d="M0 44 20 32 18 50-2 61Z" fill="#426a5d" />
        <path d="M-18 50-2 61V78L-18 68-20 56Z" fill="#567b6e" />
        <path d="M-2 61 18 50 16 67-2 78Z" fill="#345a50" />
        <path d="M-20 4-13 8-12 36-20 32Z" fill="#90a58d" opacity=".35" />
        <path d="M-19 31 0 43 19 32" fill="none" stroke="#284d42" strokeOpacity=".25" />
        <path d="M-7 24-3 27V35" fill="none" stroke="#bdc6a0" strokeOpacity=".25" />
    </g>;
}

function BoardPillarCap({ x, y }: { x: number; y: number }) {
    return <g transform={`translate(${x} ${y})`}>
        <path d="M-22 8 0 21 22 8 19 13 0 25-20 13Z" fill="#173f32" opacity=".35" />
        <path d="M-25-3 0 12V21L-24 7Z" fill="#a3b394" />
        <path d="M0 12 25-3 24 7 0 21Z" fill="#809b82" />
        <path d="M-25-3 0-19 25-3 0 12Z" fill="#d7d9b2" stroke="#e8e5c5" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M-9-3 0-9 9-3 0 3Z" fill="#b0bc97" />
        <path d="M-9-3 0-9 9-3" fill="none" stroke="#c1c9a4" strokeWidth="1.5" />
        <path d="M0 13V20" stroke="#d0d5ad" strokeWidth="1.5" />
    </g>;
}

function BoardMoss({ x, y, rotation = 0, scale = 1 }: { x: number; y: number; rotation?: number; scale?: number }) {
    return <g transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}>
        <path d="M-25-5-17-10-8-7-4-12 5-9 10-4 18-8 26-3 23 3 28 8 18 12 14 21 5 23 0 15-6 16-10 9-19 10-16 4-24 1Z" fill="#153f2e" opacity=".3" />
        <path d="M-26-7-18-12-10-9-6-14 3-11 8-6 16-10 24-5 20 1 26 6 16 10 12 18 4 20-1 12-8 13-12 6-21 7-18 1-25-2Z" fill="#567c50" />
        <path d="M-23-6-15-11-9-7-13-1-21 2Z M-7-10 1-13 7-6 2-1-6-3Z M8-3 17-8 23-4 17 3 9 4Z" fill="#8faa6b" />
        <path d="M-12 3-5-1 2 3-2 10-8 11Z M7 5 15 1 22 5 15 10 9 11Z M5 13 12 10 10 17 4 18Z" fill="#72955d" />
        <path d="M-16-5-11-7M-3-7 1-8M13-3 17-5" fill="none" stroke="#b0c48a" strokeWidth="2" strokeLinecap="round" />
        <path d="M-3 13 1 11 4 14 0 17Z M19 12 23 10 25 13 21 15Z" fill="#9cb77a" />
    </g>;
}

export const RunBoardFrame = memo(function RunBoardFrame() {
    return <><svg className="run-board-frame" viewBox="0 0 560 560" aria-hidden="true">
        {/* The rear shafts sit behind the deck, while their caps project above the rim. */}
        <BoardPillarShaft x={20} y={16} /><BoardPillarShaft x={540} y={16} />
        <path d="M15 22H545V544L526 570H34L15 544Z" fill="#355c4e" />
        <path d="M15 544H545L526 570H34Z" fill="#24483d" />
        <rect x="16" y="16" width="528" height="528" rx="4" fill="#c5cba6" stroke="#e0dfb8" strokeWidth="3" />
        <rect x="25" y="25" width="510" height="510" rx="18" fill="#c5cba6" stroke="#8ea17e" strokeWidth="2" />
        <path d="M115 17V25M222 17V25M337 17V25M446 17V25M115 535V544M222 535V544M337 535V544M446 535V544M16 119H25M16 226H25M16 339H25M16 446H25M535 119H544M535 226H544M535 339H544M535 446H544" stroke="#8da381" strokeWidth="2" />
        <path d="M222 15 218 20 224 25M442 536 448 540 445 546M15 337 20 332 25 335" fill="none" stroke="#55735b" strokeWidth="2" />
        <path d="M38 7 44 4 51 9 43 13Z M499 550 506 546 512 550 505 555Z M5 195 11 190 17 194 10 200Z" fill="#89a365" />
        <BoardPillarCap x={20} y={16} /><BoardPillarCap x={540} y={16} />
        <BoardPillarShaft x={20} y={543} /><BoardPillarShaft x={540} y={543} />
        <BoardPillarCap x={20} y={543} /><BoardPillarCap x={540} y={543} />
        <path d="M26 33 32 29 37 31 35 37 28 39Z M527 520 534 516 539 520 535 526 530 529Z" fill="#082b20" opacity=".22" />
        <path d="M23 29 30 25 35 28 31 34 25 35Z M528 519 535 515 540 518 534 524Z" fill="#7e9c65" />
        <g transform="translate(55 -5)">
            <path d="M121 529 125 524 130 524 134 530 132 538 138 542 127 548 122 543Z" fill="#062a2180" />
            <path d="M122 535 125 529 131 529 130 536 136 539 127 542 120 539Z" fill="#8eaa70" />
            <path d="M380 536 384 527 389 532 386 539 390 544" fill="none" stroke="#587453" strokeWidth="3" strokeLinecap="round" />
            <path d="M384 530 391 526 395 529 389 534Z" fill="#9bb27c" />
        </g>
        <path d="M25 525 35 522 39 526 33 531Z M520 534 528 530 534 534 528 538Z" fill="#e0ddbb" />
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
        <path d="M13 110H107L103 137 89 146H33L17 137Z" fill="#345746" />
        <path d="M13 110H44L39 146H33L17 137Z" fill="#496b54" />
        <path d="M72 110H107L103 137 89 146H74Z" fill="#274b3d" />
        <path d="M44 115 64 118 62 145H39Z" fill="#3b604c" />
        <path d="M5 99 18 112H102L115 100V121L102 129H18L5 121Z" fill="#4a6e55" />
        <path d="M5 99 18 112V129L5 121Z" fill="#648168" />
        <path d="M102 112 115 100V121L102 129Z" fill="#355a47" />
        <path d="M31 112H50V128H32Z M83 113H98V128H82Z" fill="#55775b" />
        <path d="M5 49 18 37H101L115 49V101L102 113H18L5 101Z" fill="#819564" />
        <path d="M12 53 23 45H96L108 53V96L97 105H24L12 97Z" fill="#94a575" />
        <path d="M5 49 18 37 27 40 16 53V79L5 74Z M99 43 109 47 115 57 108 66 104 56Z" fill="#6b8b57" />
        <path d="M12 94 21 90 30 96 25 103 16 101Z M91 99 100 93 107 99 100 106Z" fill="#b0bf82" />
        <path d="M37 108 42 103 50 107 46 113Z M105 76 112 73 115 79 109 84Z" fill="#678950" />
        <rect x="16" y="19" width="88" height="86" rx="12" fill="#17382a" opacity=".3" />
        <g className="run-move-panel">
            <rect x="17" y="12" width="86" height="86" rx="12" fill="var(--option-color)" />
            <rect x="17" y="12" width="86" height="86" rx="12" fill="#0b281d" opacity=".36" />
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
        <path d="M11 2H129Q129 11 138 11V53Q129 53 129 62H11Q11 53 2 53V11Q11 11 11 2Z" fill="#12372e" stroke="#607d66" strokeWidth="2" />
        <path d="M14 5H126M14 59H126" stroke="#aebe90" strokeOpacity=".25" />
    </svg>;
}
