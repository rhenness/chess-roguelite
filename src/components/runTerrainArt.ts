import { foliage } from './playerJourneyArt';

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

export function terrainIsland(x: number, y: number, scale: number, waterfall = false, banner = false,
    form: keyof typeof ISLAND_FORMS = 'point', detail: 'near' | 'middle' | 'distant' = 'near', landmark = '', wooded = true) {
    const shape = ISLAND_FORMS[form];
    const [waterX, waterY, waterDrop] = shape.water;
    const trees = (wooded ? shape.trees : []).slice(0, detail === 'near' ? shape.trees.length : detail === 'middle' ? 2 : 1)
        .map(([treeX, treeY, size]) => detail === 'distant'
            ? `<g transform="translate(${treeX} ${treeY}) scale(${size})"><path d="M0-52-24 9 18 9Z" fill="#527c56"/><path d="M0-52V9H18Z" fill="#345e47"/></g>`
            : foliage(treeX, treeY, size)).join('');
    return `<g class="run-terrain-island" data-form="${form}" data-depth="${detail}" transform="translate(${x} ${y}) scale(${scale})" style="--run-float-duration:${12 + Math.abs(x) % 5}s;--run-float-delay:${-(Math.abs(x) % 11)}s">
        <ellipse class="run-island-shadow" cy="${shape.shadow[0]}" rx="${shape.shadow[1]}" ry="19" fill="#04171355"/>
        <g class="run-island-drift">
        <path d="${shape.left}" fill="var(--terrain-rock-light, #35594d)"/>
        <path d="${shape.right}" fill="var(--terrain-rock-dark, #24463d)"/>
        ${detail === 'near' ? `<path d="${shape.facets}" fill="var(--terrain-rock-facet, #466c5a)"/><path d="${shape.shade}" fill="var(--terrain-rock-shade, #173a32)" opacity=".65"/>` : ''}
        <path d="${shape.top}" fill="var(--terrain-rock-top, #759163)"/>
        ${detail !== 'distant' ? `<path d="${shape.grass}" fill="var(--terrain-rock-patch, #9bad78)" opacity=".75"/>` : ''}
        ${detail === 'near' ? `<path d="M-60-3-39-14-18-3-39 9Z M24 17 38 9 53 17 38 26Z" fill="var(--terrain-stone-cap, #c1c49a)" opacity=".6"/><path d="M-80 39-55 53M-36 67-11 81M46 77 73 61" stroke="var(--terrain-stone-edge, #9fb58a)" stroke-opacity=".13" stroke-width="2"/>` : ''}
        ${waterfall && detail === 'near' ? `<g transform="translate(${waterX} ${waterY})"><path d="M-30-8-14-16 0 0-16 8Z" fill="#b6e2d3"/><path d="M-16 8 0 0V${waterDrop}Q-4 ${waterDrop + 22}-22 ${waterDrop + 22}L-16 ${waterDrop}Z" fill="#59adae" opacity=".8"/><path class="run-water-flow" d="M-13 11V${waterDrop - 4}Q-13 ${waterDrop + 10}-19 ${waterDrop + 13}M-4 5V${waterDrop}" fill="none" stroke="#b3e9dd" stroke-width="3" stroke-dasharray="18 34" stroke-linecap="round" opacity=".5"/><ellipse cx="-17" cy="${waterDrop + 19}" rx="24" ry="6" fill="#71c4b7" opacity=".18"/></g>` : ''}
        ${banner && detail === 'near' ? `<path d="M-76 16-36 37V113L-46 103-56 113-66 91-76 92Z" fill="#925547" stroke="#c6a063" stroke-width="2"/><path d="M-78 13-33 37" stroke="#d5bb80" stroke-width="4"/><path d="M-59 53-50 68-59 78-66 74-63 68-66 61Z M-67 82-50 91" fill="#e2bf76"/>` : ''}
        ${landmark}${trees}
        </g>
    </g>`;
}

