/* Motion layer: thin wrappers that fit the Magic UI effects (src/components/ui)
   into the Astryx pages and theme tokens. */

import {useEffect, useState, type ReactNode} from 'react';
import {Text} from '@astryxdesign/core/Text';
import {HyperText} from '@/components/ui/hyper-text';
import {BlurFade} from '@/components/ui/blur-fade';
import {BorderBeam} from '@/components/ui/border-beam';
import {FlickeringGrid} from '@/components/ui/flickering-grid';
import {ScrollProgress} from '@/components/ui/scroll-progress';
import {useLang} from './i18n';
import {cn} from '@/lib/utils';

/** Reads a theme token as a concrete rgb() colour, and re-reads it when the light/dark mode flips.
    Tokens are often `light-dark(a, b)`, which canvas and three.js can't parse, so the value is
    resolved by painting it on a hidden probe and reading back the computed colour. */
export function useTokenColor(token: string, fallback: string) {
  const [color, setColor] = useState(fallback);
  useEffect(() => {
    const root = document.querySelector('[data-astryx-theme]') ?? document.documentElement;
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;width:0;height:0;overflow:hidden;color:var(${token})`;
    probe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(probe);
    const read = () => {
      const value = getComputedStyle(probe).color;
      if (value) setColor(value);
    };
    read();
    // The mode attribute changes before styles settle; read again on the next frame too.
    const onChange = () => {
      read();
      requestAnimationFrame(read);
    };
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme', 'style', 'class']});
    if (root !== document.documentElement) observer.observe(root, {attributes: true, attributeFilter: ['data-theme']});
    return () => {
      observer.disconnect();
      probe.remove();
    };
  }, [token]);
  return color;
}

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+<>/'.split('');

/** Display heading that decodes itself like a game HUD when it scrolls into view and on hover. */
export function ScrambleTitle({
  text,
  as = 'h2',
  size = 'section',
  id,
  isName = false,
  className,
}: {
  text: string;
  as?: 'h1' | 'h2' | 'h3' | 'p';
  size?: 'hero' | 'section' | 'contact';
  /** Anchor target for the top-bar links (#work, #about…). */
  id?: string;
  /** Proper names (project titles) keep English casing rules in both languages: "Line" → "LINE", not "LİNE". */
  isName?: boolean;
  className?: string;
}) {
  const {lang} = useLang();
  const upper = text.toLocaleUpperCase(lang === 'tr' && !isName ? 'tr-TR' : 'en-US');
  // HyperText spreads extra props onto its element; id + scroll offset ride along.
  const anchorProps = id ? ({id, style: {scrollMarginTop: 'calc(var(--spacing-10) * 2)'}} as object) : {};
  return (
    <HyperText
      key={upper}
      {...anchorProps}
      as={as}
      startOnView
      duration={900}
      characterSet={SCRAMBLE_CHARS}
      className={cn(
        'py-0 font-heading font-bold tracking-tight text-primary [&>span]:font-heading',
        size === 'hero' && 'text-[clamp(2.75rem,10vw,8.5rem)] leading-[0.88]',
        size === 'section' && 'text-[clamp(2.5rem,7vw,6.5rem)] leading-[0.9] tracking-[-0.03em]',
        size === 'contact' && 'text-[clamp(2.25rem,7vw,6rem)] leading-[0.95] text-center',
        className,
      )}>
      {upper}
    </HyperText>
  );
}

/** Small mono label above a section: "01 — WORK". */
export function Eyebrow({index, label, keepCase = false}: {index?: string; label: string; keepCase?: boolean}) {
  const {lang} = useLang();
  return (
    <Text type="code" color="accent" weight="semibold">
      {index ? `${index} — ` : '// '}
      {keepCase ? label : label.toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en-US')}
    </Text>
  );
}

/** Fades and un-blurs its children when they scroll into view. */
export function Reveal({children, delay = 0, className}: {children: ReactNode; delay?: number; className?: string}) {
  return (
    <BlurFade inView direction="up" offset={12} delay={delay} duration={0.5} className={className}>
      {children}
    </BlurFade>
  );
}

/** A light beam that travels around the edge of whatever it wraps. */
export function Beam({children}: {children: ReactNode}) {
  const accent = useTokenColor('--color-accent', 'currentColor');
  return (
    <div className="relative rounded-(--radius-container)">
      {children}
      <BorderBeam size={120} duration={7} borderWidth={2} colorFrom={accent} colorTo="transparent" />
    </div>
  );
}

/** Panel with a flickering pixel grid behind its content. */
export function PixelPanel({
  children,
  className,
  isBare = false,
}: {
  children: ReactNode;
  className?: string;
  /** No border or rounded box: the grid just bleeds behind the content. */
  isBare?: boolean;
}) {
  const accent = useTokenColor('--color-accent', 'gray');
  return (
    <div
      className={cn(
        'relative isolate overflow-hidden',
        !isBare && 'rounded-(--radius-container) border border-border',
        className,
      )}>
      <FlickeringGrid
        className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_75%)]"
        squareSize={4}
        gridGap={6}
        color={accent}
        maxOpacity={0.28}
        flickerChance={0.12}
      />
      {children}
    </div>
  );
}

/** Thin accent bar at the top of the window that tracks scroll position. */
export function PageProgress() {
  return <ScrollProgress className="h-0.5 bg-accent-bg bg-none" />;
}
