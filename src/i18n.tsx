import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';

export type Lang = 'tr' | 'en';
/** A string in both languages. */
export type L = {tr: string; en: string};

const STORAGE_KEY = 'lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'tr' || saved === 'en') return saved;
  } catch {
    // storage blocked: fall through to the browser language
  }
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  tx: (value: L) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({children}: {children: ReactNode}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // not persisted; the choice still applies for this visit
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({lang, setLang, tx: (v: L) => v[lang]}), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}

/** Interface copy. Project and experience content lives in data.ts. */
export const UI = {
  navWork: {tr: 'Projeler', en: 'Work'},
  navExperience: {tr: 'Deneyim', en: 'Experience'},
  navAbout: {tr: 'Hakkımda', en: 'About'},
  navContact: {tr: 'İletişim', en: 'Contact'},
  langLabel: {tr: 'Dil', en: 'Language'},
  themeToLight: {tr: 'Açık temaya geç', en: 'Switch to light theme'},
  themeToDark: {tr: 'Koyu temaya geç', en: 'Switch to dark theme'},

  heroEyebrow: {tr: "fourKland'de Oyun Geliştirici", en: 'Game Developer at fourKland'},
  eyebrowNow: {tr: 'Şimdi oynanıyor', en: 'Now playing'},
  eyebrowWork: {tr: 'Bölüm seç', en: 'Level select'},
  eyebrowExperience: {tr: 'Tecrübe puanı', en: 'XP log'},
  eyebrowAbout: {tr: 'Oyuncu profili', en: 'Player profile'},
  eyebrowContact: {tr: 'Çok oyunculu', en: 'Multiplayer'},
  heroRole: {tr: 'Oyun geliştirici × Tasarımcı', en: 'Game developer × Designer'},
  metaPortfolio: {tr: 'Portfolyo', en: 'Portfolio'},
  metaCurrently: {tr: 'Şu an', en: 'Currently'},
  metaFocus: {tr: 'Odak', en: 'Focus'},
  metaFocusValue: {tr: 'Oyun · Arayüz · Sistem', en: 'Games · Interface · Systems'},
  metaStatus: {tr: 'Durum', en: 'Status'},
  badge: {tr: 'YENİ PROJELERE AÇIK ✦ OYUN ✦ TASARIM ✦ ', en: 'OPEN TO WORK ✦ GAMES ✦ DESIGN ✦ '},
  cursorOpen: {tr: 'Aç', en: 'View'},
  cursorPlay: {tr: 'İzle', en: 'Watch'},
  caseLabel: {tr: 'Vaka 01', en: 'Case 01'},
  upNext: {tr: 'Sırada', en: 'Up next'},
  details: {tr: 'Detaylar', en: 'Details'},
  projectsCount: {tr: 'proje', en: 'projects'},
  sayHello: {tr: 'Merhaba de', en: 'Say hello'},
  heroStatus: {tr: 'Yeni projelere açık', en: 'Open to new projects'},
  heroTitle: {
    tr: 'Oyunlar, oynanabilir deneyimler ve onları ayakta tutan sistemler yapıyorum.',
    en: 'I make games, playable experiences and the systems that hold them together.',
  },
  heroBody: {
    tr: "Unity ve C# ile oyun geliştiriyorum. Şu an fourKland'deyim; Steam'de yayınlanan Bet Shop Simulator'da çalıştım. Yan tarafta Tidy Paws'ı bitirmek üzereyim. İstatistik ve Bilgisayar Bilimleri öğrencisiyim.",
    en: "I build games in Unity and C#. I'm currently at fourKland, where I worked on Bet Shop Simulator, out now on Steam. On the side I'm wrapping up Tidy Paws. Statistics and Computer Science student.",
  },
  heroCtaWork: {tr: 'Projeleri gör', en: 'See my work'},
  heroCtaContact: {tr: 'İletişime geç', en: 'Get in touch'},
  statProjects: {tr: 'Proje', en: 'Projects'},
  statSince: {tr: 'yılından beri üretiyorum', en: 'Building since'},
  statPlayable: {tr: 'Tarayıcıda oynanabilir', en: 'Playable in browser'},

  nowTitle: {tr: 'Şu an', en: 'Right now'},
  nowBody: {
    tr: 'Üzerinde çalıştığım ve yeni çıkan işler.',
    en: "What I'm working on and what just shipped.",
  },
  comingSoon: {tr: 'Görseller yakında', en: 'Visuals coming soon'},

  workTitle: {tr: 'Projeler', en: 'Selected work'},
  workBody: {
    tr: 'Stüdyo işleri, game jam oyunları, kişisel projeler ve uygulamalar.',
    en: 'Studio work, game jam games, personal projects and apps.',
  },
  filterAll: {tr: 'Tümü', en: 'All'},
  filterGames: {tr: 'Oyunlar', en: 'Games'},
  filterApps: {tr: 'Uygulamalar', en: 'Apps'},
  filterPlayable: {tr: 'Tarayıcıda oyna', en: 'Play in browser'},

  experienceTitle: {tr: 'Deneyim', en: 'Experience'},
  current: {tr: 'Şu an', en: 'Current'},
  documents: {tr: 'Belgeler', en: 'Documents'},

  aboutTitle: {tr: 'Hakkımda', en: 'About'},
  aboutBody1: {
    tr: "2018'de web ile başladım, sonra Unity'ye geçtim. Bir ürünün insanların gerçekten hissettiği kısımlarıyla uğraşmayı seviyorum: girdinin nasıl karşılık bulduğu, bir sistemin ekranda nasıl okunduğu, bir sahnenin dikkati nasıl tuttuğu.",
    en: 'I started with the web in 2018 and moved into Unity. I like working on the parts of a product people actually feel: how input lands, how a system reads on screen, how a scene holds attention.',
  },
  aboutBody2: {
    tr: 'Psikolojik çıkarım oyunlarından afet bölgeleri için çevrimdışı mesh ağına kadar, hem oyun hem yapay zekâ destekli yazılım projeleri geliştiriyorum.',
    en: 'My work runs from psychological deduction games to an offline mesh network for disaster zones — games on one side, AI-assisted software on the other.',
  },

  contactTitle: {tr: 'Birlikte bir şey yapalım', en: "Let's build something"},
  contactBody: {
    tr: 'Oyun projelerine, etkileşimli işlere ve iş birliklerine açığım.',
    en: 'Open to game projects, interactive work and collaborations.',
  },
  contactEmail: {tr: 'E-posta gönder', en: 'Send an email'},

  back: {tr: 'Tüm projeler', en: 'All projects'},
  play: {tr: 'Tarayıcıda oyna', en: 'Play in browser'},
  aboutProject: {tr: 'Proje hakkında', en: 'About the project'},
  metaStudio: {tr: 'Stüdyo', en: 'Studio'},
  metaYear: {tr: 'Yıl', en: 'Year'},
  metaRole: {tr: 'Rol', en: 'Role'},
  metaTech: {tr: 'Teknolojiler', en: 'Tech'},
  openGallery: {tr: 'Galeriyi aç', en: 'Open gallery'},
  image: {tr: 'Görsel', en: 'Image'},
  nextProject: {tr: 'Sonraki proje', en: 'Next project'},
  notFound: {tr: 'Bu proje bulunamadı.', en: "This project doesn't exist."},
  footer: {tr: 'Astryx ile yapıldı.', en: 'Built with Astryx.'},
} satisfies Record<string, L>;
