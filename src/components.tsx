import type {CSSProperties} from 'react';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Center} from '@astryxdesign/core/Center';
import {Token} from '@astryxdesign/core/Token';
import {Divider} from '@astryxdesign/core/Divider';
import {Link} from '@astryxdesign/core/Link';
import {UI, useLang} from './i18n';
import {projectHref} from './router';
import {CONTACT, type Project} from './data';

// AspectRatio has no radius prop yet (issue #2582), so corner rounding is an
// inline style on the radius token.
export const mediaClip: CSSProperties = {
  borderRadius: 'var(--radius-element)',
  overflow: 'clip',
};

/** Scroll target offset so section headings clear the sticky top bar. */
export const anchorOffset: CSSProperties = {
  scrollMarginTop: 'calc(var(--spacing-10) * 2)',
};

const PLACEHOLDER_VARIANTS = ['purple', 'teal', 'orange', 'blue'] as const;

/** Cover art for a project. Projects without art get a colored title card. */
export function ProjectCover({project, ratio = 16 / 10}: {project: Project; ratio?: number}) {
  const {tx} = useLang();

  if (!project.cover) {
    const variant = PLACEHOLDER_VARIANTS[project.id.length % PLACEHOLDER_VARIANTS.length];
    return (
      <AspectRatio ratio={ratio} style={mediaClip}>
        <Card variant={variant} padding={4} height="100%">
          <Center height="100%">
            <VStack gap={1} hAlign="center">
              <Heading level={3} type="display-3" justify="center">
                {project.title}
              </Heading>
              <Text type="supporting" justify="center">
                {project.playUrl ? tx(UI.play) : tx(UI.comingSoon)}
              </Text>
            </VStack>
          </Center>
        </Card>
      </AspectRatio>
    );
  }

  const fit = project.coverFit ?? 'cover';
  return (
    <Card variant={fit === 'contain' ? 'muted' : 'transparent'} padding={0}>
      <AspectRatio ratio={ratio} fit={fit} style={mediaClip}>
        <img src={project.cover} alt="" loading="lazy" />
      </AspectRatio>
    </Card>
  );
}

/** Grid tile linking to a project page. */
export function ProjectCard({project, isLarge = false}: {project: Project; isLarge?: boolean}) {
  const {tx} = useLang();
  return (
    <ClickableCard label={project.title} href={projectHref(project.id)} padding={3} elevation="low">
      <VStack gap={3}>
        <ProjectCover project={project} ratio={isLarge ? 16 / 9 : 16 / 10} />
        <VStack gap={1}>
          <HStack gap={2} vAlign="center" hAlign="between">
            <Heading level={3}>{project.title}</Heading>
            {project.status && <Token color={project.isCurrent ? 'green' : 'teal'} label={tx(project.status)} size="sm" />}
          </HStack>
          <Text type="supporting">
            {tx(project.studio)} · {project.year}
          </Text>
        </VStack>
        <Text type="body" color="secondary" maxLines={isLarge ? 0 : 2}>
          {tx(project.summary)}
        </Text>
      </VStack>
    </ClickableCard>
  );
}

export function SiteFooter() {
  const {tx} = useLang();
  return (
    <VStack gap={4}>
      <Divider />
      <HStack gap={4} hAlign="between" vAlign="center" wrap="wrap">
        <Text type="supporting">
          © {new Date().getFullYear()} Buğrahan Deveci · bugrahnd.com.tr · {tx(UI.footer)}
        </Text>
        <HStack gap={4} wrap="wrap">
          <Link href={`mailto:${CONTACT.email}`} type="supporting">
            E-mail
          </Link>
          {CONTACT.links.map(l => (
            <Link key={l.url} href={l.url} isExternalLink type="supporting">
              {l.label}
            </Link>
          ))}
        </HStack>
      </HStack>
    </VStack>
  );
}
