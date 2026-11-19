/* Editorial layer: the pieces that make the site read like a designer's
   portfolio — custom cursor, film grain, outline type, the hover-preview
   project index and the closing wordmark. Built on motion + Tailwind, with
   every colour taken from the Astryx theme tokens. */

import {useEffect, useState} from 'react';
import {AnimatePresence, motion, useMotionValue, useSpring} from 'motion/react';
import {Text} from '@astryxdesign/core/Text';
import {useLang, UI} from './i18n';
import {projectHref} from './router';
import type {Project} from './data';
import {cn} from '@/lib/utils';

const finePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── Cursor ─────────────────────────────────────────────────────────────────

/** A dot that trails the pointer and opens into a labelled disc over anything
    marked data-cursor="…". Mouse/trackpad only; the native cursor stays. */
export function CustomCursor() {
  const [enabled] = useState(() => finePointer() && !reducedMotion());
  const [label, setLabel] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, {stiffness: 500, damping: 40, mass: 0.4});
  const sy = useSpring(y, {stiffness: 500, damping: 40, mass: 0.4});

  useEffect(() => {
    if (!enabled) return;
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setVisible(true);
      const target = (e.target as Element | null)?.closest('[data-cursor]');
      setLabel(target ? target.getAttribute('data-cursor') : null);
    };
    const leave = () => setVisible(false);
    // Content moves under a still pointer while scrolling: re-check what it is over.
    const rescan = () => {
      const el = document.elementFromPoint(x.get(), y.get());
      const target = el?.closest('[data-cursor]');
      setLabel(target ? target.getAttribute('data-cursor') : null);
    };
    window.addEventListener('scroll', rescan, {passive: true});
    window.addEventListener('pointermove', move);
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('scroll', rescan);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[70] flex items-center justify-center rounded-full bg-accent-bg font-mono text-xs font-semibold tracking-widest text-body uppercase"
      style={{x: sx, y: sy, translateX: '-50%', translateY: '-50%'}}
      animate={{width: label ? 88 : 10, height: label ? 88 : 10, opacity: visible ? 1 : 0}}
      transition={{type: 'spring', stiffness: 400, damping: 30}}>
      <AnimatePresence>
        {label && (
          <motion.span initial={{opacity: 0, scale: 0.6}} animate={{opacity: 1, scale: 1}} exit={{opacity: 0}}>
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Grain ──────────────────────────────────────────────────────────────────

const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Fixed film-grain overlay across the whole page. */
export function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] opacity-[0.07] mix-blend-overlay"
      style={{backgroundImage: NOISE}}
    />
  );
}

// ─── Type ───────────────────────────────────────────────────────────────────

/** Hollow, outlined display type. */
export function Outline({children, className}: {children: string; className?: string}) {
  return (
    <span
      className={cn(
        'text-transparent [-webkit-text-stroke:1.5px_var(--color-text-primary)] md:[-webkit-text-stroke:2px_var(--color-text-primary)]',
        className,
      )}>
      {children}
    </span>
  );
}

/** Line of display type that slides up from behind a mask when it enters view. */
export function RiseLine({
  children,
  delay = 0,
  className,
  isOnMount = false,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  /** Play on page load instead of on scroll-into-view (for above-the-fold type inside clipped frames). */
  isOnMount?: boolean;
}) {
  const play = isOnMount ? {animate: {y: '0%'}} : {whileInView: {y: '0%'}, viewport: {once: true}};
  return (
    <span className={cn('-mt-[0.22em] block overflow-hidden pt-[0.22em] pb-[0.06em]', className)}>
      <motion.span
        className="block"
        initial={{y: '105%'}}
        {...play}
        transition={{duration: 0.9, delay, ease: [0.16, 1, 0.3, 1]}}>
        {children}
      </motion.span>
    </span>
  );
}

