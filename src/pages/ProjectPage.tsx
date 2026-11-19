import {useEffect, useState, type CSSProperties} from 'react';
import {VStack, HStack, Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Grid} from '@astryxdesign/core/Grid';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Divider} from '@astryxdesign/core/Divider';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {Token} from '@astryxdesign/core/Token';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {useLightbox} from '@astryxdesign/core/Lightbox';
import {rtlStyles} from '@astryxdesign/core/utils';
import {ArrowLeftIcon, ArrowRightIcon, ArrowTopRightOnSquareIcon, PlayIcon} from '@heroicons/react/20/solid';
import {UI, useLang} from '../i18n';
import {projectHref} from '../router';
import {PROJECTS, type Media, type Project} from '../data';
import {ProjectCard, ProjectCover, SiteFooter, mediaClip} from '../components';
import {Eyebrow, Reveal, ScrambleTitle} from '../fx';

// Keeps the info column in view while the gallery scrolls. No sticky prop on
// Astryx layout primitives yet (#2613).
const stickyInfo: CSSProperties = {
  position: 'sticky',
  top: 'calc(var(--spacing-10) * 2)',
  alignSelf: 'start',
};

export function ProjectPage({id}: {id: string}) {
  const {tx} = useLang();
  const index = PROJECTS.findIndex(p => p.id === id);
  const project = PROJECTS[index];

  useEffect(() => {
    window.scrollTo({top: 0});
    document.title = project ? `${project.title} — Buğrahan Deveci` : 'Buğrahan Deveci';
  }, [project]);

  if (!project) {
    return (
      <Layout
        height="auto"
        contentWidth={1200}
        content={
          <LayoutContent padding={6} isScrollable={false}>
            <EmptyState
              title={tx(UI.notFound)}
              actions={<Button label={tx(UI.back)} variant="primary" href="#work" />}
            />
          </LayoutContent>
        }
      />
    );
  }

  const next = PROJECTS[(index + 1) % PROJECTS.length];

  return (
    <Layout
      height="auto"
      contentWidth={1200}
      content={
        <LayoutContent padding={6} isScrollable={false}>
          <VStack gap={8}>
            <HStack>
              <Button
                label={tx(UI.back)}
                variant="ghost"
                href="#work"
                icon={<Icon icon={ArrowLeftIcon} size="sm" xstyle={rtlStyles.mirror} />}
              />
            </HStack>

            <Grid columns={{minWidth: 280, repeat: 'fit'}} gap={6}>
              <Reveal>
                <Gallery project={project} />
              </Reveal>
              <VStack gap={0} style={stickyInfo}>
                <ProjectInfo project={project} />
              </VStack>
            </Grid>

            <VStack gap={4}>
              <Divider />
              <HStack gap={2} vAlign="center" hAlign="between">
                <Heading level={2}>{tx(UI.nextProject)}</Heading>
                <Button
                  label={next.title}
                  variant="ghost"
                  href={projectHref(next.id)}
                  endContent={<Icon icon={ArrowRightIcon} size="sm" color="inherit" xstyle={rtlStyles.mirror} />}
                />
              </HStack>
              <Grid columns={{minWidth: 280, repeat: 'fill'}} gap={4}>
                <ProjectCard project={next} />
              </Grid>
            </VStack>

            <SiteFooter />
          </VStack>
        </LayoutContent>
      }
    />
  );
}

// ─── Gallery (product-detail template) ──────────────────────────────────────

