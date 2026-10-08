/** Match the option buttons to the arrows' visible left-to-right order. */
export function orderMovesLeftToRight<T>(moves: readonly T[], uci: (move: T) => string, orientation: 'white' | 'black'): T[] {
    const direction = orientation === 'white' ? 1 : -1;
    return [...moves].sort((a, b) => {
        const first = uci(a);
        const second = uci(b);
        return direction * (first.charCodeAt(0) - second.charCodeAt(0)
            || first.charCodeAt(2) - second.charCodeAt(2));
    });
}
