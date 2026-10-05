import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeneratedLevel } from '../types/level';
import type { MultiplierBoard } from './multipliers';
import type { PieceSetId } from './pieceSets';
import type { RunRules, RunState } from './run';
import {
    createDailyDungeon, DAILY_STORAGE_KEY, enterDailyDungeon, expireDailyDungeon, loadDailyArchive, recordDailyRun,
    restoreDailyRun, saveDailyArchive, storeDailyDungeon, utcDay, type DailyArchive,
} from './daily';

export function useDailyDungeon(pool: readonly GeneratedLevel[]) {
    const [now, setNow] = useState(Date.now);
    const [archive, setArchive] = useState(() => {
        const saved = loadDailyArchive(pool);
        const day = utcDay(Date.now());
        return pool.length && !saved.days[day] ? storeDailyDungeon(saved, createDailyDungeon(pool)) : saved;
    });
    const latest = useRef(archive);
    const [persisted, setPersisted] = useState(true);
    const [expired, setExpired] = useState<{ day: string; id: string } | null>(null);

    const commit = useCallback((next: DailyArchive) => {
        latest.current = next;
        setArchive(next);
        setPersisted(saveDailyArchive(next));
    }, []);

    const refresh = useCallback(() => {
        const time = Date.now();
        setNow(time);
        let next = latest.current;
        for (const dungeon of Object.values(next.days)) {
            const updated = expireDailyDungeon(dungeon, time);
            if (updated !== dungeon) {
                next = storeDailyDungeon(next, updated);
                setExpired({ day: dungeon.day, id: dungeon.attempt!.id });
            }
        }
        const day = utcDay(time);
        if (pool.length && !next.days[day]) next = storeDailyDungeon(next, createDailyDungeon(pool, time));
        if (next !== latest.current) commit(next);
    }, [pool, commit]);

    useEffect(() => {
        setPersisted(saveDailyArchive(latest.current));
        refresh();
        const timer = window.setInterval(refresh, 1000);
        const synchronize = (event: StorageEvent) => {
            if (event.key !== DAILY_STORAGE_KEY) return;
            const saved = loadDailyArchive(pool);
            latest.current = saved;
            setArchive(saved);
            refresh();
        };
        window.addEventListener('focus', refresh);
        window.addEventListener('storage', synchronize);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('storage', synchronize);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [refresh]);

    const begin = useCallback((set: PieceSetId, rules: RunRules, board: MultiplierBoard): RunState => {
        refresh();
        // Check storage again so a second tab cannot start another attempt after entry.
        const stored = loadDailyArchive(pool);
        const day = utcDay(Date.now());
        const dungeon = stored.days[day]?.attempt ? stored.days[day]! : latest.current.days[day]!;
        const entered = enterDailyDungeon(dungeon, set, rules, board);
        const initial = recordDailyRun(entered.dungeon, entered.run);
        commit(storeDailyDungeon(latest.current, initial));
        return entered.run;
    }, [pool, refresh, commit]);

    const update = useCallback((run: RunState): boolean => {
        if (!run.daily) return true;
        const dungeon = latest.current.days[run.daily.day];
        if (!dungeon || dungeon.attempt?.id !== run.id) return false;
        const next = recordDailyRun(dungeon, run);
        if (next !== dungeon) commit(storeDailyDungeon(latest.current, next));
        if (next.attempt?.status === 'expired') {
            setExpired({ day: next.day, id: run.id });
            return false;
        }
        return true;
    }, [commit]);

    const resume = useCallback((): RunState | null => {
        refresh();
        const dungeon = latest.current.days[utcDay(Date.now())];
        return dungeon?.attempt?.status === 'active' ? restoreDailyRun(dungeon) : null;
    }, [refresh]);

    const clearExpiration = useCallback(() => setExpired(null), []);
    const reset = useCallback((): string => {
        const time = Date.now();
        const day = utcDay(time);
        const dungeon = latest.current.days[day] ?? (pool.length ? createDailyDungeon(pool, time) : null);
        if (!dungeon) throw new Error('No daily dungeon available to reset.');
        const next = storeDailyDungeon(latest.current, { ...dungeon, attempt: null });
        // Entry checks storage again, so the reset must be saved before allowing a retry.
        if (!saveDailyArchive(next)) throw new Error('Could not save the daily dungeon reset. Browser storage is unavailable.');
        latest.current = next;
        setArchive(next);
        setPersisted(true);
        setNow(time);
        setExpired(null);
        return day;
    }, [pool]);

    return { archive, today: archive.days[utcDay(now)], now, persisted, expired, begin, update, resume, clearExpiration, reset };
}
