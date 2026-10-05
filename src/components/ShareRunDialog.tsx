import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Coins, Copy, Download, ExternalLink, Flame, Footprints, Layers3, Swords, Trophy } from 'lucide-react';
import type { PlayerProfile } from '../game/playerProfile';
import { QUALITY_LABELS, QUALITY_ORDER } from '../game/run';
import { shareRunText, type ShareRunData, type ShareStatIcon } from '../game/shareRun';
import { PlayerRow } from './PlayerRow';
import './ProfileEditor.css';
import './ShareRunDialog.css';

const STAT_ICONS = { floors: Layers3, moves: Footprints, coins: Coins, streak: Flame, games: Swords } satisfies Record<ShareStatIcon, unknown>;
const CARD_STYLES = [
    { id: 'profile', name: 'Player card', description: 'Your banner, your score, your run.' },
    { id: 'spotlight', name: 'Spotlight', description: 'Put your score in the spotlight.' },
    { id: 'decisions', name: 'Decision breakdown', description: 'Show how you played, move by move.' },
] as const;
type CardStyle = (typeof CARD_STYLES)[number]['id'];
interface PreparedImage { file: File; url: string }

export function RunShareCard({ result, profile, url, style = 'profile' }: { result: ShareRunData; profile: PlayerProfile; url: string; style?: CardStyle }) {
    const score = result.score.toLocaleString();
    const scoreSize = style === 'decisions' ? score.length > 12 ? 24 : score.length > 9 ? 32 : 44
        : score.length > 12 ? 40 : score.length > 9 ? 52 : 76;
    const decisions = <dl className="run-share-decisions" aria-label="Decision counts">{QUALITY_ORDER.map(quality =>
        <div key={quality} className={`run-share-quality-${quality}`}><dt>{QUALITY_LABELS[quality]}</dt><dd>{result.decisionCounts[quality].toLocaleString()}</dd></div>
    )}</dl>;
    return <article className={`run-share-card run-share-style-${style}`} aria-label={`${result.modeLabel} run card`}>
        <PlayerRow profile={profile} showRank={false} label="Player identity" />
        <div className="run-share-body">
            <div className="run-share-meta"><strong>{result.modeLabel}</strong><span>{result.date}</span></div>
            <div className="run-share-highlight"><div className="run-share-outcome">{result.outcome}</div>
            <div className="run-share-score" style={{ fontSize: scoreSize }}>
                {score}
            </div>
            <span className="run-share-score-label">{result.scoreLabel}</span>
            <div className="run-share-best">{result.personalBest && <><Trophy size={15} aria-hidden="true" />Personal best</>}</div>
            </div>
            {style === 'decisions' && decisions}
            {result.stats.length > 0 && <dl className="run-share-stats">{result.stats.map(stat => {
                const Icon = STAT_ICONS[stat.icon];
                return <div key={stat.label}><dt><Icon size={23} aria-hidden="true" /><span>{stat.label}</span></dt><dd>{stat.value}</dd></div>;
            })}</dl>}
            {style !== 'decisions' && decisions}
        </div>
        <footer className="run-share-brand"><div><img src={`${import.meta.env.BASE_URL}knight.svg`} width="19" height="21" alt="" /><strong>Knightfall</strong></div>
            <span>{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
        </footer>
    </article>;
}

export function gameShareUrl(): string {
    return document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content
        || new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

export function ShareRunDialog({ result, profile }: { result: ShareRunData; profile: PlayerProfile }) {
    const cards = useRef<Partial<Record<CardStyle, HTMLDivElement | null>>>({});
    const carousel = useRef<HTMLDivElement>(null);
    const slides = useRef<(HTMLDivElement | null)[]>([]);
    const imageCache = useRef(new Map<CardStyle, PreparedImage>());
    const [selected, setSelected] = useState(0);
    const style = CARD_STYLES[selected]!;
    const [scale, setScale] = useState(1);
    const [images, setImages] = useState<Partial<Record<CardStyle, PreparedImage>>>({});
    const image = images[style.id];
    const file = image?.file;
    const imageUrl = image?.url;
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [manualCopy, setManualCopy] = useState(false);
    const url = gameShareUrl();
    const text = shareRunText(result, profile.displayName, url);
    // PNG support is a browser capability, independent of the selected card's readiness.
    const [canShareImage] = useState(() => typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
        && navigator.canShare({ files: [new File([], 'knightfall.png', { type: 'image/png' })] }));

    useEffect(() => {
        const element = carousel.current!;
        const measure = () => setScale(Math.min(1, element.clientWidth / 540));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const cache = imageCache.current;
        setImages({});
        return () => { cache.forEach(image => URL.revokeObjectURL(image.url)); cache.clear(); };
    }, [result, profile]);

    useEffect(() => {
        let canceled = false;
        setError(''); setMessage('');
        if (imageCache.current.has(style.id)) return;
        void (async () => {
            try {
                // Export only the fixed-size card, after its fonts and avatar are ready.
                const { toBlob } = await import('html-to-image');
                await document.fonts?.ready;
                if (canceled) return;
                const card = cards.current[style.id]!;
                await Promise.all(Array.from(card.querySelectorAll('img')).map(img => img.decode()));
                if (canceled) return;
                const blob = await toBlob(card.firstElementChild as HTMLElement, {
                    width: 540, height: 540, pixelRatio: 2, backgroundColor: style.id === 'spotlight' ? '#16392f' : '#fafbf9',
                    // The card uses system fonts; don't traverse unrelated webfont stylesheets.
                    skipFonts: true,
                });
                if (canceled) return;
                if (!blob) throw new Error('No image was produced.');
                const generated = new File([blob], `knightfall-${result.mode}-${result.id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48)}-${style.id}.png`, { type: 'image/png' });
                const prepared = { file: generated, url: URL.createObjectURL(generated) };
                imageCache.current.set(style.id, prepared);
                setImages(previous => ({ ...previous, [style.id]: prepared }));
            } catch {
                if (!canceled) setError('Could not create the image. Try again or copy your result as text.');
            }
        })();
        return () => { canceled = true; };
    }, [result, profile, attempt, style.id]);

    const selectStyle = (index: number) => {
        if (busy) return;
        setSelected(index);
        carousel.current?.scrollTo({ left: slides.current[index]?.offsetLeft ?? 0, behavior: 'auto' });
    };

    const share = async () => {
        if (!file || busy) return;
        setBusy(true); setMessage('');
        try {
            // The PNG is already ready, so share() runs directly from this user gesture.
            await navigator.share({ files: [file], title: `Knightfall · ${result.modeLabel}` });
        } catch (cause) {
            if (!(cause instanceof DOMException && cause.name === 'AbortError')) setMessage('Sharing is unavailable here. Use Save image instead.');
        } finally { setBusy(false); }
    };
    const save = () => {
        if (!imageUrl || !file) return;
        const link = document.createElement('a');
        link.href = imageUrl; link.download = file.name;
        document.body.appendChild(link); link.click(); link.remove();
    };
    const copy = async () => {
        try { await navigator.clipboard.writeText(text); setMessage('Result copied.'); setManualCopy(false); }
        catch { setManualCopy(true); setMessage('Select and copy your result below.'); }
    };

    return <div className="share-run-dialog">
        <h2 id="share-run-title">Share your run</h2>
        <p className="share-run-intro">Swipe through the cards to choose your style.</p>
        <div className="share-run-carousel" ref={carousel} role="region" aria-label="Run card styles" aria-roledescription="carousel" tabIndex={0} inert={busy}
            onScroll={() => {
                if (busy) return;
                const left = carousel.current!.scrollLeft;
                const closest = slides.current.reduce((best, slide, index) =>
                    Math.abs((slide?.offsetLeft ?? 0) - left) < Math.abs((slides.current[best]?.offsetLeft ?? 0) - left) ? index : best, 0);
                setSelected(closest);
            }}
            onKeyDown={event => {
                const index = event.key === 'ArrowLeft' ? Math.max(0, selected - 1) : event.key === 'ArrowRight' ? Math.min(CARD_STYLES.length - 1, selected + 1)
                    : event.key === 'Home' ? 0 : event.key === 'End' ? CARD_STYLES.length - 1 : null;
                if (index === null) return;
                event.preventDefault(); selectStyle(index);
            }}>
            {CARD_STYLES.map((option, index) => <div className="share-run-slide" key={option.id} ref={element => { slides.current[index] = element; }}
                role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${CARD_STYLES.length}: ${option.name}`} aria-hidden={index !== selected} inert={index !== selected}>
                <div className="share-run-preview">
                    <div ref={element => { cards.current[option.id] = element; }} className="share-run-scaled" style={{ transform: `scale(${scale})` }}>
                        <RunShareCard result={result} profile={profile} url={url} style={option.id} />
                    </div>
                    {images[option.id] && <img className="share-run-image" src={images[option.id]!.url} alt="" aria-hidden="true" />}
                </div>
            </div>)}
        </div>
        <div className="share-run-style-picker">
            <button className="share-run-style-arrow" aria-label="Previous card style" disabled={selected === 0 || busy} onClick={() => selectStyle(selected - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
            <div className="share-run-style-caption" aria-live="polite"><strong>{style.name}</strong><span>{style.description}</span></div>
            <button className="share-run-style-arrow" aria-label="Next card style" disabled={selected === CARD_STYLES.length - 1 || busy} onClick={() => selectStyle(selected + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
        <div className="share-run-style-dots" role="group" aria-label="Choose card style">
            {CARD_STYLES.map((option, index) => <button key={option.id} aria-label={`Use ${option.name} style`} aria-pressed={index === selected} disabled={busy} onClick={() => selectStyle(index)}><span /></button>)}
        </div>
        <div className="share-run-actions">
            {canShareImage && <button className="primary-small" disabled={!file || busy} onClick={() => void share()}><ExternalLink size={17} aria-hidden="true" />Share</button>}
            <button className={canShareImage ? 'text-button' : 'primary-small'} disabled={!file || busy} onClick={save}><Download size={17} aria-hidden="true" />Save image</button>
            <button className="text-button" onClick={() => void copy()}><Copy size={17} aria-hidden="true" />Copy text</button>
        </div>
        {error && <div className="share-run-status" role="alert"><p>{error}</p><button className="text-button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
        {message && <p className="share-run-status" role="status">{message}</p>}
        {manualCopy && <textarea className="share-run-copy" aria-label="Run result text" value={text} readOnly onFocus={event => event.currentTarget.select()} autoFocus />}
    </div>;
}
