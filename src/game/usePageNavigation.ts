import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type Page = 'play' | 'regular' | 'daily' | 'game';
export interface PageLocation { page: Page; day?: string }

function readLocation(): PageLocation {
    const match = /^#\/(play|regular|daily|game)(?:\/(\d{4}-\d{2}-\d{2}))?$/.exec(window.location.hash);
    return match ? { page: match[1] as Page, day: match[1] === 'daily' ? match[2] : undefined } : { page: 'play' };
}

export function usePageNavigation() {
    const [location, setLocation] = useState(readLocation);
    const current = useRef(location);
    const scroll = useRef(new Map<string, number>());
    const content = useRef<HTMLDivElement>(null);
    const key = (value: PageLocation) => `${value.page}/${value.day ?? ''}`;
    const rememberScroll = () => scroll.current.set(key(current.current), content.current?.scrollTop ?? 0);

    const navigate = useCallback((next: PageLocation, replace = false) => {
        rememberScroll();
        const hash = `#/${next.page}${next.page === 'daily' && next.day ? `/${next.day}` : ''}`;
        if (window.location.hash !== hash) window.history[replace ? 'replaceState' : 'pushState'](null, '', hash);
        current.current = next;
        setLocation(next);
    }, []);

    useEffect(() => {
        const synchronize = () => {
            rememberScroll();
            const next = readLocation();
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
        content.current.scrollTop = scroll.current.get(key(location)) ?? 0;
        content.current.querySelector<HTMLElement>('[data-page-focus]')?.focus({ preventScroll: true });
    }, [location.page, location.day]);

    return { location, navigate, content };
}
