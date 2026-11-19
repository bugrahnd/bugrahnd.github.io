import {useState} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {AppShell} from '@astryxdesign/core/AppShell';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {HStack} from '@astryxdesign/core/HStack';
import {Avatar} from '@astryxdesign/core/Avatar';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {MoonIcon, SunIcon} from '@heroicons/react/20/solid';
import {themes, defaultThemeSlug} from './astryx-themes';
import {LangProvider, UI, useLang, type Lang} from './i18n';
import {useHashRoute} from './router';
import {ProjectPage} from './pages/ProjectPage';
import {PageProgress} from './fx';
import {CustomCursor, Grain} from './designer';
import {MagazineHome} from './designs/MagazineHome';

type Mode = 'light' | 'dark';

function initialMode(): Mode {
  try {
    const saved = localStorage.getItem('mode');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // storage blocked: follow the system setting
  }
  return 'dark'; // the site is designed dark-first; the toggle switches to light
}

export function App() {
  const [mode, setMode] = useState<Mode>(initialMode);

  const toggleMode = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    try {
      localStorage.setItem('mode', next);
    } catch {
      // not persisted
    }
  };

  return (
    <Theme theme={themes[defaultThemeSlug]} mode={mode}>
      <LangProvider>
        <Site mode={mode} onToggleMode={toggleMode} />
      </LangProvider>
    </Theme>
  );
}

function Site({mode, onToggleMode}: {mode: Mode; onToggleMode: () => void}) {
  const route = useHashRoute();

  return (
    <AppShell
      height="auto"
      variant="section"
      topNav={<SiteNav mode={mode} onToggleMode={onToggleMode} />}>
      <PageProgress />
      <Grain />
      <CustomCursor />
      {route.name === 'project' ? <ProjectPage id={route.id} /> : <MagazineHome anchor={route.anchor} />}
    </AppShell>
  );
}

function SiteNav({mode, onToggleMode}: {mode: Mode; onToggleMode?: () => void}) {
  const {lang, setLang, tx} = useLang();

  return (
    <TopNav
      heading={
        <TopNavHeading
          logo={<Avatar src="/assets/images/pp.jpeg" name="Buğrahan Deveci" size="sm" tooltip={false} />}
          heading="Buğrahan Deveci"
          headingHref="#/"
        />
      }
      startContent={
        <>
          <TopNavItem label={tx(UI.navWork)} href="#work" />
          <TopNavItem label={tx(UI.navExperience)} href="#experience" />
          <TopNavItem label={tx(UI.navAbout)} href="#about" />
          <TopNavItem label={tx(UI.navContact)} href="#contact" />
        </>
      }
      endContent={
        <HStack gap={2} vAlign="center">
          <SegmentedControl
            size="sm"
            label={tx(UI.langLabel)}
            value={lang}
            onChange={v => setLang(v as Lang)}>
            <SegmentedControlItem value="tr" label="TR" />
            <SegmentedControlItem value="en" label="EN" />
          </SegmentedControl>
          {onToggleMode && (
            <IconButton
              size="sm"
              variant="ghost"
              label={tx(mode === 'dark' ? UI.themeToLight : UI.themeToDark)}
              icon={<Icon icon={mode === 'dark' ? SunIcon : MoonIcon} />}
              onClick={onToggleMode}
            />
          )}
        </HStack>
      }
    />
  );
}
