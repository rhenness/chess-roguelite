import { terrainIsland, stoneRuin, stoneStairs } from './runTerrainArt';

function bareTree(x: number, y: number, scale: number, distant = false) {
    return `<g class="dungeon-bare-tree" transform="translate(${x} ${y}) scale(${scale})">
        <path d="M-9 9-3-25-8-56-1-88 4-55 9-22 6 10Z" fill="#353040"/>
        <path d="M-1-88 4-55 9-22 6 10 0 6 1-26-3-54Z" fill="#211f2d"/>
        <path d="M-1-30-22-43-29-67-24-60-17-47-1-43Z M4-47 21-60 26-82 29-71 26-55 7-34Z M-3-56-17-69-19-91-14-83-11-71 0-65Z" fill="#353040"/>
        ${distant ? '' : `<path d="M-21-44-39-46-47-58-36-51-24-52Z M22-58 41-62 49-76 47-65 42-55 24-50Z" fill="#353040"/>
            <path d="M-5-15-1-31M-5-51-2-64M9-43 22-57" stroke="#777084" stroke-opacity=".4" stroke-width="2"/>
            <path d="M-15 13-7 4 0 7 9 4 17 11 7 14Z" fill="#726b7c"/>`}
    </g>`;
}

function crystal(x: number, y: number, scale: number) {
    return `<g class="dungeon-crystal" transform="translate(${x} ${y}) scale(${scale})">
        <ellipse class="run-dungeon-glow" cy="-28" rx="35" ry="48" fill="url(#dungeon-crystal-glow)"/>
        <path d="M0-74-17-47-15-13 0 4 17-17 16-47Z" fill="#9162c2"/>
        <path d="M0-74-17-47 0-35Z" fill="#d5b0f0"/>
        <path d="M0-74 16-47 0-35Z" fill="#b78bdf"/>
        <path d="M-17-47 0-35V4L-15-13Z" fill="#a476d2"/>
        <path d="M0-35 16-47 17-17 0 4Z" fill="#684592"/>
        <path d="M0-71V-36L-14-45" fill="none" stroke="#edc9ff" stroke-opacity=".6" stroke-width="1.5"/>
        <path d="M-20-4-5 5 20-8 29-2 5 14-26 0Z" fill="#544960"/>
        <path d="M-22-26-30-14-29-1-20 5-14-8Z" fill="#b288d4"/>
        <path d="M-22-26-20 5-14-8Z" fill="#79569f"/>
    </g>`;
}

function dungeonBrazier(x: number, y: number, scale: number) {
    return `<g class="dungeon-brazier" transform="translate(${x} ${y}) scale(${scale})">
        <path d="M-17-2 0 8V-39L-17-49Z" fill="#817a90"/>
        <path d="M0 8 17-2V-49L0-39Z" fill="#534b65"/>
        <path d="M-21-50 0-63 21-50 0-37Z" fill="#c0b8cb"/>
        <path d="M-21-50 0-37V-30L-21-43Z" fill="#898196"/>
        <path d="M0-37 21-50V-43L0-30Z" fill="#655c79"/>
        <path d="M-21 0 0 12 21 0V7L0 19-21 7Z" fill="#454050"/>
        <path d="M-17-24 0-14 17-24" stroke="#373141" stroke-opacity=".6"/>
        <ellipse class="run-torch-glow" cy="-73" rx="39" ry="44" fill="url(#dungeon-crystal-glow)"/>
        <path d="M-10-56-6-48H6L10-56Z" fill="#2d263b" stroke="#93869e" stroke-width="2"/>
        <g class="run-flame" style="animation-delay:${-Math.abs(x) % 3}s">
            <path d="M0-95C6-81 14-77 11-66 7-55-9-55-11-66-13-78-4-79 0-95Z" fill="#b38bea"/>
            <path d="M0-82C4-73 6-71 5-66 3-60-5-60-6-66-7-72-2-75 0-82Z" fill="#e7daff"/>
        </g>
    </g>`;
}

function hauntedArch(x: number, y: number, scale: number) {
    return `<g class="dungeon-arch" transform="translate(${x} ${y}) scale(${scale})">
        <path d="M-63-5 4 31 74-10 65-24 0 13-53-16Z" fill="#8a8296"/>
        <path d="M-63-5 4 31V41L-62 7Z" fill="#60596f"/>
        <path d="M4 31 74-10V0L4 41Z" fill="#3d364e"/>
        <path d="M-44 5V-69Q-44-101 0-135 44-101 44-69V5L29 14V-69Q29-91 0-114-29-91-29-69V14Z" fill="#a099ad"/>
        <path d="M44 5 60-5V-80Q60-109 16-143L0-135Q44-101 44-69Z" fill="#554c68"/>
        <path d="M-44-69Q-44-101 0-135L16-143Q-28-108-28-80Z" fill="#c3bacd"/>
        <path d="M-29 14V-69Q-29-91 0-114 29-91 29-69V14L0 30Z" fill="#211a31"/>
        <path class="run-dungeon-glow" d="M-23 13V-66Q-23-86 0-106 23-86 23-66V13L0 26Z" fill="url(#dungeon-portal)"/>
        <path d="M-29 14V-69Q-29-91 0-114 29-91 29-69V14" fill="none" stroke="#ae85cc" stroke-opacity=".55" stroke-width="2"/>
        <path d="M-44-47-29-41M-42-80-28-74M-33-104-22-94M-16-121-9-108M16-121 9-108M33-104 22-94M42-80 28-74M44-47 29-41" stroke="#665d76" stroke-width="2"/>
        <path d="M-44-22-35-18-37-6M49-67 55-70V-50M-25-112-21-109-24-102" fill="none" stroke="#4d435d" stroke-width="2"/>
        <path d="M-54 13-48 4-34 8-32 15-43 20Z M33 22 41 15 53 18 49 26Z" fill="#726f85"/>
    </g>`;
}

