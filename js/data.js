/* Buğrahan Deveci — site content.
   Projects render into the work grid and the detail modal.
   featured: shown in the curated top block. The rest appear when the archive expands. */

const PROJECTS = [
  {
    id: 'visagerer',
    title: 'The Visagerer',
    kicker: 'Feature project',
    featured: true,
    category: 'Game',
    year: '2026',
    studio: "M5's Studio · Game jam",
    summary: 'A psychological deduction game where you read what customers really mean and craft the mask they actually need.',
    tagline: 'Faces lie, but masks reveal the truth.',
    tags: ['Psychological deduction', 'Unity', 'C#', 'Game design'],
    cover: 'assets/images/visagerer/kapak.jpeg',
    gallery: [
      'assets/images/visagerer/A.png',
      'assets/images/visagerer/1.png',
      'assets/images/visagerer/2.png',
      'assets/images/visagerer/3.png'
    ],
    body: [
      'You play a mask maker. Customers arrive with a request, but their words rarely match their feelings — someone grieving who wants to look untouched, a killer who wants to look innocent. Your job is to read the dialogue, deduce the real emotion underneath it, and build the mask out of the right eyes, mouth and nose.',
      'The game is a first-person atmospheric experience: every customer carries their own story and hidden agenda, so each order is a fresh reading problem. Three difficulty levels change how much the dialogue gives away.'
    ],
    tech: ['Unity', 'C#', 'Post-Processing', 'FMOD Audio', 'Volumetric Lighting'],
    role: ['Game developer', 'Level design', 'Mask & deduction system'],
    links: [
      { label: 'Download build', url: 'https://ggjv4.s3.us-west-1.amazonaws.com/files/games/2026/883918/exec/maskeoyunuexe.zip?VersionId=NiEhM0NSAUvn7MyP_t1IqcrctZtmbesK' }
    ]
  },
  {
    id: 'crosstheline',
    title: 'Cross The Line',
    kicker: 'Selected work',
    featured: true,
    category: 'Game',
    year: '2026',
    studio: "M5's Studio · Game jam",
    summary: 'A WWI bunker sim built on real Morse timing — no HUD, no menus, three mistakes and you are done.',
    tagline: 'Wars are fought with bullets, but won with information.',
    tags: ['Simulation', 'Unity', 'C#', 'Diegetic UI'],
    cover: 'assets/images/crosstheline/logo.png',
    gallery: [
      'assets/images/crosstheline/1.png',
      'assets/images/crosstheline/2.png',
      'assets/images/crosstheline/3.png',
      'assets/images/crosstheline/4.png'
    ],
    body: [
      'Deep inside a concrete bunker you are the last communication line of the northern front. Encrypted Morse signals come in; you decode them with the code book, write the answer on the slip and send it back on the telegraph key. High command does not forgive mistakes.',
      'Everything is diegetic — no health bar, no menu. Only the desk, the books, the slips and the key. The Morse simulation follows military timing standards, and the sound design carries the war happening on the other side of the wall. Three errors and the line goes silent.'
    ],
    tech: ['Unity', 'C#', 'Volumetric Lighting', 'Procedural audio'],
    role: ['Game developer', 'Level design', 'UI/UX design'],
    links: [
      { label: 'Play on itch.io', url: 'https://reshitsanchez.itch.io/cross-the-line' },
      { label: 'Watch trailer', url: 'https://www.youtube.com/watch?v=5cRJjar2700' }
    ]
  },
  {
    id: 'meshly',
    title: 'Meshly',
    kicker: 'Selected work',
    featured: true,
    category: 'App',
    year: '2026',
    studio: 'TÜBİTAK 2209-A project',
    summary: 'An offline, serverless P2P mesh network that keeps people talking when disaster takes the infrastructure down.',
    tagline: 'Resilient communication for disaster zones.',
    tags: ['Mesh network', 'Flutter', 'Encryption', 'P2P'],
    cover: 'assets/images/meshly/logo.png',
    gallery: [
      'assets/images/meshly/1.PNG',
      'assets/images/meshly/2.PNG',
      'assets/images/meshly/poster.png'
    ],
    body: [
      'During a disaster the communication infrastructure is usually the first thing to fail. Meshly turns the phone already in your pocket into part of a decentralised network — no base station, no internet, no central server that can go down with everything else.',
      'Every device works as both client and relay over Bluetooth and Wi-Fi Direct. Messages hop between phones until they reach their target, and a store-and-forward layer holds them in memory when the path is broken, delivering as soon as a carrier comes back into range. Range grows with the number of users instead of shrinking.',
      'Every message is AES-256 encrypted before it enters the network, so a stranger listening in gets nothing readable. A live map layer broadcasts location every ten seconds, so finding people is as solvable as reaching them.'
    ],
    tech: ['Flutter', 'Dart', 'Bluetooth & Wi-Fi Direct', 'AES-256', 'Geolocator', 'P2P routing'],
    role: ['Solo developer', 'P2P network architecture', 'Encryption layer', 'TÜBİTAK 2209-A researcher'],
    links: [{ label: 'Open project page', url: 'https://bugrahnd.github.io/Meshly/' }]
  },
  {
    id: 'lupiego',
    title: 'Lupiego',
    kicker: 'Supporting work',
    featured: true,
    category: 'App',
    year: '2025',
    studio: 'Solo project',
    summary: 'An AI-assisted language learning app: adaptive flashcards, a level-aware chat partner and contextual translation.',
    tagline: 'Learning a language, without the clutter.',
    tags: ['AI', 'Flutter', 'Mobile', 'UI/UX'],
    cover: 'assets/images/lupiego/lupiego.png',
    gallery: [
      'assets/images/lupiego/main-screen.png',
      'assets/images/lupiego/register-screen.png',
      'assets/images/lupiego/login-screen.png',
      'assets/images/lupiego/profil.png',
      'assets/images/lupiego/bildirim-screen.png',
      'assets/images/lupiego/chatbot-mockup.png',
      'assets/images/lupiego/game.png',
      'assets/images/lupiego/translate.png',
      'assets/images/lupiego/flashcard.png',
      'assets/images/lupiego/poster.jpg'
    ],
    galleryFit: 'contain',
    body: [
      'A full language learning app built in Flutter, with the AI work as the centre of it. The chat partner reads the learner level from SQLite-backed user data and adapts the conversation to it, so practice stays just above comfort instead of drifting into either boredom or noise.',
      'Around it: spaced-repetition flashcards that show hard words more often and known words less, a translation engine that returns usage examples, synonyms and pronunciation rather than a bare string, a Wordle-style word game, and a profile layer with streaks, badges and smart reminders.'
    ],
    tech: ['Flutter', 'Dart', 'SQLite', 'Provider', 'SharedPreferences', 'AI chat integration'],
    role: ['Solo developer', 'Mobile developer (Flutter)', 'AI integration', 'UI/UX design'],
    links: [{ label: 'Open project page', url: 'https://bugrahnd.github.io/LUPIEGO/' }]
  },
  {
    id: 'buzzed',
    title: 'Buzzed Busted',
    kicker: 'Archive',
    featured: false,
    category: 'Game',
    year: '2025',
    studio: 'Google AI Academy bootcamp · 5 people',
    summary: 'A Wild West 5-player party card game — one bartender, four cowboys, and a lot of bluffing.',
    tagline: 'Stay sober. Outplay the bartender.',
    tags: ['Multiplayer', 'Unity', 'C#', '3D'],
    cover: 'assets/images/buzzed/logo.jpg',
    gallery: [
      'assets/images/buzzed/anamenü.png',
      'assets/images/buzzed/oyunici.png',
      'assets/images/buzzed/1.png',
      'assets/images/buzzed/2.png',
      'assets/images/buzzed/3.png',
      'assets/images/buzzed/4.png',
      'assets/images/buzzed/5.png'
    ],
    body: [
      'A 3D multiplayer party card game set in a Wild West saloon. The bartender wins by getting every cowboy drunk and out of the game; the cowboys win by staying sober, reading the bartender\'s tricks and taking them down.',
      'Every card and every guess shifts the table, so the game lives in the mix of strategy, risk and bluff rather than in raw luck. Built with a five-person team during the Google AI & Technology Academy bootcamp, where I ran product ownership alongside development.'
    ],
    tech: ['Unity', 'C#', 'Multiplayer', 'Particle System', 'Post-Processing'],
    role: ['Product owner', 'Game developer', 'Level design', 'Mechanics design'],
    links: [{ label: 'View on GitHub', url: 'https://github.com/bugrahnd/bootcamp47' }]
  },
  {
    id: 'dilekkaseti',
    title: 'Wish Cassette',
    kicker: 'Archive',
    featured: false,
    category: 'Game',
    year: '2025',
    studio: 'Solo project',
    summary: 'An interactive gift game driven by real physical input — rubbing hands, closing eyes and blowing into the mic, read through OpenCV.',
    tagline: 'A gift you have to play to receive.',
    tags: ['OpenCV', 'Unity', 'Interactive', 'C#'],
    cover: 'assets/images/dilekkutusu/logo.jpg',
    gallery: [
      'assets/images/dilekkutusu/1.png',
      'assets/images/dilekkutusu/gif.gif',
      'assets/images/dilekkutusu/2.png',
      'assets/images/dilekkutusu/3.png',
      'assets/images/dilekkutusu/4.png',
      'assets/images/dilekkutusu/5.png'
    ],
    body: [
      'Built as a gift, and as an excuse to push into input methods I had not used before. Three chapters, each one driven by something you physically do in front of the camera or the microphone.',
      'In the first chapter the character is freezing: you collect nine logs, throw them on the fire, then rub your hands together in front of the webcam — OpenCV reads the motion and fills the ignition bar. To move on you close your eyes, which is both the warming beat and the transition into the dream.',
      'The second chapter is a town of dead televisions: find the cassettes, but first blow hard into the microphone to launch the wish lantern that lights the path. The third is the payoff — the character sits by the sea, lanterns rise, and a polaroid camera appears. Every shot it takes from the webcam is mailed automatically through MailKit to a preset address, with a preset title and message.'
    ],
    tech: ['Unity', 'C#', 'OpenCV', 'MailKit', 'Custom Shaders', 'Audio system'],
    role: ['Solo developer', 'Game & experience design', 'OpenCV integration', 'Mail pipeline'],
    links: []
  },
  {
    id: 'sonkarar',
    title: 'Son Karar',
    kicker: 'Archive',
    featured: false,
    category: 'Game',
    year: '2025',
    studio: 'Google AI Academy game jam · Team',
    summary: 'A courtroom deduction game where you rebuild the crime from cards — get the sequence wrong and a guilty suspect walks free.',
    tagline: 'The verdict is only as good as your reading.',
    tags: ['Deduction', 'Unity', 'C#', 'Narrative'],
    cover: 'assets/images/sonkarar/sonkarar1.png',
    gallery: [
      'assets/images/sonkarar/sonkarar2.png',
      'assets/images/sonkarar/sonkarar3.png'
    ],
    body: [
      'A suspect is brought in and the case file opens: the written record of what happened at the scene. In front of you sits a set of cards, and your task is to simulate the event by laying them out in the right order — reading comprehension turned into a mechanic.',
      'Get the sequence right and you correctly identify whether the suspect is innocent or guilty. Build the wrong chain of events and the system follows your reconstruction instead of the truth: a guilty suspect can be released as innocent because your story said so.'
    ],
    tech: ['Unity', 'C#', 'Dialogue System', 'Timeline'],
    role: ['Game developer', 'Card & deduction system design', 'UI development'],
    links: []
  },
  {
    id: 'wordle',
    title: 'Matrixle',
    kicker: 'Archive',
    featured: false,
    category: 'Game',
    year: '2025',
    studio: 'University coursework',
    summary: 'Wordle rebuilt in Unity where matching, scoring and the word pool all run on matrix operations.',
    tagline: 'Wordle, solved with matrices.',
    tags: ['Algorithms', 'Unity', 'C#', 'Coursework'],
    cover: 'assets/images/wordle/wordle1.png',
    gallery: [
      'assets/images/wordle/wordle2.png',
      'assets/images/wordle/wordle3.png'
    ],
    body: [
      'Built and presented for my matrices course. The gameplay is classic Wordle; the difference is underneath — letter matching, the word pool and the score are all expressed as matrix operations.',
      'When a guess is submitted the row is checked column by column against the target to mark present and correct letters. Scoring drops with every row you spend, and each correct or misplaced letter adds its row-column product to the total, so solving early is worth measurably more.'
    ],
    tech: ['Unity', 'C#', 'TextMeshPro', 'Matrix algorithms'],
    role: ['Solo developer', 'Algorithm design (matrices)', 'UI/UX design'],
    links: [{ label: 'Play on itch.io', url: 'https://xjerbugra.itch.io/matrixle' }]
  }
];