function Gallery({project}: {project: Project}) {
  const {tx} = useLang();
  const [selected, setSelected] = useState(0);
  const media = project.gallery;

  useEffect(() => setSelected(0), [project.id]);

  const lightbox = useLightbox({
    media: media.map((m, i) => ({
      src: m.src,
      type: m.type ?? 'image',
      alt: `${project.title} — ${tx(UI.image)} ${i + 1}`,
    })),
    hasZoom: true,
  });

  if (media.length === 0) {
    return (
      <VStack gap={3}>
        <ProjectCover project={project} ratio={16 / 9} />
        {project.playUrl && (
          <Button
            label={tx(UI.play)}
            variant="primary"
            size="lg"
            href={project.playUrl}
            icon={<Icon icon={PlayIcon} />}
          />
        )}
      </VStack>
    );
  }

  const current = media[selected] ?? media[0];
  const fit = project.coverFit === 'contain' ? 'contain' : 'cover';

  return (
    <VStack gap={3}>
      <Card variant="muted" padding={0}>
        <AspectRatio ratio={16 / 9} fit={current.type === 'video' ? 'contain' : fit} style={mediaClip}>
          {current.type === 'video' ? (
            <video
              key={current.src}
              src={current.src}
              autoPlay
              muted
              loop
              playsInline
              controls
            />
          ) : (
            <img
              src={current.src}
              alt={`${project.title} — ${tx(UI.image)} ${selected + 1}`}
              {...lightbox.getTriggerProps(selected)}
            />
          )}
        </AspectRatio>
      </Card>

      {media.length > 1 && (
        <Grid columns={{minWidth: 88, repeat: 'fill'}} gap={2}>
          {media.map((m, i) => (
            <SelectableCard
              key={m.src}
              label={`${tx(UI.image)} ${i + 1}`}
              isSelected={selected === i}
              onChange={() => setSelected(i)}
              variant="muted"
              padding={0}>
              <AspectRatio ratio={16 / 10} fit={m.type === 'video' ? 'cover' : fit}>
                <Thumb media={m} />
              </AspectRatio>
            </SelectableCard>
          ))}
        </Grid>
      )}
      {lightbox.element}
    </VStack>
  );
}

function Thumb({media}: {media: Media}) {
  if (media.type === 'video') {
    return <video src={`${media.src}#t=0.5`} muted playsInline preload="auto" />;
  }
  return <img src={media.src} alt="" loading="lazy" />;
}

// ─── Info column ────────────────────────────────────────────────────────────

function ProjectInfo({project}: {project: Project}) {
  const {tx} = useLang();
  return (
    <VStack gap={5}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Eyebrow keepCase label={`${tx(project.studio)} · ${project.year}`} />
          {project.status && <Token color={project.isCurrent ? 'green' : 'teal'} label={tx(project.status)} size="sm" />}
        </HStack>
        <ScrambleTitle as="h1" isName text={project.title} />
        <Text type="large" color="secondary" textWrap="pretty">
          {tx(project.tagline)}
        </Text>
      </VStack>

      {(project.playUrl || project.links.length > 0) && (
        <HStack gap={2} wrap="wrap">
          {project.playUrl && (
            <Button label={tx(UI.play)} variant="primary" href={project.playUrl} icon={<Icon icon={PlayIcon} />} />
          )}
          {project.links.map((l, i) => (
            <Button
              key={l.url}
              label={tx(l.label)}
              variant={!project.playUrl && i === 0 ? 'primary' : 'secondary'}
              href={l.url}
              target="_blank"
              endContent={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" color="inherit" />}
            />
          ))}
        </HStack>
      )}

      <Collapsible trigger={<Heading level={2}>{tx(UI.aboutProject)}</Heading>}>
        <VStack gap={3}>
          {project.body.map((p, i) => (
            <Text key={i} type="body" textWrap="pretty">
              {tx(p)}
            </Text>
          ))}
        </VStack>
      </Collapsible>

      <Divider />

      <MetadataList label={{position: 'top'}}>
        <MetadataListItem label={tx(UI.metaRole)}>
          <Text type="body">{project.role.map(r => tx(r)).join(' · ')}</Text>
        </MetadataListItem>
        <MetadataListItem label={tx(UI.metaTech)}>
          <HStack gap={2} wrap="wrap">
            {project.tech.map(t => (
              <Token key={t} label={t} size="sm" />
            ))}
          </HStack>
        </MetadataListItem>
      </MetadataList>
    </VStack>
  );
}
