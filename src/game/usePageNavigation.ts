import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type Page = 'play' | 'regular' | 'regular-items' | 'daily' | 'profile' | 'leaderboards' | 'game' | 'endless' | 'endless-items' | 'endless-game';
export interface PageLocation { page: Page; day?: string }

function readLocation(): PageLocation {
    const match = /^#\/(play|regular|regular-items|daily|profile|leaderboards|game|endless|endless-items|endless-game)(?:\/(\d{4}-\d{2}-\d{2}))?$/.exec(window.location.hash);
    return match ? { page: match[1] as Page, day: match[1] === 'daily' ? match[2] : undefined } : { page: 'play' };
}

export function usePageNavigation() {
    const [location, setLocation] = useState(readLocation);
    const current = useRef(location);
    const scroll = useRef(new Map<string, { top: number; regions: Record<string, number> }>());
    const content = useRef<HTMLDivElement>(null);
    const key = (value: PageLocation) => `${value.page}/${value.day ?? ''}`;
    const rememberScroll = () => {
        const element = content.current;
        scroll.current.set(key(current.current), {
            top: element?.scrollTop ?? 0,
            regions: Object.fromEntries(Array.from(element?.querySelectorAll<HTMLElement>('[data-page-scroll]') ?? [])
                .map(region => [region.dataset.pageScroll!, region.scrollTop])),
        });
    };

    const navigate = useCallback((next: PageLocation, replace = false) => {
        rememberScroll();
        const hash = `#/${next.page}${next.page === 'daily' && next.day ? `/${next.day}` : ''}`;
        if (window.location.hash !== hash) window.history[replace ? 'replaceState' : 'pushState'](null, '', hash);
        current.current = next;
        setLocation(next);
    }, []);

    useEffect(() => {
        const synchronize = () => {
            const next = readLocation();
            if (key(next) === key(current.current)) return;
            rememberScroll();
            current.current = next;
            setLocation(next);
        };
        window.addEventListener('popstate', synchronize);
        window.addEventListener('hashchange', synchronize);
        return () => {
            window.removeEventListener('popstate', synchronize);
            window.removeEventListener('hashchange', synchronize);
        };
    }, []);

    useLayoutEffect(() => {
        if (!content.current) return;
        const saved = scroll.current.get(key(location));
        content.current.scrollTop = saved?.top ?? 0;
        content.current.querySelectorAll<HTMLElement>('[data-page-scroll]').forEach(region => {
            region.scrollTop = saved?.regions[region.dataset.pageScroll!] ?? 0;
        });
        content.current.querySelector<HTMLElement>('[data-page-focus]')?.focus({ preventScroll: true });
    }, [location.page, location.day]);

    return { location, navigate, content };
}
