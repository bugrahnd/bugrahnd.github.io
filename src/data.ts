/* Site content, in both languages.
   Every user-facing string is a {tr, en} pair; pick one with tx() from i18n.
   To add a project: append to PROJECTS. Images live in public/assets/images/<id>/. */

import type {L} from './i18n';

export type Category = 'game' | 'app';

export interface Media {
  src: string;
  type?: 'image' | 'video';
}

export interface ProjectLink {
  label: L;
  url: string;
}

export interface Project {
  id: string;
  title: string;
  category: Category;
  year: string;
  studio: L;
  /** Short status shown as a badge, e.g. "On Steam", "In development". */
  status?: L;
  summary: L;
  tagline: L;
  body: L[];
  cover?: string;
  /** How the cover sits in its box. Logos and phone mockups read better contained. */
  coverFit?: 'cover' | 'contain';
  gallery: Media[];
  tech: string[];
  role: L[];
  links: ProjectLink[];
  /** Playable in the browser on this site. */
  playUrl?: string;
  /** Shown in the "Now" block at the top of the page. */
  isCurrent?: boolean;
}

const img = (path: string): Media => ({src: `/assets/images/${path}`});
const vid = (path: string): Media => ({src: `/assets/images/${path}`, type: 'video'});

export const PROJECTS: Project[] = [
  {
    id: 'bet-shop-simulator',
    title: 'Bet Shop Simulator',
    category: 'game',
    year: '2026',
    studio: {tr: 'fourKland', en: 'fourKland'},
    status: {tr: "Steam'de", en: 'On Steam'},
    isCurrent: true,
    summary: {
      tr: 'Mahallenin bahis dükkânını işlettiğin bir simülasyon: kupon bas, para üstü say, maçı müşterilerle birlikte izle.',
      en: 'A sim where you run the neighbourhood betting shop: print slips, count out change and watch the match with your customers.',
    },
    tagline: {
      tr: 'Gol dükkânı sallar, yatan kupon televizyonu kırdırır.',
      en: 'A goal shakes the shop. A losing slip costs you a TV.',
    },
    body: [
      {
        tr: "fourKland bünyesinde geliştirdiğimiz, Steam'de yayınlanan bir dükkân işletme simülasyonu. Oyuncu bahis kuponlarını basıyor, para üstünü sayıyor ve maçı müşterileriyle birlikte izliyor. Gol olduğunda bütün dükkân coşuyor, yatan kupon ise sinirli bir müşteriyle kırılan bir televizyon demek.",
        en: 'A shop management sim built at fourKland and released on Steam. You print bet slips, count out change and watch the match alongside your customers. A goal sets the whole shop off; a losing slip means an angry customer and a smashed TV.',
      },
      {
        tr: 'Kazancını dükkânı temizlemeye, dekore etmeye ve büyütmeye harcıyorsun; her yeni maç günü dükkânı biraz daha kalabalık ve biraz daha gürültülü hale getiriyor.',
        en: 'Earnings go back into cleaning, decorating and expanding the shop, and every match day brings a bigger, louder crowd.',
      },
    ],
    cover: '/assets/images/betshop/capsule.jpg',
    gallery: [
      img('betshop/capsule.jpg'),
      img('betshop/ss1.jpg'),
      vid('betshop/clip1.mp4'),
      vid('betshop/clip2.mp4'),
      vid('betshop/clip3.mp4'),
      vid('betshop/clip4.mp4'),
    ],
    tech: ['Unity', 'C#', 'Steamworks'],
    role: [{tr: 'Oyun geliştirici', en: 'Game developer'}],
    links: [
      {
        label: {tr: "Steam'de gör", en: 'View on Steam'},
        url: 'https://store.steampowered.com/app/3854680/Bet_Shop_Simulator/',
      },
    ],
  },
  {
    id: 'tidy-paws',
    title: 'Tidy Paws',
    category: 'game',
    year: '2026',
    studio: {tr: 'Geliştirme aşamasında', en: 'In development'},
    status: {tr: 'Bitmek üzere', en: 'Almost done'},
    isCurrent: true,
    summary: {
      tr: 'Şu an üzerinde çalıştığım ve bitmek üzere olan yeni oyunum. Görseller ve detaylar çok yakında.',
      en: 'The game I am working on right now, and it is nearly finished. Visuals and details are coming soon.',
    },
    tagline: {tr: 'Çok yakında.', en: 'Coming soon.'},
    body: [
      {
        tr: 'Tidy Paws şu an geliştirme aşamasında ve son düzlükte. Oynanış görüntüleri, ekran görüntüleri ve detaylı açıklama yayına yakın burada olacak.',
        en: 'Tidy Paws is in development and in the final stretch. Gameplay footage, screenshots and a full write-up will land here close to release.',
      },
    ],
    gallery: [],
    tech: ['Unity', 'C#'],
    role: [{tr: 'Oyun geliştirici', en: 'Game developer'}],
    links: [],
  },
  {
    id: 'visagerer',
    title: 'The Visagerer',
    category: 'game',
    year: '2026',
    studio: {tr: "M5's Studio · Game jam", en: "M5's Studio · Game jam"},
    summary: {
      tr: 'Müşterinin gerçekte ne demek istediğini okuyup ona aslında ihtiyaç duyduğu maskeyi yaptığın psikolojik bir çıkarım oyunu.',
      en: 'A psychological deduction game where you read what customers really mean and craft the mask they actually need.',
    },
    tagline: {
      tr: 'Yüzler yalan söyler, maskeler gerçeği gösterir.',
      en: 'Faces lie, but masks reveal the truth.',
    },
    body: [
      {
        tr: 'Bir maske ustasısın. Müşteriler bir istekle geliyor ama sözleri nadiren hisleriyle örtüşüyor: yasını gizlemek isteyen biri, masum görünmek isteyen bir katil. Görevin diyaloğu okumak, altındaki gerçek duyguyu bulmak ve maskeyi doğru göz, ağız ve burunla kurmak.',
        en: 'You play a mask maker. Customers arrive with a request, but their words rarely match their feelings — someone grieving who wants to look untouched, a killer who wants to look innocent. Your job is to read the dialogue, deduce the real emotion underneath it, and build the mask out of the right eyes, mouth and nose.',
      },
      {
        tr: 'Oyun birinci şahıs, atmosferik bir deneyim: her müşterinin kendi hikâyesi ve gizli bir amacı var, bu yüzden her sipariş yeni bir okuma problemi. Üç zorluk seviyesi diyaloğun ne kadar ipucu verdiğini değiştiriyor.',
        en: 'The game is a first-person atmospheric experience: every customer carries their own story and hidden agenda, so each order is a fresh reading problem. Three difficulty levels change how much the dialogue gives away.',
      },
    ],
    cover: '/assets/images/visagerer/kapak.jpeg',
    gallery: [
      img('visagerer/kapak.jpeg'),
      img('visagerer/A.png'),
      img('visagerer/1.png'),
      img('visagerer/2.png'),
      img('visagerer/3.png'),
    ],
    tech: ['Unity', 'C#', 'Post-Processing', 'FMOD', 'Volumetric Lighting'],
    role: [
      {tr: 'Oyun geliştirici', en: 'Game developer'},
      {tr: 'Seviye tasarımı', en: 'Level design'},
      {tr: 'Maske ve çıkarım sistemi', en: 'Mask & deduction system'},
    ],
    links: [
      {
        label: {tr: 'Oyunu indir', en: 'Download build'},
        url: 'https://ggjv4.s3.us-west-1.amazonaws.com/files/games/2026/883918/exec/maskeoyunuexe.zip?VersionId=NiEhM0NSAUvn7MyP_t1IqcrctZtmbesK',
      },
    ],
  },
  {
    id: 'cross-the-line',
    title: 'Cross The Line',
    category: 'game',
    year: '2026',
    studio: {tr: "M5's Studio · Game jam", en: "M5's Studio · Game jam"},
    summary: {
      tr: 'Gerçek Mors zamanlamasına dayanan bir I. Dünya Savaşı sığınak simülasyonu: arayüz yok, menü yok, üç hata ve hat susar.',
      en: 'A WWI bunker sim built on real Morse timing — no HUD, no menus, three mistakes and you are done.',
    },
    tagline: {
      tr: 'Savaş mermilerle yapılır ama bilgiyle kazanılır.',
      en: 'Wars are fought with bullets, but won with information.',
    },
    body: [
      {
        tr: "Beton bir sığınağın derinliklerinde Kuzey Cephesi'nin son iletişim hattı sensin. Gelen şifreli Mors sinyallerini dinliyor, kod kitabıyla çözüyor, cevabı fişe yazıp telgrafla geri gönderiyorsun. Yüksek Komuta hatayı affetmez.",
        en: 'Deep inside a concrete bunker you are the last communication line of the northern front. Encrypted Morse signals come in; you decode them with the code book, write the answer on the slip and send it back on the telegraph key. High command does not forgive mistakes.',
      },
      {
        tr: 'Her şey oyun dünyasının içinde: can barı yok, menü yok. Sadece masa, kitaplar, fişler ve telgraf anahtarı. Mors simülasyonu askeri zamanlama standartlarını izliyor, ses tasarımı ise duvarın öbür tarafındaki savaşı taşıyor.',
        en: 'Everything is diegetic — no health bar, no menu. Only the desk, the books, the slips and the key. The Morse simulation follows military timing standards, and the sound design carries the war happening on the other side of the wall.',
      },
    ],
    cover: '/assets/images/crosstheline/1.png',
    gallery: [
      img('crosstheline/1.png'),
      img('crosstheline/logo.png'),
      img('crosstheline/2.png'),
      img('crosstheline/3.png'),
      img('crosstheline/4.png'),
    ],
    tech: ['Unity', 'C#', 'Volumetric Lighting', 'Procedural audio'],
    role: [
      {tr: 'Oyun geliştirici', en: 'Game developer'},
      {tr: 'Seviye tasarımı', en: 'Level design'},
      {tr: 'UI/UX tasarımı', en: 'UI/UX design'},
    ],
    links: [
      {label: {tr: "itch.io'da oyna", en: 'Play on itch.io'}, url: 'https://reshitsanchez.itch.io/cross-the-line'},
      {label: {tr: 'Fragmanı izle', en: 'Watch trailer'}, url: 'https://www.youtube.com/watch?v=5cRJjar2700'},
    ],
  },
  {
    id: 'meshly',
    title: 'Meshly',
    category: 'app',
    year: '2026',
    studio: {tr: 'TÜBİTAK 2209-A projesi', en: 'TÜBİTAK 2209-A project'},
    summary: {
      tr: 'Afette altyapı çöktüğünde insanların haberleşmeye devam etmesini sağlayan, sunucusuz ve çevrimdışı bir P2P mesh ağı.',
      en: 'An offline, serverless P2P mesh network that keeps people talking when disaster takes the infrastructure down.',
    },
    tagline: {
      tr: 'Afet bölgeleri için dayanıklı iletişim.',
      en: 'Resilient communication for disaster zones.',
    },
    body: [
      {
        tr: 'Afet anında ilk çöken şey genellikle iletişim altyapısıdır. Meshly cebindeki telefonu merkeziyetsiz bir ağın parçasına dönüştürüyor: baz istasyonu yok, internet yok, her şeyle birlikte çökecek merkezi bir sunucu yok.',
        en: 'During a disaster the communication infrastructure is usually the first thing to fail. Meshly turns the phone already in your pocket into part of a decentralised network — no base station, no internet, no central server that can go down with everything else.',
      },
      {
        tr: 'Her cihaz Bluetooth ve Wi-Fi Direct üzerinden hem istemci hem röle olarak çalışıyor. Mesajlar hedefe ulaşana kadar telefondan telefona zıplıyor; yol koptuğunda sakla-ve-ilet katmanı mesajı hafızada tutup bağlantı geri geldiğinde teslim ediyor.',
        en: 'Every device works as both client and relay over Bluetooth and Wi-Fi Direct. Messages hop between phones until they reach their target, and a store-and-forward layer holds them when the path is broken, delivering as soon as a carrier comes back into range.',
      },
      {
        tr: 'Her mesaj ağa çıkmadan önce AES-256 ile şifreleniyor. Canlı harita katmanı konumu her on saniyede bir yayınlıyor, böylece insanları bulmak da onlara ulaşmak kadar mümkün oluyor.',
        en: 'Every message is AES-256 encrypted before it enters the network. A live map layer broadcasts location every ten seconds, so finding people is as solvable as reaching them.',
      },
    ],
    cover: '/assets/images/meshly/poster.png',
    coverFit: 'contain',
    gallery: [img('meshly/poster.png'), img('meshly/1.PNG'), img('meshly/2.PNG'), img('meshly/logo.png')],
    tech: ['Flutter', 'Dart', 'Bluetooth & Wi-Fi Direct', 'AES-256', 'Geolocator', 'P2P routing'],
    role: [
      {tr: 'Tek geliştirici', en: 'Solo developer'},
      {tr: 'P2P ağ mimarisi', en: 'P2P network architecture'},
      {tr: 'TÜBİTAK 2209-A araştırmacısı', en: 'TÜBİTAK 2209-A researcher'},
    ],
    links: [{label: {tr: 'Proje sayfası', en: 'Project page'}, url: 'https://bugrahnd.github.io/Meshly/'}],
  },
  {
    id: 'lupiego',
    title: 'Lupiego',
    category: 'app',
    year: '2025',
    studio: {tr: 'Kişisel proje', en: 'Solo project'},
    summary: {
      tr: 'Yapay zekâ destekli dil öğrenme uygulaması: uyarlanabilir kelime kartları, seviyene göre konuşan sohbet partneri ve bağlamlı çeviri.',
      en: 'An AI-assisted language learning app: adaptive flashcards, a level-aware chat partner and contextual translation.',
    },
    tagline: {tr: 'Karmaşasız dil öğrenimi.', en: 'Learning a language, without the clutter.'},
    body: [
      {
        tr: 'Merkezinde yapay zekâ olan, Flutter ile yazılmış eksiksiz bir dil öğrenme uygulaması. Sohbet partneri kullanıcının seviyesini SQLite verilerinden okuyup konuşmayı ona göre ayarlıyor.',
        en: 'A full language learning app built in Flutter, with the AI work at the centre of it. The chat partner reads the learner level from SQLite-backed user data and adapts the conversation to it.',
      },
      {
        tr: 'Etrafında: zor kelimeleri daha sık gösteren aralıklı tekrar kartları, örnek cümle ve telaffuz da veren bir çeviri motoru, Wordle tarzı bir kelime oyunu ve seri, rozet ve hatırlatmalardan oluşan bir profil katmanı.',
        en: 'Around it: spaced-repetition flashcards that show hard words more often, a translation engine that returns usage examples and pronunciation rather than a bare string, a Wordle-style word game, and a profile layer with streaks, badges and reminders.',
      },
    ],
    cover: '/assets/images/lupiego/poster.jpg',
    coverFit: 'contain',
    gallery: [
      img('lupiego/poster.jpg'),
      img('lupiego/main-screen.png'),
      img('lupiego/login-screen.png'),
      img('lupiego/register-screen.png'),
      img('lupiego/profil.png'),
      img('lupiego/bildirim-screen.png'),
      img('lupiego/chatbot-mockup.png'),
      img('lupiego/game.png'),
      img('lupiego/translate.png'),
      img('lupiego/flashcard.png'),
    ],
    tech: ['Flutter', 'Dart', 'SQLite', 'Provider', 'AI chat'],
    role: [
      {tr: 'Tek geliştirici', en: 'Solo developer'},
      {tr: 'Yapay zekâ entegrasyonu', en: 'AI integration'},
      {tr: 'UI/UX tasarımı', en: 'UI/UX design'},
    ],
    links: [{label: {tr: 'Proje sayfası', en: 'Project page'}, url: 'https://bugrahnd.github.io/LUPIEGO/'}],
  },
  {
    id: '2048-blast',
    title: '2048 Blast',
    category: 'game',
    year: '2026',
    studio: {tr: 'Kişisel proje', en: 'Solo project'},
    status: {tr: 'Tarayıcıda oyna', en: 'Play in browser'},
    summary: {
      tr: "Unity ile yaptığım, doğrudan tarayıcıda oynanabilen 2048 tarzı bir bulmaca oyunu.",
      en: 'A 2048-style puzzle game made in Unity, playable right in the browser.',
    },
    tagline: {tr: 'Birleştir, patlat, devam et.', en: 'Merge, blast, keep going.'},
    body: [
      {
        tr: 'Unity ile geliştirip WebGL olarak yayınladığım bir bulmaca oyunu. Kurulum gerektirmeden bu sitede oynayabilirsin.',
        en: 'A puzzle game I built in Unity and shipped as a WebGL build. It runs right here on this site, no install needed.',
      },
    ],
    gallery: [],
    tech: ['Unity', 'C#', 'WebGL'],
    role: [{tr: 'Tek geliştirici', en: 'Solo developer'}],
    links: [],
    playUrl: '/numbo/index.html',
  },
  {
    id: 'tileup',
    title: 'TileUp',
    category: 'game',
    year: '2026',
    studio: {tr: 'Kişisel proje', en: 'Solo project'},
    status: {tr: 'Tarayıcıda oyna', en: 'Play in browser'},
    summary: {
      tr: 'Unity ile yaptığım, doğrudan tarayıcıda oynanabilen bir karo bulmaca oyunu.',
      en: 'A tile puzzle game made in Unity, playable right in the browser.',
    },
    tagline: {tr: 'Karoları eşleştir, tahtayı temizle.', en: 'Match the tiles, clear the board.'},
    body: [
      {
        tr: 'Unity ile geliştirip WebGL olarak yayınladığım bir karo bulmaca oyunu. Kurulum gerektirmeden bu sitede oynayabilirsin.',
        en: 'A tile puzzle game I built in Unity and shipped as a WebGL build. It runs right here on this site, no install needed.',
      },
    ],
    gallery: [],
    tech: ['Unity', 'C#', 'WebGL'],
    role: [{tr: 'Tek geliştirici', en: 'Solo developer'}],
    links: [],
    playUrl: '/tileup/index.html',
  },
  {
    id: 'buzzed-busted',
    title: 'Buzzed Busted',
    category: 'game',
    year: '2025',
    studio: {tr: 'Google YZ Akademisi bootcamp · 5 kişi', en: 'Google AI Academy bootcamp · 5 people'},
    summary: {
      tr: 'Vahşi Batı temalı 5 oyunculu bir parti kart oyunu: bir barmen, dört kovboy ve bol blöf.',
      en: 'A Wild West 5-player party card game — one bartender, four cowboys, and a lot of bluffing.',
    },
    tagline: {tr: 'Ayık kal, barmeni alt et.', en: 'Stay sober. Outplay the bartender.'},
    body: [
      {
        tr: 'Vahşi Batı salonunda geçen 3D çok oyunculu bir parti kart oyunu. Barmen bütün kovboyları sarhoş edip oyun dışı bırakarak kazanır; kovboylar ise ayık kalıp barmenin hilelerini çözerek.',
        en: "A 3D multiplayer party card game set in a Wild West saloon. The bartender wins by getting every cowboy drunk and out of the game; the cowboys win by staying sober, reading the bartender's tricks and taking them down.",
      },
      {
        tr: 'Google Yapay Zekâ ve Teknoloji Akademisi bootcamp’i sırasında beş kişilik bir ekiple geliştirdik; geliştirmenin yanında ürün sahipliğini de ben yürüttüm.',
        en: 'Built with a five-person team during the Google AI & Technology Academy bootcamp, where I ran product ownership alongside development.',
      },
    ],
    cover: '/assets/images/buzzed/anamenü.png',
    gallery: [
      img('buzzed/anamenü.png'),
      img('buzzed/oyunici.png'),
      img('buzzed/1.png'),
      img('buzzed/2.png'),
      img('buzzed/3.png'),
      img('buzzed/4.png'),
      img('buzzed/5.png'),
    ],
    tech: ['Unity', 'C#', 'Multiplayer', 'Particle System', 'Post-Processing'],
    role: [
      {tr: 'Ürün sahibi', en: 'Product owner'},
      {tr: 'Oyun geliştirici', en: 'Game developer'},
      {tr: 'Mekanik tasarımı', en: 'Mechanics design'},
    ],
    links: [{label: {tr: "GitHub'da gör", en: 'View on GitHub'}, url: 'https://github.com/bugrahnd/bootcamp47'}],
  },
  {
    id: 'wish-cassette',
    title: 'Wish Cassette',
    category: 'game',
    year: '2025',
    studio: {tr: 'Kişisel proje', en: 'Solo project'},
    summary: {
      tr: 'Gerçek fiziksel girdilerle oynanan bir hediye oyunu: elleri ovuşturmak, gözleri kapatmak ve mikrofona üflemek, OpenCV ile okunuyor.',
      en: 'An interactive gift game driven by real physical input — rubbing hands, closing eyes and blowing into the mic, read through OpenCV.',
    },
    tagline: {tr: 'Almak için oynaman gereken bir hediye.', en: 'A gift you have to play to receive.'},
    body: [
      {
        tr: 'Hediye olarak yaptım; aynı zamanda daha önce kullanmadığım girdi yöntemlerini denemek için bir bahaneydi. Üç bölüm var ve her biri kameranın ya da mikrofonun önünde fiziksel olarak yaptığın bir şeyle ilerliyor.',
        en: 'Built as a gift, and as an excuse to push into input methods I had not used before. Three chapters, each driven by something you physically do in front of the camera or the microphone.',
      },
      {
        tr: 'İlk bölümde dokuz odun toplayıp ateşe atıyorsun, sonra kamera önünde ellerini ovuşturuyorsun; OpenCV hareketi okuyup ateşi yakıyor. Geçiş için gözlerini kapatıyorsun.',
        en: 'In the first chapter you collect nine logs, throw them on the fire, then rub your hands in front of the webcam — OpenCV reads the motion and lights it. To move on you close your eyes.',
      },
      {
        tr: 'İkinci bölümde mikrofona güçlüce üfleyip dilek fenerini uçuruyorsun ve kasabadaki televizyonları çalıştıracak kasetleri buluyorsun. Son bölümde bir polaroid kamera beliriyor; çekilen her fotoğraf MailKit ile önceden belirlenen adrese gönderiliyor.',
        en: 'In the second you blow hard into the microphone to launch the wish lantern and find the cassettes that power the town’s TVs. In the last, a polaroid camera appears, and every shot it takes is mailed through MailKit to a preset address.',
      },
    ],
    cover: '/assets/images/dilekkutusu/1.png',
    gallery: [
      img('dilekkutusu/1.png'),
      img('dilekkutusu/gif.gif'),
      img('dilekkutusu/2.png'),
      img('dilekkutusu/3.png'),
      img('dilekkutusu/4.png'),
      img('dilekkutusu/5.png'),
    ],
    tech: ['Unity', 'C#', 'OpenCV', 'MailKit', 'Custom shaders'],
    role: [
      {tr: 'Tek geliştirici', en: 'Solo developer'},
      {tr: 'OpenCV entegrasyonu', en: 'OpenCV integration'},
      {tr: 'Deneyim tasarımı', en: 'Experience design'},
    ],
    links: [],
  },
  {
    id: 'son-karar',
    title: 'Son Karar',
    category: 'game',
    year: '2025',
    studio: {tr: 'Google YZ Akademisi game jam · Ekip', en: 'Google AI Academy game jam · Team'},
    summary: {
      tr: 'Olayı kartlarla yeniden kurduğun bir mahkeme çıkarım oyunu; sırayı yanlış kurarsan suçlu sanık serbest kalır.',
      en: 'A courtroom deduction game where you rebuild the crime from cards — get the sequence wrong and a guilty suspect walks free.',
    },
    tagline: {tr: 'Karar, okuman kadar iyidir.', en: 'The verdict is only as good as your reading.'},
    body: [
      {
        tr: 'Önüne bir sanık geliyor ve dosyası açılıyor: olay anının yazılı kaydı. Önündeki kartları doğru sıraya dizerek olayı simüle etmen gerekiyor; okuduğunu anlama bir mekaniğe dönüşüyor.',
        en: 'A suspect is brought in and the case file opens: the written record of what happened. You simulate the event by laying the cards out in the right order — reading comprehension turned into a mechanic.',
      },
      {
        tr: 'Sırayı doğru kurarsan sanığın masum mu suçlu mu olduğunu doğru bulursun. Yanlış kurarsan sistem gerçeği değil senin hikâyeni izler: suçlu bir sanık masum çıkabilir.',
        en: 'Get it right and you correctly identify whether the suspect is innocent or guilty. Build the wrong chain and the system follows your story instead of the truth: a guilty suspect can walk free.',
      },
    ],
    cover: '/assets/images/sonkarar/sonkarar1.png',
    gallery: [img('sonkarar/sonkarar1.png'), img('sonkarar/sonkarar2.png'), img('sonkarar/sonkarar3.png')],
    tech: ['Unity', 'C#', 'Dialogue System', 'Timeline'],
    role: [
      {tr: 'Oyun geliştirici', en: 'Game developer'},
      {tr: 'Kart ve çıkarım sistemi', en: 'Card & deduction system'},
      {tr: 'UI geliştirme', en: 'UI development'},
    ],
    links: [],
  },
  {
    id: 'matrixle',
    title: 'Matrixle',
    category: 'game',
    year: '2025',
    studio: {tr: 'Üniversite dersi', en: 'University coursework'},
    summary: {
      tr: 'Eşleştirme, puanlama ve kelime havuzunun matris işlemleriyle çalıştığı, Unity ile yeniden yazılmış bir Wordle.',
      en: 'Wordle rebuilt in Unity where matching, scoring and the word pool all run on matrix operations.',
    },
    tagline: {tr: 'Matrislerle çözülen Wordle.', en: 'Wordle, solved with matrices.'},
    body: [
      {
        tr: 'Matrisler dersim için yapıp sunduğum bir proje. Oynanış klasik Wordle; fark altta: harf eşleştirme, kelime havuzu ve puan matris işlemleriyle hesaplanıyor.',
        en: 'Built and presented for my matrices course. The gameplay is classic Wordle; the difference is underneath — letter matching, the word pool and the score are all matrix operations.',
      },
      {
        tr: 'Tahmin girildiğinde satır sütun sütun hedefle karşılaştırılıyor. Her geçen satırla alınacak puan düşüyor; her doğru ya da yeri yanlış harf, satır-sütun çarpımı kadar puan ekliyor.',
        en: 'A guess is checked column by column against the target. Scoring drops with every row you spend, and each correct or misplaced letter adds its row-column product to the total.',
      },
    ],
    cover: '/assets/images/wordle/wordle1.png',
    gallery: [img('wordle/wordle1.png'), img('wordle/wordle2.png'), img('wordle/wordle3.png')],
    tech: ['Unity', 'C#', 'TextMeshPro', 'Matrix algorithms'],
    role: [
      {tr: 'Tek geliştirici', en: 'Solo developer'},
      {tr: 'Algoritma tasarımı', en: 'Algorithm design'},
    ],
    links: [{label: {tr: "itch.io'da oyna", en: 'Play on itch.io'}, url: 'https://xjerbugra.itch.io/matrixle'}],
  },
];

