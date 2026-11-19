/* Design 4 — "Magazine": an editorial, designer-portfolio take on a print
   games magazine. Oversized Fraunces serif with italic accents, a curtain-reveal
   cover with parallax and a spinning issue badge, an italic marquee, a sticky
   cover story, hover-zoom masonry, a scroll-lit column and a closing signature.
   Renders under the Astryx `chocolate` theme. The masonry container query is
   a plain <style> tag, as in the mixed-gallery template. */

import {useEffect, useRef, useState, type CSSProperties} from 'react';
import {motion, useScroll, useTransform} from 'motion/react';
import {VStack, HStack, Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Grid} from '@astryxdesign/core/Grid';
import {Divider} from '@astryxdesign/core/Divider';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';
import {Link} from '@astryxdesign/core/Link';
import {Token} from '@astryxdesign/core/Token';
import {Avatar} from '@astryxdesign/core/Avatar';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {ArrowTopRightOnSquareIcon} from '@heroicons/react/20/solid';
import {Marquee} from '@/components/ui/marquee';
import {SpinningText} from '@/components/ui/spinning-text';
import {TextReveal} from '@/components/ui/text-reveal';
import {UI, useLang, type L} from '../i18n';
import {projectHref} from '../router';
import {CONTACT, EXPERIENCE, PROJECTS, SKILLS, type Project} from '../data';
import {SiteFooter, anchorOffset, mediaClip} from '../components';
import {Reveal} from '../fx';
import {RiseLine} from '../designer';
import {cn} from '@/lib/utils';
import {Lazy3D, LiquidBlob, ProjectRing} from '../three/Lazy3D';
import type {RingItem} from '../three/ProjectRing';
import {HeroStage, ParticleField, WorldCanvas} from '../three/World';

// ─── Copy local to this design ──────────────────────────────────────────────

const M = {
  masthead: {tr: 'Buğrahan Deveci — Portfolyo', en: 'Buğrahan Deveci — The Portfolio'},
  issue: {tr: 'Sayı 01 · 2026', en: 'Issue 01 · 2026'},
  // Hero statement, three lines; the middle one is set in italic.
  line1: {tr: 'Hissettiren', en: 'I design'},
  line2: {tr: 'oyunlar', en: 'games you'},
  line3: {tr: 'tasarlıyorum.', en: 'can feel.'},
  deck: {
    tr: "fourKland'de oyun geliştirici. Bet Shop Simulator'dan Tidy Paws'a, bir oyunun elde nasıl hissettirdiğiyle uğraşıyorum: girdinin karşılığı, sistemin okunuşu, sahnenin tuttuğu dikkat.",
    en: "Game developer at fourKland. From Bet Shop Simulator to Tidy Paws, I work on how a game feels in the hand: how input lands, how a system reads, how a scene holds attention.",
  },
  byline: {tr: 'Yazı ve oyunlar: Buğrahan Deveci', en: 'Words and games by Buğrahan Deveci'},
  badge: {tr: 'SAYI 01 ✦ OYUN ✦ TASARIM ✦ 2026 ✦ ', en: 'ISSUE 01 ✦ GAMES ✦ DESIGN ✦ 2026 ✦ '},
  coverCaption: {tr: 'Kapak: Bet Shop Simulator, fourKland', en: 'Cover: Bet Shop Simulator, fourKland'},
  ticker: {
    tr: ['Oyun tasarımı', 'Arayüz', 'Sistemler', 'Seviye tasarımı', 'Etkileşim', 'Unity'],
    en: ['Game design', 'Interface', 'Systems', 'Level design', 'Interaction', 'Unity'],
  },
  featureKicker: {tr: 'Kapak konusu', en: 'Cover story'},
  pull: {
    tr: 'Gol dükkânı sallar, yatan kupon televizyonu kırdırır.',
    en: 'A goal shakes the shop. A losing slip costs you a TV.',
  },
  pullCite: {tr: 'Bet Shop Simulator, Steam', en: 'Bet Shop Simulator, on Steam'},
  readMore: {tr: 'Tüm hikâye', en: 'Read the full story'},
  galleryKicker: {tr: 'Portfolyo', en: 'Portfolio'},
  galleryTitle: {tr: 'Seçilmiş işler', en: 'Selected work'},
  mastheadKicker: {tr: 'Künye', en: 'Masthead'},
  mastheadTitle: {tr: 'Nerelerde çalıştım', en: 'Where I have worked'},
  columnKicker: {tr: 'Köşe yazısı', en: 'Column'},
  columnTitle: {tr: 'Neden oyun yapıyorum', en: 'Why I make games'},
  lettersKicker: {tr: 'Okur mektupları', en: 'Letters to the editor'},
  lettersTitle1: {tr: 'Bir merhaba', en: 'Say'},
  lettersTitle2: {tr: 'yeter.', en: 'hello.'},
  lettersBody: {
    tr: 'Oyun projeleri, etkileşimli işler ve iş birlikleri için mektuplarınızı bekliyorum.',
    en: 'Letters about game projects, interactive work and collaborations are always welcome.',
  },
  page: {tr: 's.', en: 'p.'},
  view: {tr: 'Aç', en: 'View'},
  ringHint: {tr: 'Sürükle, kaydır ya da bir kapağa tıkla', en: 'Drag, scroll or click a cover'},
  ringIdle: {tr: 'Tüm işler, üç boyutta', en: 'Every project, in three dimensions'},
  blobLabel: {tr: 'Fareye tepki veren sıvı 3D form', en: 'Liquid 3D form that follows the pointer'},
} satisfies Record<string, L | {tr: string[]; en: string[]}>;

