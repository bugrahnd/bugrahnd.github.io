// Buğrahan Deveci — Proje Verileri
// Gallery için: assets/images/ klasörüne görsel ekle, path'i aşağıya yaz
const projectsData = [

    // ========== OYUNLAR ==========
    {
        id: 1,
        title: "The Visagerer",
        cardSize: "tall",
        category: "3d",
        description: "Müşterilerin gizli duygularını analiz ederek maskeler tasarladığınız psikolojik çıkarım oyunu.",
        tags: [],
        image: "assets/images/visagerer/kapak.jpeg", // Kapak Resmi
        image2: "assets/images/visagerer/A.png",
        image3: "assets/images/visagerer/1.png",
        image4: "assets/images/visagerer/2.png",
        image5: "assets/images/visagerer/3.png",
        demoUrl: null,
        downloadUrl: "https://ggjv4.s3.us-west-1.amazonaws.com/files/games/2026/883918/exec/maskeoyunuexe.zip?VersionId=NiEhM0NSAUvn7MyP_t1IqcrctZtmbesK",
        trailerUrl: null, // Örnek: "https://www.youtube.com/embed/VIDEO_ID"
        videoUrl: "",
        gallery: [
            // kapak.jpeg çıkarıldı
            'assets/images/visagerer/A.png',
            'assets/images/visagerer/1.png',
            'assets/images/visagerer/2.png',
            'assets/images/visagerer/3.png',
        ],
        details: {
            description: "Müşterilerin gizli duygularını analiz ederek onlara en uygun maskeleri ürettiğiniz psikolojik bir çıkarım oyunudur. Müşterilerin diyaloglarının ardındaki gerçek niyetleri çözüp (üzgün ama gizlemek isteyen veya masum görünmek isteyen bir katil gibi) doğru göz, ağız ve burun kombinasyonlarıyla maskeler tasarlamanız gerekir. Oyun, atmosferik birinci şahıs keşif deneyimi sunar ve oyuncuların müşterilerin duygusal durumlarını anlamak için ipuçları toplamasını gerektirir. Her müşteri, farklı bir hikaye ve gizem barındırır, bu da oyuncuların her seferinde yeni bir zorlukla karşılaşmasını sağlar.",
            technologies: ["Unity", "C#", "Post-Processing", "FMOD Audio","Volumetric Lighting"],
            role: [
                "M5's Studios - Game Jam Projesi",
                "Game Developer",
                "Level Design",
            ],
            github: null
        }
    },
    {
        
        id: 2,
        title: "Cross The Line",
        cardSize: "wide",     // 2 sütun yatay
        category: "3d",
        description: "Birinci Dünya Savaşı sığınağında geçen, gerilim dolu gerçekçi bir mors alfabesi simülasyonu.",
        tags: [],
        image: "assets/images/crosstheline/logo.png", // Kapak Resmi
        image2: "assets/images/crosstheline/1.png",
        image3: "assets/images/crosstheline/2.png",
        image4: "assets/images/crosstheline/3.png",
        image5: "assets/images/crosstheline/4.png",
        demoUrl: null,
        downloadUrl: "https://reshitsanchez.itch.io/cross-the-line",
        trailerUrl: "https://www.youtube.com/watch?v=5cRJjar2700",
        videoUrl: null,
        gallery: [
            // logo.png çıkarıldı
            'assets/images/crosstheline/1.png',
            'assets/images/crosstheline/2.png',
            'assets/images/crosstheline/3.png',
            'assets/images/crosstheline/4.png',
        ],
        details: {
            description: "Birinci Dünya Savaşı atmosferinde, bir sığınakta geçen gerilim dolu bir mors alfabesi simülasyonudur. Gelen şifreli mesajları dinleyip kod kitabıyla deşifre ederek doğru cevabı iletmeye çalışırsınız. Can barı veya menü gibi arayüzlerin olmadığı tamamen gerçekçi (diegetic) bir deneyim sunan bu oyunda, sadece üç hata hakkınız bulunur. Eğer haklar tüketilip bitirilirse hain ilan edilir ve oyun sona erer. Oyunun atmosferi, oyunculara savaşın kaosunu ve belirsizliğini hissettirmeyi amaçlar.",
            technologies: ["Unity", "C#", "Volumetric Lighting"],
            role: [
                "M5's Studios - Game Jam Projesi",
                "Game Developer",
                "Level Design",
                "UI/UX Tasarımı",
            ],
            github: null
        }
    },
    {
        id: 3,
        title: "Buzzed Busted",
        cardSize: "normal",     // dikey/uzun
        category: "3d",
        description: "Vahşi Batı temalı, strateji ve blöf odaklı 3D çok oyunculu parti ve kart oyunu.",
        tags: [],
        image: "assets/images/buzzed/logo.jpg", // Kapak Resmi
        image2: "assets/images/buzzed/anamenü.png",
        image3: "assets/images/buzzed/oyunici.png",
        image4: "assets/images/buzzed/1.png",
        image5: "assets/images/buzzed/2.png",
        image6: "assets/images/buzzed/3.png",
        image7: "assets/images/buzzed/4.png",
        image8: "assets/images/buzzed/5.png",
        demoUrl: null,
        downloadUrl: null,
        trailerUrl: null,
        videoUrl: null,
        gallery: [
            // logo.jpg kapak olduğu için çıkarıldı
            'assets/images/buzzed/anamenü.png',
            'assets/images/buzzed/oyunici.png',
            'assets/images/buzzed/1.png',
            'assets/images/buzzed/2.png',
            'assets/images/buzzed/3.png',
            'assets/images/buzzed/4.png',
            'assets/images/buzzed/5.png',
        ],
        details: {
            description: "Google YZTA Bootcamp'de geliştirilen Vahşi Batı temalı, 3D ve çok oyunculu bir \"party\" kart oyunudur. Kurnaz bir barmen ile cesur kovboylar arasındaki akıl oyunlarına odaklanan projede; barmen herkesi sarhoş edip saf dışı bırakmaya çalışırken, kovboylar ayık kalıp barmeni alt etmeye çalışır. Strateji, blöf ve şansın bir araya geldiği rekabetçi bir yapıya sahiptir",
            technologies: ["Unity", "C#", "Particle System", "Post-Processing"],
            role: [
                "Bootcamp Projesi — 5 Kişi",
                "Product Owner",
                "Game Developer",
                "Level Design",
                "Mekanik Tasarımı"
            ],
            github: "https://github.com/bugrahnd/bootcamp47"
        }
    },
    {
        id: 4,
        title: "Dilek Kaseti",
        cardSize: "normal",
        category: "3d",
        description: "Fiziksel etkileşimlerle (OpenCV) ilerleyen, yapay zeka destekli interaktif bir deneyim/hediye oyunu.",
        tags: [],
        image: "assets/images/dilekkutusu/logo.jpg", // Kapak Resmi
        image2: "assets/images/dilekkutusu/1.png",
        image3: "assets/images/dilekkutusu/gif.gif",
        image4: "assets/images/dilekkutusu/2.png",
        image5: "assets/images/dilekkutusu/3.png",
        image6: "assets/images/dilekkutusu/4.png",
        image7: "assets/images/dilekkutusu/5.png",
        demoUrl: null,
        downloadUrl: null,
        trailerUrl: null,
        videoUrl: null,
        gallery: [
            // logo.jpg kapak olduğu için çıkarıldı
            'assets/images/dilekkutusu/1.png',
            'assets/images/dilekkutusu/gif.gif',
            'assets/images/dilekkutusu/2.png',
            'assets/images/dilekkutusu/3.png',
            'assets/images/dilekkutusu/4.png',
            'assets/images/dilekkutusu/5.png',
        ],
        details: {
            description: "Yeni teknolojiler denemek ve interaktif bir deneyim sunmak amacıyla geliştirilmiş özel bir hediye oyunudur. OpenCV kütüphanesi entegrasyonu sayesinde oyuncunun ellerini birbirine sürtmesi, gözlerini kapatması veya mikrofona üflemesi gibi fiziksel etkileşimlerle ilerleyen üç farklı bölümden oluşur. Oyunun sonunda web kamerasından çekilen bir polaroid fotoğraf, MailKit kütüphanesi kullanılarak otomatik olarak belirlenen e-posta adresine gönderilir. Oyun, romantik bir atmosfer yaratmayı hedefler ve her bölümde oyuncunun duygusal bağ kurmasını sağlayacak özel anılar ve sürprizlerle doludur.",
            technologies: ["Unity", "C#", "Custom Shaders", "Audio System"],
            role: [
                "Solo Geliştirici",
                "Oyun & Deneyim Tasarımı",
                "OpenCV Entegrasyonu",
                "Mail Sistemi Entegrasyonu"
            ],
            github: null
        }
    },
    {
        id: 5,
        title: "Wordle Game",
        cardSize: "normal",   // "normal" | "wide" | "tall"
        category: "3d",
        description: "Matris algoritmaları kullanılarak geliştirilmiş, klasik Wordle oyununun Unity uyarlaması.",
        tags: [],
        image: "assets/images/wordle/wordle1.png", // Ana sayfa ve Sol Kolon Kapak Resmi
        image2: "assets/images/wordle/wordle2.png",
        image3: "assets/images/wordle/wordle3.png",
        demoUrl: null,
        downloadUrl: "https://xjerbugra.itch.io/matrixle",
        trailerUrl: null,
        videoUrl: null,
        gallery: [
            // wordle1.png kapak olduğu için buradan çıkarıldı
            'assets/images/wordle/wordle2.png',
            'assets/images/wordle/wordle3.png',
        ],
        details: {
            description: "Matris dersi için geliştirilmiş klasik Wordle oyununun algoritmik bir yorumudur. Projenin temel farkı; kelime doğruluğunun kontrol edilmesi (satır ve sütun bazlı tarama) ve skor hesaplama işlemlerinin tamamen matris işlemleri kullanılarak kurgulanmış olmasıdır.",
            technologies: ["Unity", "C#", "TextMeshPro"],
            role: [
                "Solo Geliştirici",
                "Algoritma Tasarımı (Matris)",
                "UI/UX Tasarımı"
            ],
            github: null
        }
    },
    
    {
        id: 6,
        title: "Son Karar",
        cardSize: "wide",     // 2 sütun yatay
        category: "3d",
        description: "Sanık dosyalarını ve ifadeleri inceleyerek olay örgüsünü kurduğunuz çıkarım ve dedektiflik oyunu.",
        tags: [],
        image: "assets/images/sonkarar/sonkarar1.png", // Kapak Resmi
        image2: "assets/images/sonkarar/sonkarar2.png",
        image3: "assets/images/sonkarar/sonkarar3.png",
        demoUrl: null,
        downloadUrl: null,
        trailerUrl: null,
        videoUrl: null,
        gallery: [
            // Kapak çıkarıldı
            'assets/images/sonkarar/sonkarar2.png',
            'assets/images/sonkarar/sonkarar3.png',
        ],
        details: {
            description: "Google YZTA Game Jam'inde geliştirilen olay yeri inceleme ve çıkarım oyunudur. Oyuncuya sunulan sanık dosyaları ve ifadeleri doğrultusunda, eldeki kartları doğru sırayla yerleştirerek olayı simüle etmeniz istenir. Okuduğunu anlama ve mantık yürütme üzerine kurulu bu sistemde, yanlış bir olay örgüsü kurmak suçlu bir sanığı masum çıkarabilir.",
            technologies: ["Unity", "C#", "Dialogue System", "Timeline"],
            role: [
                "Takım Projesi — Game Jam",
                "Game Developer",
                "Kart & Çıkarım Sistemi Tasarımı",
                "UI Geliştirme"
            ],
            github: null
        }
    },

    // ========== UYGULAMALAR ==========
    {
        id: 7,
        title: "Lupiego",
        galleryFit: "contain",
        cardSize: "tall",     // dikey - mobil ekranlar dikey güzel görünür
        category: "app",
        description: "Yapay zeka (AI) sohbet botu ve akıllı algoritmalarla desteklenmiş modern dil öğrenme uygulaması.",
        tags: [],
        image: "assets/images/lupiego/lupiego.png", // Kapak Resmi
        image2: "assets/images/lupiego/main-screen.png",
        image3: "assets/images/lupiego/register-screen.png",
        image4: "assets/images/lupiego/login-screen.png",
        image5: "assets/images/lupiego/profil.png",
        image6: "assets/images/lupiego/bildirim-screen.png",
        image7: "assets/images/lupiego/chatbot-mockup.png",
        image8: "assets/images/lupiego/game.png",
        image9: "assets/images/lupiego/translate.png",
        image10: "assets/images/lupiego/flashcard.png",
        image11: "assets/images/lupiego/poster.jpg",
        demoUrl: "https://bugrahnd.github.io/LUPIEGO/",
        downloadUrl: null,
        trailerUrl: null,
        videoUrl: null,
        gallery: [
            // lupiego.png kapak olduğu için çıkarıldı
            'assets/images/lupiego/main-screen.png',
            'assets/images/lupiego/register-screen.png',
            'assets/images/lupiego/login-screen.png',
            'assets/images/lupiego/profil.png',
            'assets/images/lupiego/bildirim-screen.png',
            'assets/images/lupiego/chatbot-mockup.png',
            'assets/images/lupiego/game.png',
            'assets/images/lupiego/translate.png',
            'assets/images/lupiego/flashcard.png',
            'assets/images/lupiego/poster.jpg',
        ],
        details: {
            description: "Flutter ile geliştirilmiş, Yapay zeka entegrasyonuyla öne çıkan kapsamlı bir dil öğrenme uygulamasıdır. Uygulama içerisinde; aralıklı tekrar (spaced repetition) tabanlı akıllı kelime kartları , SQLite ile kullanıcı seviyesini algılayan AI sohbet botu , bağlam destekli akıllı çeviri motoru ve kelime dağarcığını geliştiren Wordle tarzı mini oyunlar bulunur",
            technologies: ["Flutter", "Dart", "Provider", "SharedPreferences"],
            role: [
                "Solo Geliştirici",
                "Mobile Developer (Flutter)",
                "AI Entegrasyonu",
                "UI/UX Tasarımı"
            ],
            github: null
        }
    },
    {
        id: 8,
        title: "Meshly - Deprem Chat",
        galleryFit: "contain",
        cardSize: "wide",
        category: "app",
        description: "Afet anlarında internetsiz (P2P) iletişimi sağlayan, uçtan uca şifreli acil durum haberleşme ağı.",
        tags: [],
        image: "assets/images/meshly/logo.png", // Kapak Resmi
        image2: "assets/images/meshly/1.png",
        image3: "assets/images/meshly/2.png",
        image4: "assets/images/meshly/poster.png",
        demoUrl: "https://bugrahnd.github.io/Meshly/",
        downloadUrl: null,
        trailerUrl: null,
        videoUrl: null,
        gallery: [
            // logo.png kapak olduğu için çıkarıldı
            'assets/images/meshly/1.png',
            'assets/images/meshly/2.png',
            'assets/images/meshly/poster.png',
        ],
        details: {
            description: "Afet durumlarında baz istasyonu veya internet gibi altyapılara ihtiyaç duymadan, cihazlar arası (P2P) çalışan çevrimdışı bir iletişim ağıdır. Wi-Fi Direct ve Bluetooth teknolojilerini kullanarak telefonları birer röle istasyonuna çeviren sistem , kopuk ağlarda bile \"sakla ve ilet\" (store-and-forward) mantığıyla mesajları iletir. TÜBİTAK 2209-A kapsamında geliştirilen projede ayrıca AES-256 uçtan uca şifreleme ve harita üzerinden gerçek zamanlı konum takibi özellikleri yer alır.",
            technologies: ["Flutter", "Dart", "Mesh Network", "Bluetooth", "Location Services", "AES Encryption", "P2P Communication"],
            role: [
                "Solo Geliştirici",
                "Mobile Developer (Flutter)",
                "P2P Ağ Mimarisi",
                "Şifreleme Sistemi (AES-256)",
                "TÜBİTAK 2209-A Projesi"
            ],
            github: null
        }
    }
];

window.projectsData = projectsData;