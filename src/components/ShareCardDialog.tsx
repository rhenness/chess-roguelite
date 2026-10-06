import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, ExternalLink } from 'lucide-react';
import './ShareRunDialog.css';

export interface ShareCardStyle {
    id: string;
    name: string;
    description?: string;
    backgroundColor?: string;
    card: ReactNode;
}
interface PreparedImage { file: File; url: string }

export function gameShareUrl(): string {
    return document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content
        || new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

export function ShareCardDialog({ cards: cardStyles, titleId, title, subject, fileName, shareTitle, text }: {
    cards: readonly ShareCardStyle[]; titleId: string; title: string; subject: 'run' | 'profile';
    fileName: string; shareTitle: string; text: string;
}) {
    const cards = useRef<Partial<Record<string, HTMLDivElement | null>>>({});
    const carousel = useRef<HTMLDivElement>(null);
    const slides = useRef<(HTMLDivElement | null)[]>([]);
    const imageCache = useRef(new Map<string, PreparedImage>());
    const [selected, setSelected] = useState(0);
    const style = cardStyles[selected]!;
    const [scale, setScale] = useState(1);
    const [images, setImages] = useState<Partial<Record<string, PreparedImage>>>({});
    const image = images[style.id];
    const file = image?.file;
    const imageUrl = image?.url;
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [manualCopy, setManualCopy] = useState(false);
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
    }, [cardStyles]);

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
                    width: 540, height: 540, pixelRatio: 2, backgroundColor: style.backgroundColor ?? '#fafbf9',
                    // The card uses system fonts; don't traverse unrelated webfont stylesheets.
                    skipFonts: true,
                });
                if (canceled) return;
                if (!blob) throw new Error('No image was produced.');
                const generated = new File([blob], `knightfall-${fileName}-${style.id}.png`, { type: 'image/png' });
                const prepared = { file: generated, url: URL.createObjectURL(generated) };
                imageCache.current.set(style.id, prepared);
                setImages(previous => ({ ...previous, [style.id]: prepared }));
            } catch {
                if (!canceled) setError(`Could not create the image. Try again or copy your ${subject === 'profile' ? 'profile' : 'result'} as text.`);
            }
        })();
        return () => { canceled = true; };
    }, [cardStyles, fileName, attempt, style.id]);

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
            await navigator.share({ files: [file], title: shareTitle });
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
        try { await navigator.clipboard.writeText(text); setMessage(subject === 'profile' ? 'Profile copied.' : 'Result copied.'); setManualCopy(false); }
        catch { setManualCopy(true); setMessage(`Select and copy your ${subject === 'profile' ? 'profile' : 'result'} below.`); }
    };

    const multipleStyles = cardStyles.length > 1;
    return <div className={`share-run-dialog${multipleStyles ? '' : ' share-profile-dialog'}`}>
        <h2 id={titleId}>{title}</h2>
        {multipleStyles && <p className="share-run-intro">Swipe through the cards to choose your style.</p>}
        <div className="share-run-carousel" ref={carousel} role="region" aria-label={multipleStyles ? 'Run card styles' : 'Profile card preview'} aria-roledescription={multipleStyles ? 'carousel' : undefined} tabIndex={multipleStyles ? 0 : undefined} inert={busy}
            onScroll={() => {
                if (busy) return;
                const left = carousel.current!.scrollLeft;
                const closest = slides.current.reduce((best, slide, index) =>
                    Math.abs((slide?.offsetLeft ?? 0) - left) < Math.abs((slides.current[best]?.offsetLeft ?? 0) - left) ? index : best, 0);
                setSelected(closest);
            }}
            onKeyDown={event => {
                const index = event.key === 'ArrowLeft' ? Math.max(0, selected - 1) : event.key === 'ArrowRight' ? Math.min(cardStyles.length - 1, selected + 1)
                    : event.key === 'Home' ? 0 : event.key === 'End' ? cardStyles.length - 1 : null;
                if (index === null) return;
                event.preventDefault(); selectStyle(index);
            }}>
            {cardStyles.map((option, index) => <div className="share-run-slide" key={option.id} ref={element => { slides.current[index] = element; }}
                role={multipleStyles ? 'group' : undefined} aria-roledescription={multipleStyles ? 'slide' : undefined} aria-label={multipleStyles ? `${index + 1} of ${cardStyles.length}: ${option.name}` : undefined} aria-hidden={index !== selected} inert={index !== selected}>
                <div className="share-run-preview">
                    <div ref={element => { cards.current[option.id] = element; }} className="share-run-scaled" style={{ transform: `scale(${scale})` }}>
                        {option.card}
                    </div>
                    {images[option.id] && <img className="share-run-image" src={images[option.id]!.url} alt="" aria-hidden="true" />}
                </div>
            </div>)}
        </div>
        {multipleStyles && <><div className="share-run-style-picker">
            <button className="share-run-style-arrow" aria-label="Previous card style" disabled={selected === 0 || busy} onClick={() => selectStyle(selected - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
            <div className="share-run-style-caption" aria-live="polite"><strong>{style.name}</strong><span>{style.description}</span></div>
            <button className="share-run-style-arrow" aria-label="Next card style" disabled={selected === cardStyles.length - 1 || busy} onClick={() => selectStyle(selected + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
        <div className="share-run-style-dots" role="group" aria-label="Choose card style">
            {cardStyles.map((option, index) => <button key={option.id} aria-label={`Use ${option.name} style`} aria-pressed={index === selected} disabled={busy} onClick={() => selectStyle(index)}><span /></button>)}
        </div>
        </>}
        <div className="share-run-actions">
            {canShareImage && <button className="primary-small" disabled={!file || busy} onClick={() => void share()}><ExternalLink size={17} aria-hidden="true" />Share</button>}
            <button className={canShareImage ? 'text-button' : 'primary-small'} disabled={!file || busy} onClick={save}><Download size={17} aria-hidden="true" />Save image</button>
            <button className="text-button" onClick={() => void copy()}><Copy size={17} aria-hidden="true" />Copy text</button>
        </div>
        {error && <div className="share-run-status" role="alert"><p>{error}</p><button className="text-button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
        {message && <p className="share-run-status" role="status">{message}</p>}
        {manualCopy && <textarea className="share-run-copy" aria-label={subject === 'profile' ? 'Profile text' : 'Run result text'} value={text} readOnly onFocus={event => event.currentTarget.select()} autoFocus />}
    </div>;
}