// ─── Type ───────────────────────────────────────────────────────────────────

const DISPLAY = 'font-heading font-light tracking-[-0.035em] text-primary';
const ITALIC = 'italic font-normal text-accent';

// ─── Masonry (from the mixed-gallery template) ──────────────────────────────

const containerStyle: CSSProperties = {containerType: 'inline-size', containerName: 'magazine'};

const MASONRY_CSS = `
.magazine-grid {
  display: grid;
  gap: var(--spacing-8) var(--spacing-5);
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.magazine-wide { grid-column: span 2; }
@container magazine (max-width: 720px) {
  .magazine-grid { grid-template-columns: minmax(0, 1fr); }
  .magazine-wide { grid-column: 1 / -1; }
  .magazine-wide .astryx-aspect-ratio { aspect-ratio: 3 / 2; }
}
`;

const isWide = (i: number) => i % 4 === 0;

export function MagazineHome({anchor}: {anchor?: string}) {
  useEffect(() => {
    document.title = 'Buğrahan Deveci — Issue 01';
    if (anchor) document.getElementById(anchor)?.scrollIntoView({behavior: 'smooth'});
    else window.scrollTo({top: 0});
  }, [anchor]);

  return (
    <>
    {/* The 3D layer: one fixed canvas behind the page, plus page-wide dust. */}
    <WorldCanvas />
    <ParticleField />
    <div className="relative z-10">
    <Layout
      height="auto"
      contentWidth={1320}
      content={
        <LayoutContent padding={6} isScrollable={false}>
          <style>{MASONRY_CSS}</style>
          <VStack gap={10} style={containerStyle}>
            <Cover />
            <Ticker />
            <CoverStory />
            <Gallery />
            <Masthead />
            <Column />
            <Letters />
            <Signature />
            <SiteFooter />
          </VStack>
        </LayoutContent>
      }
    />
    </div>
    </>
  );
}

// ─── Cover: masthead, then a full-height video with the manifesto over it ───

const COVER_CLIPS = [1, 2, 3, 4].map(n => `/assets/images/betshop/clip${n}.mp4`);

function Cover() {
  const {tx} = useLang();
  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Grid columns={{minWidth: 160, repeat: 'fit'}} gap={3}>
          <Text type="label" weight="semibold">
            {tx(M.masthead)}
          </Text>
          <Text type="supporting">{tx(M.issue)}</Text>
          <HStack gap={2} vAlign="center">
            <StatusDot variant="success" label={tx(UI.heroStatus)} isPulsing />
            <Text type="supporting">{tx(UI.heroStatus)}</Text>
          </HStack>
        </Grid>
        <Divider variant="strong" />
      </VStack>
      <CoverVideo />
    </VStack>
  );
}