export interface Doc {
  label: L;
  url: string;
}

export interface Experience {
  period: L;
  title: L;
  org: string;
  text: L;
  isCurrent?: boolean;
  projects?: string[];
  docs?: Doc[];
}

export const EXPERIENCE: Experience[] = [
  {
    period: {tr: '2026 – Günümüz', en: '2026 – Present'},
    title: {tr: 'Oyun Geliştirici', en: 'Game Developer'},
    org: 'fourKland',
    isCurrent: true,
    text: {
      tr: "Steam'de yayınlanan Bet Shop Simulator üzerinde çalıştım; stüdyoda oyun geliştirmeye devam ediyorum.",
      en: 'Worked on Bet Shop Simulator, released on Steam, and keep building games with the studio.',
    },
    projects: ['bet-shop-simulator'],
  },
  {
    period: {tr: '2026', en: '2026'},
    title: {tr: 'Bağımsız Oyun Geliştirici', en: 'Indie Game Developer'},
    org: "M5's Studio",
    text: {
      tr: "Unity ile bağımsız masaüstü oyunları: sistemler, shader ve arayüz işleri, prototipten oynanabilir sürüme kadar. The Visagerer ve Cross The Line burada çıktı.",
      en: 'Desktop games in Unity as an independent studio — systems, shaders and interface work, from prototype to playable build. The Visagerer and Cross The Line came out of this run.',
    },
    projects: ['visagerer', 'cross-the-line'],
  },
  {
    period: {tr: 'Ağu – Eyl 2025', en: 'Aug – Sep 2025'},
    title: {tr: 'Proje Yönetimi Stajyeri', en: 'Project Management Intern'},
    org: 'Sca Social',
    text: {
      tr: 'Uzaktan, İstanbul. Proje yönetimi süreçlerinde çalıştım ve bu süreçlere veri bilimi pratiklerini taşıdım.',
      en: 'Remote, Istanbul. Worked inside project management processes and brought data science practice into them.',
    },
    docs: [
      {label: {tr: 'Referans mektubu', en: 'Reference letter'}, url: '/assets/docs/tnc_referans.pdf'},
      {label: {tr: 'Sertifika', en: 'Certificate'}, url: '/assets/docs/tnc_sertifika.pdf'},
    ],
  },
  {
    period: {tr: 'Oca – Ağu 2025', en: 'Jan – Aug 2025'},
    title: {tr: 'Yapay Zekâ ile Oyun Geliştirme', en: 'Game Development with AI'},
    org: 'Google AI & Technology Academy',
    text: {
      tr: 'Yapay zekâ destekli oyun geliştirme üzerine yoğun bir program: tasarım ilkeleri, model ve API entegrasyonu, modern üretim araçları. Buzzed Busted ve Son Karar bu programda yapıldı.',
      en: 'An intensive track on AI-assisted game development: design principles, model and API integration, modern production tooling. Buzzed Busted and Son Karar were built inside it.',
    },
    projects: ['buzzed-busted', 'son-karar'],
    docs: [
      {label: {tr: 'Mezuniyet', en: 'Graduation'}, url: '/assets/docs/mezuniyet.pdf'},
      {label: {tr: 'Unity sertifikası I', en: 'Unity certificate I'}, url: '/assets/docs/ileri.pdf'},
      {label: {tr: 'Unity sertifikası II', en: 'Unity certificate II'}, url: '/assets/docs/ai.pdf'},
      {label: {tr: 'Girişimcilik', en: 'Entrepreneurship'}, url: '/assets/docs/girisimcilik.pdf'},
      {label: {tr: 'Proje yönetimi (Coursera)', en: 'Project management (Coursera)'}, url: '/assets/docs/projeyonetimi.pdf'},
    ],
  },
  {
    period: {tr: 'Kas 2018 – Nis 2019', en: 'Nov 2018 – Apr 2019'},
    title: {tr: 'Web Geliştirme Stajyeri', en: 'Web Development Intern'},
    org: 'Insider One',
    text: {
      tr: 'İstanbul. Her şeyin başladığı yer: gerçek bir ekip içinde front-end ve grafik tasarım.',
      en: 'Istanbul. Where it started: front-end work and graphic design inside a real team.',
    },
  },
];

export const SKILLS: {title: L; items: string[]}[] = [
  {
    title: {tr: 'Oyun geliştirme', en: 'Game development'},
    items: ['Unity', 'C#', 'Game systems', 'Shaders & post-processing', 'Multiplayer', 'Game UI'],
  },
  {
    title: {tr: 'Yazılım ve yapay zekâ', en: 'Software & AI'},
    items: ['Flutter', 'Dart', 'AI integration', 'APIs', 'SQLite', 'OpenCV'],
  },
  {
    title: {tr: 'Tasarım', en: 'Design'},
    items: ['UI/UX', 'Interaction design', 'Level design'],
  },
];

export const CONTACT = {
  email: 'bghrndvc@gmail.com',
  links: [
    {label: 'GitHub', url: 'https://github.com/bugrahnd'},
    {label: 'LinkedIn', url: 'https://www.linkedin.com/in/bghrndvc/'},
    {label: 'itch.io', url: 'https://xjerbugra.itch.io'},
  ],
};