const JOURNEY = [
  {
    year: '2026',
    title: 'Indie game developer — M5\'s Studio',
    state: 'Ongoing',
    accentState: true,
    text: 'Building desktop games in Unity as an independent studio — systems, shaders and interface work, from prototype through playable build. The Visagerer and Cross The Line came out of this run.',
    tags: ['Unity', 'C#', 'Game design', 'Indie'],
    docs: []
  },
  {
    year: '2025',
    title: 'Project management intern — Sca Social',
    state: 'Internship',
    text: 'Aug – Sep 2025 · Remote, Istanbul. Worked inside project management processes and brought data science practice into them. First properly professional business development experience.',
    tags: ['Project management', 'Data science', 'IT law'],
    docs: [
      { label: 'Reference letter', sub: 'Sca Social', url: 'assets/docs/tnc_referans.pdf' },
      { label: 'Certificate', sub: 'Sca Social', url: 'assets/docs/tnc_sertifika.pdf' }
    ]
  },
  {
    year: '2025',
    title: 'Game development with AI — Google AI & Technology Academy',
    state: 'Program',
    text: 'Jan – Aug 2025 · Remote, Istanbul. An intensive track on AI-assisted game development: design principles, model and API integration, and modern production tooling. Buzzed Busted and Son Karar were built inside it.',
    tags: ['Game design', 'AI integration', 'APIs'],
    docs: [
      { label: 'Graduation', sub: 'Google AI Academy', url: 'assets/docs/mezuniyet.pdf' },
      { label: 'Unity certificate I', sub: 'Google AI Academy', url: 'assets/docs/ileri.pdf' },
      { label: 'Unity certificate II', sub: 'Google AI Academy', url: 'assets/docs/ai.pdf' },
      { label: 'Entrepreneurship', sub: 'Google AI Academy', url: 'assets/docs/girisimcilik.pdf' },
      { label: 'Project management', sub: 'Coursera', url: 'assets/docs/projeyonetimi.pdf' }
    ]
  },
  {
    year: '2018',
    title: 'Web development intern — Insider One',
    state: 'Origin',
    text: 'Nov 2018 – Apr 2019 · Istanbul. Where it started: front-end work inside a real team, plus graphic design, and the habit of shipping things people can actually open.',
    tags: ['HTML', 'CSS', 'JavaScript', 'Graphic design'],
    docs: []
  }
];

window.PROJECTS = PROJECTS;
window.JOURNEY = JOURNEY;