/** Gameplay clips play one after another behind the manifesto. The frame opens
    like a curtain and eases in on scroll; a fade on the right carries the text. */
function CoverVideo() {
  const {tx} = useLang();
  const ref = useRef<HTMLElement>(null);
  const {scrollYProgress} = useScroll({target: ref, offset: ['start start', 'end start']});
  const textY = useTransform(scrollYProgress, [0, 1], ['0%', '22%']);
  const covers = PROJECTS.filter(p => p.cover && p.coverFit !== 'contain')
    .slice(0, 7)
    .map(p => p.cover!);

  return (
    <figure ref={ref} className="relative">
      <div className="relative h-[min(88svh,900px)] min-h-[560px]">
        {/* 3D: curved screen playing the gameplay clips, covers orbiting it. */}
        <HeroStage clips={COVER_CLIPS} covers={covers} />

        {/* Fade in the page colour: up from the bottom on phones, in from the right on wider screens. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface via-surface/85 via-40% to-transparent md:bg-gradient-to-l md:from-surface md:via-surface/80 md:via-40% md:to-transparent md:to-[78%]"
        />

        <motion.div
          style={{y: textY}}
          className="pointer-events-none absolute inset-0 flex flex-col justify-end gap-6 p-6 md:left-auto md:w-[min(46rem,54%)] md:justify-center md:p-12">
          <h1 className={cn(DISPLAY, 'text-[clamp(3rem,7.2vw,7.25rem)] leading-[0.92]')}>
            <RiseLine isOnMount delay={0.4}>{tx(M.line1)}</RiseLine>
            <RiseLine isOnMount delay={0.5}>
              <span className={ITALIC}>{tx(M.line2)}</span>
            </RiseLine>
            <RiseLine isOnMount delay={0.6}>{tx(M.line3)}</RiseLine>
          </h1>
          <motion.div
            className="pointer-events-auto flex flex-col gap-5"
            initial={{opacity: 0, y: 16}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.8, delay: 0.9}}>
            <Text type="large" textWrap="pretty">
              {tx(M.deck)}
            </Text>
            <HStack gap={3} vAlign="center">
              <Avatar src="/assets/images/pp.jpeg" name="Buğrahan Deveci" size="lg" tooltip={false} />
              <VStack gap={0}>
                <Text type="label" weight="semibold">
                  {tx(M.byline)}
                </Text>
                <Text type="supporting">{tx(UI.heroEyebrow)}</Text>
              </VStack>
            </HStack>
          </motion.div>
        </motion.div>

        <a
          href="#now"
          data-cursor={tx(M.view)}
          aria-label={tx(M.featureKicker)}
          className="absolute bottom-6 left-6 hidden size-32 items-center justify-center rounded-full border border-border bg-surface/60 backdrop-blur-sm md:flex">
          <SpinningText duration={16} radius={6} className="absolute inset-0 font-mono text-[0.62rem] font-semibold tracking-[0.18em] text-primary">
            {tx(M.badge)}
          </SpinningText>
          <span className="font-heading text-3xl italic text-accent">№1</span>
        </a>
      </div>
      <figcaption className="mt-3">
        <Text type="supporting">{tx(M.coverCaption)}</Text>
      </figcaption>
    </figure>
  );
}

// ─── Ticker: italic serif words drifting across ─────────────────────────────

function Ticker() {
  const {lang} = useLang();
  return (
    <VStack gap={0}>
      <Divider />
      <Marquee className="py-4 [--duration:45s] [--gap:2.5rem]">
        {M.ticker[lang].map((w, i) => (
          <span key={w} className="flex items-center gap-10 font-heading text-[clamp(1.75rem,4vw,3.5rem)] leading-none">
            <span className={i % 2 ? ITALIC : 'font-light text-primary'}>{w}</span>
            <span className="text-accent">✺</span>
          </span>
        ))}
      </Marquee>
      <Divider />
    </VStack>
  );
}

// ─── Cover story: sticky media beside the text ──────────────────────────────

function CoverStory() {
  const {tx} = useLang();
  const bet = PROJECTS.find(p => p.id === 'bet-shop-simulator')!;
  const tidy = PROJECTS.find(p => p.id === 'tidy-paws')!;
  const steam = bet.links[0];
  const [first, ...rest] = tx(bet.body[0]).split(' ');

  return (
    <VStack gap={8}>
      <Kicker id="now" no="01" kicker={tx(M.featureKicker)} title={bet.title} page="04" />
      <Grid columns={{minWidth: 300, repeat: 'fit'}} gap={10}>
        <VStack gap={3} className="md:sticky md:top-24 md:self-start">
          <span data-cursor={tx(M.view)} className="block">
            <a href={projectHref(bet.id)} className="group block overflow-hidden rounded-(--radius-container)">
              <AspectRatio ratio={4 / 3} fit="cover">
                <video
                  src="/assets/images/betshop/clip2.mp4"
                  poster={bet.cover}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="transition-transform duration-700 group-hover:scale-105"
                />
              </AspectRatio>
            </a>
          </span>
          <Text type="supporting">
            {tx(bet.studio)} · {bet.year} · {bet.tech.join(', ')}
          </Text>
        </VStack>

        <VStack gap={6}>
          <Text type="large" textWrap="pretty">
            <span className="float-left mt-1 mr-3 font-heading text-[5.5rem] leading-[0.75] font-light text-accent">
              {first.charAt(0)}
            </span>
            {first.slice(1)} {rest.join(' ')}
          </Text>
          {bet.body.slice(1).map((p, i) => (
            <Text key={i} type="body" textWrap="pretty">
              {tx(p)}
            </Text>
          ))}
          <figure className="border-l-2 border-accent-bg pl-6">
            <blockquote className={cn(DISPLAY, 'text-[clamp(2rem,4vw,3.5rem)] leading-[1.05] italic')}>
              “{tx(M.pull)}”
            </blockquote>
            <figcaption className="mt-3">
              <Text type="supporting">— {tx(M.pullCite)}</Text>
            </figcaption>
          </figure>
          <HStack gap={3} wrap="wrap">
            <Button
              label={tx(steam.label)}
              variant="primary"
              size="lg"
              href={steam.url}
              target="_blank"
              endContent={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" color="inherit" />}
            />
            <Button label={tx(M.readMore)} variant="ghost" size="lg" href={projectHref(bet.id)} />
          </HStack>

          <Card variant="muted" padding={6}>
            <HStack gap={6} hAlign="between" vAlign="center" wrap="wrap">
              <VStack gap={1}>
                <Text type="supporting" color="accent" weight="semibold">
                  {tx(UI.upNext)}
                </Text>
                <a href={projectHref(tidy.id)} data-cursor={tx(M.view)} className={cn(DISPLAY, 'text-[clamp(2.25rem,5vw,4rem)] leading-none italic hover:text-accent')}>
                  {tidy.title}
                </a>
                <Text type="body" color="secondary">
                  {tx(tidy.summary)}
                </Text>
              </VStack>
              {tidy.status && <Token color="orange" label={tx(tidy.status)} />}
            </HStack>
          </Card>
        </VStack>
      </Grid>
    </VStack>
  );
}

// ─── Gallery: hover-zoom masonry ────────────────────────────────────────────

function Gallery() {
  const {tx} = useLang();
  const work = PROJECTS.filter(p => !p.isCurrent);
  const [ringFocus, setRingFocus] = useState<RingItem | null>(null);
  const ringItems: RingItem[] = PROJECTS.map(p => ({id: p.id, title: p.title, cover: p.cover, href: projectHref(p.id)}));
  return (
    <VStack gap={8}>
      <Kicker id="work" no="02" kicker={tx(M.galleryKicker)} title={tx(M.galleryTitle)} page="12" />
      <VStack gap={2} hAlign="center">
        <Lazy3D className="h-[min(72svh,720px)] min-h-[420px] w-full">
          <ProjectRing items={ringItems} hint={tx(M.view)} onHover={setRingFocus} />
        </Lazy3D>
        <span className={cn(DISPLAY, 'text-[clamp(1.75rem,3.5vw,3rem)] leading-none italic')}>
          {ringFocus ? ringFocus.title : tx(M.ringIdle)}
        </span>
        <Text type="supporting">{tx(M.ringHint)}</Text>
      </VStack>
      <div className="magazine-grid">
        {work.map((p, i) => (
          <Reveal key={p.id} delay={(i % 3) * 0.07} className={isWide(i) ? 'magazine-wide' : undefined}>
            <Tile project={p} index={i + 1} isWide={isWide(i)} />
          </Reveal>
        ))}
      </div>
    </VStack>
  );
}

function Tile({project, index, isWide}: {project: Project; index: number; isWide: boolean}) {
  const {tx} = useLang();
  const ratio = isWide ? 3 / 1 : 3 / 2;
  return (
    <a
      href={projectHref(project.id)}
      data-cursor={tx(M.view)}
      className="group block text-primary no-underline">
      <VStack gap={3}>
        <span className="block overflow-hidden rounded-(--radius-container)">
          {project.cover ? (
            <AspectRatio ratio={ratio} fit={project.coverFit ?? 'cover'}>
              <img
                src={project.cover}
                alt=""
                loading="lazy"
                className="transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
              />
            </AspectRatio>
          ) : (
            <AspectRatio ratio={ratio}>
              <Card variant="muted" padding={4} height="100%">
                <Center height="100%">
                  <span className={cn(DISPLAY, 'text-[clamp(2rem,4vw,3.5rem)] italic transition-colors group-hover:text-accent')}>
                    {project.title}
                  </span>
                </Center>
              </Card>
            </AspectRatio>
          )}
        </span>
        <HStack gap={3} hAlign="between" vAlign="start">
          <VStack gap={1}>
            <span className="font-heading text-[clamp(1.4rem,2.2vw,2rem)] leading-tight transition-colors group-hover:text-accent group-hover:italic">
              {project.title}
            </span>
            <Text type="body" color="secondary" maxLines={2}>
              {tx(project.summary)}
            </Text>
          </VStack>
          <VStack gap={0} hAlign="end">
            <Text type="supporting">№ {String(index).padStart(2, '0')}</Text>
            <Text type="supporting">{project.year}</Text>
          </VStack>
        </HStack>
      </VStack>
    </a>
  );
}

// ─── Masthead: experience as big serif rows ─────────────────────────────────

function Masthead() {
  const {tx} = useLang();
  return (
    <VStack gap={8}>
      <Kicker id="experience" no="03" kicker={tx(M.mastheadKicker)} title={tx(M.mastheadTitle)} page="28" />
      <VStack gap={0}>
        {EXPERIENCE.map(e => (
          <Reveal key={e.org + tx(e.period)}>
            <VStack gap={3} paddingBlock={5}>
              <Grid columns={{minWidth: 260, repeat: 'fit'}} gap={4} align="start">
                <VStack gap={1}>
                  <Text type="supporting" weight="semibold" color={e.isCurrent ? 'accent' : 'secondary'}>
                    {tx(e.period)} — {tx(e.title)}
                  </Text>
                  <span className={cn(DISPLAY, 'text-[clamp(2rem,4.5vw,4rem)] leading-none', e.isCurrent && 'italic text-accent')}>
                    {e.org}
                  </span>
                </VStack>
                <VStack gap={2}>
                  <Text type="body" color="secondary" textWrap="pretty">
                    {tx(e.text)}
                  </Text>
                  {Boolean(e.docs?.length) && (
                    <HStack gap={3} wrap="wrap">
                      {e.docs?.map(d => (
                        <Link key={d.url} href={d.url} type="supporting">
                          {tx(d.label)}
                        </Link>
                      ))}
                    </HStack>
                  )}
                </VStack>
              </Grid>
              <Divider />
            </VStack>
          </Reveal>
        ))}
      </VStack>
    </VStack>
  );
}

// ─── Column: a scroll-lit statement, then skills ────────────────────────────

function Column() {
  const {tx, lang} = useLang();
  return (
    <VStack gap={2}>
      <Kicker id="about" no="04" kicker={tx(M.columnKicker)} title={tx(M.columnTitle)} page="34" />
      <TextReveal key={lang} className="[&_span]:font-normal">{`${tx(UI.aboutBody1)} ${tx(UI.aboutBody2)}`}</TextReveal>
      <Grid columns={{minWidth: 240, repeat: 'fit'}} gap={8}>
        {SKILLS.map((group, i) => (
          <Reveal key={group.title.en} delay={i * 0.08}>
            <VStack gap={3}>
              <Divider variant="strong" />
              <Text type="supporting">№ {String(i + 1).padStart(2, '0')}</Text>
              <span className={cn(DISPLAY, 'text-[clamp(1.75rem,3vw,2.5rem)] leading-none italic')}>{tx(group.title)}</span>
              <Text type="body" color="secondary">
                {group.items.join(' · ')}
              </Text>
            </VStack>
          </Reveal>
        ))}
      </Grid>
    </VStack>
  );
}

// ─── Letters: contact ───────────────────────────────────────────────────────

function Letters() {
  const {tx} = useLang();
  return (
    <VStack gap={8}>
      <Divider variant="strong" />
      <Grid columns={{minWidth: 300, repeat: 'fit'}} gap={8} align="end">
        <VStack gap={3}>
          <Text type="supporting" color="accent" weight="semibold">
            № 05 — {tx(M.lettersKicker)}
          </Text>
          <h2 id="contact" style={anchorOffset} className={cn(DISPLAY, 'text-[clamp(3rem,8vw,7.5rem)] leading-[0.92]')}>
            <RiseLine>{tx(M.lettersTitle1)}</RiseLine>
            <RiseLine delay={0.08}>
              <span className={ITALIC}>{tx(M.lettersTitle2)}</span>
            </RiseLine>
          </h2>
        </VStack>
        <Lazy3D className="flex justify-center">
          <LiquidBlob label={tx(M.blobLabel)} />
        </Lazy3D>
      </Grid>
      <Grid columns={{minWidth: 300, repeat: 'fit'}} gap={8} align="end">
        <Text type="large" color="secondary" textWrap="pretty">
          {tx(M.lettersBody)}
        </Text>
        <VStack gap={4}>
          <a
            href={`mailto:${CONTACT.email}`}
            data-cursor="✉"
            className="font-heading text-[clamp(1.4rem,3vw,2.5rem)] break-all text-primary italic underline decoration-accent decoration-1 underline-offset-[0.25em] transition-colors hover:text-accent">
            {CONTACT.email}
          </a>
          <HStack gap={4} wrap="wrap">
            {CONTACT.links.map(l => (
              <Link key={l.url} href={l.url} isExternalLink isStandalone>
                {l.label}
              </Link>
            ))}
          </HStack>
        </VStack>
      </Grid>
    </VStack>
  );
}

/** Closing signature, edge to edge. */
function Signature() {
  return (
    <p aria-hidden className={cn(DISPLAY, 'text-[clamp(3.5rem,15vw,15rem)] leading-[0.85] tracking-[-0.05em] select-none')}>
      <RiseLine>Buğrahan</RiseLine>
      <RiseLine delay={0.1}>
        <span className={ITALIC}>Deveci.</span>
      </RiseLine>
    </p>
  );
}

// ─── Section opener: number, kicker, serif title, page ──────────────────────

function Kicker({id, no, kicker, title, page}: {id: string; no: string; kicker: string; title: string; page: string}) {
  const {tx} = useLang();
  return (
    <VStack gap={4}>
      <Divider variant="strong" />
      <HStack gap={4} hAlign="between" vAlign="end" wrap="wrap">
        <VStack gap={2}>
          <Text type="supporting" color="accent" weight="semibold">
            № {no} — {kicker}
          </Text>
          <Heading level={2} id={id} style={anchorOffset} className={cn(DISPLAY, 'text-[clamp(2.5rem,6vw,5.5rem)] leading-[0.95]')}>
            {title}
          </Heading>
        </VStack>
        <Text type="supporting">
          {tx(M.page)} {page}
        </Text>
      </HStack>
    </VStack>
  );
}