/** Small, fixed SVG landmarks for the default woodland terrain. */
function stoneBlock(x: number, y: number, width: number, height: number) {
    const half = width / 2;
    return `<g transform="translate(${x} ${y})">
        <path d="M${-width} ${-height} 0 ${-height + half}V${half}L${-width} 0Z" fill="var(--terrain-stone-light, #819b88)"/>
        <path d="M0 ${-height + half} ${width} ${-height}V0L0 ${half}Z" fill="var(--terrain-stone-dark, #527766)"/>
        <path d="M${-width} ${-height} 0 ${-height - half} ${width} ${-height} 0 ${-height + half}Z" fill="var(--terrain-stone-cap, #c1c8a1)"/>
        <path d="M${-width} ${-height} 0 ${-height + half} ${width} ${-height}" fill="none" stroke="var(--terrain-stone-edge, #e1dfb8)" stroke-opacity=".45"/>
        ${height > 24 ? `<path d="M${-width} ${-height / 2} 0 ${-height / 2 + half} ${width} ${-height / 2}" fill="none" stroke="var(--terrain-mortar, #345a4b)" stroke-opacity=".4"/>` : ''}
        <path d="M${-width + 4} ${-height + 4} ${-width + 10} ${-height + 8} ${-width + 9} ${-height + 23} ${-width + 3} ${-height + 19}Z" fill="var(--terrain-lichen, #789653)" opacity=".8"/>
    </g>`;
}

export function stoneRuin(x: number, y: number, scale: number, form: 'tower' | 'wall' | 'fallen') {
    const blocks = form === 'tower'
        ? stoneBlock(0, -10, 21, 85) + stoneBlock(32, 8, 18, 37) + stoneBlock(-26, 17, 17, 25)
            + `<path d="M3-60 12-65V-46L3-41Z" fill="var(--terrain-rock-shade, #2e584b)"/><path d="M-13-85-5-90 3-85-5-80Z" fill="var(--terrain-lichen-light, #91a575)"/>`
        : form === 'wall'
            ? stoneBlock(-29, -8, 18, 27) + stoneBlock(2, 8, 19, 58) + stoneBlock(33, 24, 16, 34)
            : stoneBlock(-15, 0, 20, 16) + stoneBlock(17, 15, 15, 23);
    return `<g class="run-stone-ruin" transform="translate(${x} ${y}) scale(${scale})">${blocks}
        <path d="M-27 24-18 17-8 21-10 29-22 31Z M14 29 23 24 31 28 26 33 17 34Z" fill="var(--terrain-lichen-light, #8fa963)"/>
        <path d="M-22 23-17 20M20 29 24 27" stroke="var(--terrain-lichen-edge, #b7c982)" stroke-width="2"/>
    </g>`;
}

export function stoneStairs(x: number, y: number, scale: number) {
    return `<g class="run-stone-stairs" transform="translate(${x} ${y}) scale(${scale})">`
        + Array.from({ length: 7 }, (_, step) => stoneBlock(-step * 9, step * 15, 18, 14)).join('')
        + `<path d="M-66 88-60 84-54 88-60 92Z M-44 58-38 54-32 58-38 62Z" fill="var(--terrain-lichen-light, #95af70)"/></g>`;
}

export function woodlandTorch(x: number, y: number, scale: number) {
    return `<g class="run-woodland-torch" transform="translate(${x} ${y}) scale(${scale})">
        ${stoneBlock(0, 0, 14, 42)}
        <ellipse class="run-torch-glow" cy="-66" rx="32" ry="37" fill="url(#run-woodland-glow)" style="animation-delay:${-Math.abs(x) % 4}s"/>
        <path d="M-5-39V-51H5V-39L0-36Z" fill="#957044"/>
        <g class="run-flame" style="animation-delay:${-Math.abs(y) % 3}s">
            <path d="M0-77C5-66 12-63 9-55 5-46-7-46-9-55-11-63-3-66 0-77Z" fill="#efb05a"/>
            <path d="M0-68C3-61 5-58 4-55 2-49-4-49-5-55-6-60-1-62 0-68Z" fill="var(--terrain-flame-core, #fff0b3)"/>
        </g>
    </g>`;
}
