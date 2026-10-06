export type JourneyPalette = readonly [string, string, string, string, string];

export const JOURNEY_PALETTES = [
      ['#e1bc88', '#b68a57', '#8b643f', '#62462d', '#f6deb1'],
      ['#c7ddd3', '#91b4a8', '#658e83', '#3b665d', '#e7f1d8'],
      ['#efd38c', '#c3a05a', '#997336', '#665832', '#fff0bb'],
      ['#b5ddd1', '#83b5a6', '#548c80', '#37635b', '#def5df'],
      ['#acd69b', '#77af72', '#4e855b', '#2c5d48', '#ddedbd'],
      ['#b9e7e7', '#80bfca', '#5099b0', '#3a697f', '#e1f7ee'],
      ['#e8c8a1', '#c0986c', '#986d4c', '#70514b', '#fce7c1'],
      ['#d8c6e8', '#b29ac8', '#7e739f', '#54536f', '#f3e8ff'],
    ] as const;

const polygon = (points: string, fill: string, extra = '') => `<polygon points="${points}" fill="${fill}" ${extra}/>`;
    function foliage(x: number, y: number, size: number, color = '#527c56') {
      return `<g transform="translate(${x} ${y}) scale(${size})" aria-hidden="true"><ellipse cy="8" rx="22" ry="7" fill="#061a1433"/><path d="M 0 -52 L -21 -17 L -11 -17 L -27 4 L 0 12 Z" fill="${color}"/><path d="M 0 -52 L 21 -17 L 11 -17 L 27 4 L 0 12 Z" fill="#345e47"/><path d="M 0 -28 V 17" stroke="#78946a" stroke-width="3"/></g>`;
    }
    function crystal(x: number, y: number, height: number, width: number, palette: JourneyPalette) {
      const [top, light, mid, dark] = palette;
      return `<g transform="translate(${x} ${y})">${polygon(`${-width} -16,0 ${-height},0 0`, light)}${polygon(`0 ${-height},${width} ${-height + 12},${width + 3} -18,0 0`, mid)}${polygon(`${-width} ${-height + 14},0 ${-height},${width} ${-height + 12},0 ${-height + 24}`, top)}${polygon(`${-width} ${-height + 14},0 ${-height + 24},0 0,${-width - 3} -18`, light)}${polygon(`0 ${-height + 24},${width} ${-height + 12},${width + 3} -18,0 0`, mid)}${polygon(`0 ${-height * .47},${width + 3} -18,0 0`, dark, 'opacity=".45"')}</g>`;
    }
    function tower(x: number, y: number, height: number, palette: JourneyPalette) {
      const [top, light, mid, dark, gleam] = palette;
      return `<g transform="translate(${x} ${y})">${polygon(`-16 ${-height},0 ${-height + 8},0 0,-16 -8`, light)}${polygon(`0 ${-height + 8},16 ${-height},16 -8,0 0`, mid)}${polygon(`-19 ${-height - 7},0 ${-height - 17},19 ${-height - 7},0 ${-height + 4}`, top)}${polygon(`-19 ${-height - 7},0 ${-height + 4},0 ${-height + 15},-19 ${-height + 4}`, light)}${polygon(`0 ${-height + 4},19 ${-height - 7},19 ${-height + 4},0 ${-height + 15}`, mid)}<path d="M -13 ${-height - 10} v -12 M -2 ${-height - 15} v -12 M 11 ${-height - 12} v -12" stroke="${gleam}" stroke-width="8"/><path d="M -9 ${-height + 28} v 16 M 8 ${-height + 36} v 14" stroke="${dark}" stroke-width="4"/><path d="M 0 ${-height - 25} v -30" stroke="#bbc8ad" stroke-width="1.5"/><path d="M 1 ${-height - 55} l 24 4 l -6 12 l -18 -4Z" fill="#bda573"/><path d="M 9 ${-height - 49} l 4 2 l -1 6 l -4 -2Z" fill="#f4e6b8"/></g>`;
    }
    function castle(x: number, y: number, palette: JourneyPalette) {
      const [top, light, mid, dark, gleam] = palette;
      return `<g transform="translate(${x} ${y})" aria-hidden="true"><ellipse cy="34" rx="83" ry="17" fill="#04191050"/>${polygon('-74 0,0 -42,74 0,0 42', '#527460')}${polygon('-74 0,0 42,0 77,-56 31', '#244d3d')}${polygon('0 42,74 0,56 31,0 77', '#1b4136')}${polygon('-49 5,0 -23,49 5,0 33', dark)}${tower(-42, -1, 68, palette)}${polygon('-30 -76,4 -96,43 -73,7 -53', top)}${polygon('-30 -76,7 -53,7 12,-30 -9', light)}${polygon('7 -53,43 -73,43 -7,7 12', mid)}<path d="M 15 5 v -22 q 11 -17 20 -11 v 22Z" fill="${dark}"/><path d="M -20 -52 l 0 13 m 15 -5 v 13 M 17 -50 v 14 M 33 -58 v 13" stroke="${dark}" stroke-width="4"/><path d="M -24 -25 l 27 15 M -24 -9 l 27 15 M 14 -9 l 25 -14" stroke="${gleam}" opacity=".23"/>${tower(42, 17, 83, palette)}${tower(-10, -32, 103, palette)}<g class="flame"><ellipse cx="-28" cy="4" rx="5" ry="9" fill="#e3bc6c"/><ellipse cx="-28" cy="4" rx="2" ry="5" fill="#fff0b8"/></g><path d="M -28 12 v 9" stroke="#9b895a" stroke-width="2"/><path d="M -11 40 l 17 -9 l 12 7 l -17 10" fill="#8ba28b"/><path d="M -6 50 l 17 -9 l 12 7 l -17 10" fill="#718f79"/></g>`;
    }

/** Decorative SVG uses only the fixed palette and geometry, with no user-supplied markup. */
export function journeyScenery(palette: JourneyPalette, next: JourneyPalette): string {
    const lights = [[78, 113], [474, 317], [155, 373], [340, 84], [575, 226], [516, 515], [373, 493], [72, 457]];
    return foliage(183, 181, .68) + foliage(51, 266, .66) + castle(110, 294, palette)
        + foliage(547, 373, .98) + foliage(503, 427, .78) + foliage(569, 435, .62)
        + foliage(37, 430, .76) + foliage(360, 535, .42)
        + crystal(490, 489, 47, 17, palette) + crystal(520, 497, 29, 11, palette)
        + crystal(51, 345, 36, 13, palette) + crystal(557, 262, 24, 9, next)
        + lights.map(([x = 0, y = 0]) => '<path d="M ' + (x - 2) + ' ' + y + ' h 4 M ' + x + ' ' + (y - 2) + ' v 4" stroke="#d7e1b8" stroke-width="1" opacity=".45"/>').join('');
}