function graveSlabs(x: number, y: number, scale: number) {
    return `<g class="dungeon-slabs" transform="translate(${x} ${y}) scale(${scale})">
        <path d="M-28 0V-28L-19-37-8-31V11Z" fill="#a19bad"/>
        <path d="M-8-31-1-35V7L-8 11Z" fill="#655e79"/>
        <path d="M-22-23-15-19M-22-15-15-11" stroke="#655e79" stroke-width="2"/>
        <path d="M14 20 20-5 34-8 39 0 33 28Z" fill="#888297"/>
        <path d="M33 28 42 22 47-6 39 0Z" fill="#534c67"/>
        <path d="M-35 4-28 0-8 11-14 15Z M8 24 14 20 33 28 27 32Z" fill="#6c667d"/>
    </g>`;
}

function dungeonIsland(x: number, y: number, scale: number,
    form: Parameters<typeof terrainIsland>[5], detail: 'near' | 'middle' | 'distant', landmark = '') {
    return terrainIsland(x, y, scale, false, false, form, detail, landmark, false);
}

// Different silhouettes and isolated landmarks keep the ruins from reading as a tiled forest.
export const DAILY_NEAR_SCENERY =
    dungeonIsland(145, 153, 1.2, 'crag', 'near',
        bareTree(-42, -16, .92) + stoneRuin(13, 3, .75, 'tower') + crystal(43, 22, .36))
    + dungeonIsland(898, 213, 1.17, 'shelf', 'near',
        bareTree(58, -6, .68) + hauntedArch(-17, -1, .87))
    + dungeonIsland(177, 392, .43, 'ridge', 'near', graveSlabs(-4, -2, .78))
    + dungeonIsland(36, 522, .88, 'point', 'near', bareTree(-19, -23, 1.08) + crystal(45, 20, .34))
    + dungeonIsland(844, 502, .45, 'crag', 'near', crystal(-6, -7, .63))
    + dungeonIsland(974, 632, .9, 'shelf', 'near',
        stoneRuin(4, 7, .83, 'wall') + bareTree(-66, -8, .52))
    + dungeonIsland(147, 856, 1.29, 'shelf', 'near',
        bareTree(-53, -25, .74) + graveSlabs(-21, 10, .75) + dungeonBrazier(35, 12, .9) + stoneStairs(-30, 38, .85))
    + dungeonIsland(884, 879, 1.14, 'crag', 'near',
        stoneRuin(-38, 8, .54, 'fallen') + crystal(15, 4, 1.12) + crystal(49, 20, .47))
    + dungeonIsland(329, 1054, .61, 'ridge', 'near', graveSlabs(-14, -5, .57))
    + dungeonIsland(17, 963, .33, 'crag', 'near')
    + dungeonIsland(988, 1069, .39, 'shelf', 'near', bareTree(-23, -9, .57))
    + `<g class="run-dungeon-mist" opacity=".055"><path d="M-50 729Q120 675 267 717T543 705T884 732T1080 707" fill="none" stroke="#b8a5ce" stroke-width="22" stroke-linecap="round"/><path d="M-80 993Q186 934 364 983T718 971T1069 1004" fill="none" stroke="#b8a5ce" stroke-width="30" stroke-linecap="round"/></g>`
    + [[272, 89], [745, 71], [70, 338], [937, 374], [261, 827], [711, 933], [376, 1073], [176, 655]].map(([x, y], i) =>
        `<circle class="run-mote" cx="${x}" cy="${y}" r="${i % 3 ? 1.5 : 2}" fill="#c2a1e7" style="animation-duration:${10 + i}s;animation-delay:${-i * 2.3}s"/>`).join('');

export const DAILY_MIDDLE_SCENERY =
    dungeonIsland(1111, 124, .51, 'crag', 'middle', bareTree(-18, -22, .8, true))
    + dungeonIsland(-69, 254, .56, 'shelf', 'middle')
    + dungeonIsland(-209, 408, .3, 'point', 'middle')
    + dungeonIsland(1116, 465, .54, 'ridge', 'middle', bareTree(25, -19, .68, true))
    + dungeonIsland(-126, 658, .57, 'ridge', 'middle', bareTree(-41, -17, .63, true))
    + dungeonIsland(1178, 813, .49, 'point', 'middle')
    + dungeonIsland(-53, 968, .6, 'crag', 'middle');

export const DAILY_DISTANT_SCENERY =
    dungeonIsland(-277, 154, .3, 'point', 'distant')
    + dungeonIsland(1303, 301, .31, 'shelf', 'distant')
    + dungeonIsland(-328, 519, .34, 'shelf', 'distant')
    + dungeonIsland(-369, 624, .22, 'crag', 'distant')
    + dungeonIsland(1379, 642, .26, 'crag', 'distant')
    + dungeonIsland(-251, 901, .3, 'ridge', 'distant')
    + dungeonIsland(1284, 1025, .33, 'point', 'distant');