/** The closing signature: the name, edge to edge. */
export function Wordmark() {
  return (
    <p
      aria-hidden
      className="font-heading text-[clamp(3rem,13.5vw,15rem)] leading-[0.82] font-bold tracking-[-0.04em] text-primary select-none">
      <RiseLine>BUĞRAHAN</RiseLine>
      <RiseLine delay={0.1}>
        <Outline>DEVECİ</Outline>
        <span className="text-accent">.</span>
      </RiseLine>
    </p>
  );
}

// ─── Project index ──────────────────────────────────────────────────────────

/** Big editorial list of projects. On a mouse, the hovered row's cover floats
    beside the cursor; on touch, each row shows a small thumbnail instead. */
export function ProjectIndex({projects, startAt = 1}: {projects: Project[]; startAt?: number}) {
  const {tx} = useLang();
  const [active, setActive] = useState<Project | null>(null);
  const [fine] = useState(finePointer);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, {stiffness: 220, damping: 26});
  const sy = useSpring(y, {stiffness: 220, damping: 26});

  return (
    <div
      className="relative border-t border-border"
      onPointerMove={e => {
        x.set(e.clientX);
        y.set(e.clientY);
      }}
      onPointerLeave={() => setActive(null)}>
      {projects.map((p, i) => (
        <a
          key={p.id}
          href={projectHref(p.id)}
          data-cursor={tx(UI.cursorOpen)}
          onPointerEnter={() => setActive(p)}
          onFocus={() => setActive(p)}
          onBlur={() => setActive(null)}
          className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-b border-border py-5 text-primary no-underline outline-none focus-visible:bg-muted md:grid-cols-[4rem_1fr_auto_auto] md:gap-8 md:py-7">
          <span className="font-mono text-xs text-secondary md:text-sm">{String(startAt + i).padStart(2, '0')}</span>
          <span className="flex min-w-0 items-center gap-4">
            {!fine && p.cover && (
              <img src={p.cover} alt="" className="h-12 w-16 shrink-0 rounded-(--radius-element) object-cover" loading="lazy" />
            )}
            <span className="truncate font-heading text-[clamp(1.6rem,4.6vw,4.25rem)] leading-none font-bold tracking-tight transition-[transform,color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-3 group-hover:text-accent group-focus-visible:text-accent">
              {p.title}
            </span>
          </span>
          <span className="hidden font-mono text-xs tracking-wider text-secondary uppercase md:block">
            {tx(p.studio)}
          </span>
          <span className="font-mono text-xs text-secondary md:text-sm">
            {p.year}
            <span className="ml-3 inline-block transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-accent">
              ↗
            </span>
          </span>
        </a>
      ))}

      {fine && (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed top-0 left-0 z-50 w-[min(26rem,32vw)] overflow-hidden rounded-(--radius-container) shadow-2xl"
          style={{x: sx, y: sy, translateX: '12%', translateY: '-60%'}}
          animate={{opacity: active ? 1 : 0, scale: active ? 1 : 0.85, rotate: active ? -3 : 0}}
          transition={{type: 'spring', stiffness: 260, damping: 24}}>
          <AnimatePresence mode="popLayout">
            {active && (
              <motion.div
                key={active.id}
                initial={{opacity: 0, scale: 1.08}}
                animate={{opacity: 1, scale: 1}}
                exit={{opacity: 0}}
                transition={{duration: 0.35}}
                className="aspect-[16/10] bg-muted">
                {active.cover ? (
                  <img
                    src={active.cover}
                    alt=""
                    className={cn('h-full w-full', active.coverFit === 'contain' ? 'object-contain' : 'object-cover')}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-accent-bg font-heading text-4xl font-bold text-body">
                    {active.title}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

/** Small mono meta cell for the hero's top row. */
export function Meta({label, value}: {label: string; value: React.ReactNode}) {
  return (
    <span className="flex flex-col gap-1">
      <Text type="code" color="secondary">
        {label}
      </Text>
      <Text type="code" weight="semibold">
        {value}
      </Text>
    </span>
  );
}
