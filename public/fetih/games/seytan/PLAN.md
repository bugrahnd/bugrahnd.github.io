# Şeytan Avı: yapılanlar ve plan

Durum tarihi: 22 Kasım 2026

## Oyunun kuralı (tur yapısı, 2 dakika)

- Şeytanın bir can barı var; şeytan sahnede kaçıp saklanıyor.
- Beğeniler küçük taş atar. Hediyeler büyük taş, kaya yağmuru, mancınık atışı ya da kayan yıldız olur.
- Her isabette gönderenin adı ekranda belirir.
- Can barı süre bitmeden sıfırlanırsa şeytan kaçar ve tur kazanılır; "Turun en çok taş atanı" gösterilir.
- Süre biterse şeytan kahkaha atar ve yeni tur başlar.

## Yapılanlar (çalışıyor, 2D sürüm)

### Oyun ve köprü
- `games/seytan/` baştan yazıldı. Eski klasör, Halat Çekme'nin `id: "halat"` olarak kalmış yarım bir kopyasıydı; sunucu onu hiç yüklemiyordu.
- `oyun.json`: kimliği `seytan`, adı "Şeytan Avı", durumu `hazir`. Panel komutları: turu yeniden başlat, turu bitir, günlük skoru sıfırla. Simülatör profili `none` (katılım yok; beğeni ve hediye doğrudan taş atar).
- Ayarlar (`js/settings-def.js`, `settings.mjs`): tur süresi, sonuç ekranı ve geri sayım süresi; şeytanın canı, canın kendini ayarlaması (kazanılınca +%25, kaybedilince −%15), saklanma, siperde işleyen hasar, kaçma hızı; beğeni taşı açık/kapalı ve hasarı, jeton başına hasar, kademe eşikleri (kaya yağmuru 10, mancınık 100, kayan yıldız 1000 jeton); isimler, hediye rehberi ve canlı sıralama.
- Tur akışı: geri sayım → oyun → kazanma (şeytan kaçar, kazanma kartı) ya da kahkaha (kahkaha kartı) → yeni tur.
- Tur arası gelen hediyeler kaybolmaz: kuyruğa alınır ve yeni turda atılır. Tur biterken havada kalan hediye taşları da sonraki tura aktarılır.
- Simülatörden canlı yayına geçince her şey sıfırlanır.
- Demo modu (`?demo=1`): sayfa içinde sahte izleyiciler beğeni ve hediye gönderir.
- Test karesi (`?demo=1&shot=open|hurt|hide|laugh|win|meteor`): oyunu belli bir ana kadar ileri alıp tek kare dondurur.
- TikTok güvenli alanı: yazılar sohbet çizgisinin üstünde kalır; sağdaki kalp/hediye sütununa taşmaz.
- Sesler: repodaki CC0 dosyalardan kopyalandı (`assets/CREDITS.md`). Kahkaha sesi Web Audio ile üretiliyor.

### Görsel (2D, `js/art.js`, `js/fx.js`, `js/noise.js`)
- Ay ışığında bir Osmanlı avlusu: hilal ve yanında yıldız, Samanyolu, bulutlar; kubbeli ve minareli camiler, mahya ışıkları; denizde ay yansıması; taş korkuluk, perspektifli taş zemin, sekiz köşeli yıldız kakma, titreyen fenerler.
- Saklanma yerleri: kırmızı-beyaz taşlı (ablak) sivri kemerli eski duvar ve içinde asılı kandil, alacalı çınar (gövde ve dallar), yosunlu kayalar.
- Şeytan: "dumansız ateşten" bir cin. Boynuzlu, kor gözlü, alt gövdesi duman ve aleve dönüşüyor. Canı azaldıkça derisinde parlayan çatlaklar beliriyor.
- Gerçekçilik: gürültü dokuları, ay ışığı gölgelendirmesi, kenar kararması, film greni.
- Arayüz: lacivert-altın renkler, sekiz köşeli yıldız süsleri.
- Kutsal yazı ya da Kâbe kullanılmadı. İbadet yerleri yalnızca uzak arka planda; şeytan hiçbirinin arkasına saklanmıyor.

## Devam eden iş: 3D sürüm

İstenen: oyun sahnesiyle birlikte 3D olsun. Önceki istekler de 3D sürümde yapılıyor:
- isimler küçülsün,
- şeytan büyüsün,
- hediye gönderenler alt tarafta avatarla belirip taşı oradan atsın (animasyonlu),
- efektler daha detaylı olsun.

### 3D modüller (three.js 0.187), 22 Kasım 2026'da oyuna bağlandı

| Dosya | İçerik |
|---|---|
| `js/proj.js` | Kamera ve izdüşüm matematiği. z = 0 düzlemi, 1080×1920 tasarım koordinatlarına birebir oturuyor; tur mantığı, arayüz ve isimler piksel koordinatıyla çalışmaya devam ediyor (`toWorld`, `toScreen`). |
| `js/world3d.js` | Renderer, ACES ton eşleme, gölgeler, sis, bloom (UnrealBloomPass). Sahne: boyalı gökyüzü (hilal ve yıldız), 3D camiler (kubbe, yarım kubbe, minare, şerefe ışıkları, mahya), shader'lı deniz (ay yolu), korkuluk, döşeme, yıldız kakma, ışık saçan fenerler. Saklanma yerleri: ablak kemerli duvar ve kandil ışığı, gürültüyle şekillenmiş kayalar, çınar. Mancınık modeli (`makeCatapult`). |
| `js/devil3d.js` | 3D şeytan, ölçeği büyütüldü (`DEVIL_BASE = 0.85`). Kaslı gövde, kemikli boynuzlar, parlayan gözler, ifadeler (sırıtma, acı, kahkaha, sersem, korku), kol pozları, shader'lı duman ve ateş alt gövdesi, avluyu aydınlatan ateş ışığı, parlayan çatlaklar. |
| `js/thrower3d.js` | Hediye gönderen figürleri: başı izleyicinin avatar madalyonu olan cüppeli bir figür. Avluya düşer, şeytana döner, taşı geriye alıp başının üstünden savurarak atar; kaya yağmuru ve kayan yıldızda kollarını kaldırır, mancınıkta hedefi gösterir. Art arda gelen hediyelerde ×N sayacı çıkar, boşta kalınca ayrılır. |
| `js/vfx3d.js` | GPU parçacıkları (parıltı, ateş, kor, duman, toz), kıvılcım çizgileri, yere düşüp seken taş parçaları (gölgeli), şok dalgası halkaları, çarpma ışıkları, taş modelleri, kamera sarsıntısı. |
| `js/overlay.js` | 2D katman: küçültülmüş isim ve hasar yazıları, figürlerin isim etiketleri, kenar kararması, film greni. |

### Yapılanlar (3D bağlantısı)
1. ✅ `js/game.js` 3D'ye bağlandı. Tur mantığı tasarım pikseli + derinlik (z) ile çalışıyor:
   - Taşlar dünya koordinatında yay çizerek uçuyor. Hediye taşları figürün elinden (`Throwers.onRelease`), beğeni taşları kameranın altından geliyor.
   - Kaya yağmuru şeytanın üstünden düşüyor; kayan yıldız arkadan, sağ üstten (z ≈ −34) geliyor.
   - Mancınık 3D model (`makeCatapult`): soldan gelir, kolu savrulur, yanan gülleyi kepçeden atar, çekip gider.
   - Şeytanın derinliği yumuşakça değişiyor: saklanırken z ≈ −1,4 (nesnelerin arkası), açıkta z ≈ +1,1. Siper kırılınca öne çıkıyor.
   - Efektler `Vfx3D`'ye, isimler ve yazılar `Overlay`'e gidiyor; şeytan duman ve kor saçıyor. Siper kırılınca nesne sallanıyor (`wobble`).
2. ✅ `js/main.js`: `#world` (three.js) ve `#overlay` (2D) tuvalleri; güncelle → 3D çiz → katman çiz. Yeniden boyutlandırmada `world.resize` ve `vfx.setViewport`; çizim en fazla 1080×1920 piksel. Test karesi (`?shot=`) 3D'de çalışıyor.
3. ✅ `index.html` import map'i, iki tuval; `oyun.json`'da `"vendor": ["three"]`. Build göreli yola çeviriyor (kontrol edildi).
4. ✅ `art.js` ve `fx.js` kaldırıldı.
5. ✅ Açık noktalar boynuzlar can barına değmeyecek yükseklikte (`OPEN_SPOTS`, en üst y = 600). Zemin kameranın önüne kadar uzatıldı (eskiden sohbet bandında boş bir şerit kalıyordu).
6. ⏳ Avatarlar: TikTok CDN resimleri CORS izni vermezse baş harfli renkli yedek madalyon kullanılıyor; canlı yayında kontrol et.

### Ölçümler (22 Kasım 2026, RTX 4050 dizüstü)
- 1080×1920, kaos trafiği (`?demo=chaos&fps=1&res=1080`): ortalama 102 FPS, en kötü kare 23 ms. Bloom ve gölgeleri küçültmeye gerek görülmedi.
- `?fps=1`: sol altta FPS göstergesi. `?res=1080`: pencere küçük olsa da tam kareyi çizer (yalnızca test).

### Sakura teması (22 Kasım 2026, varsayılan)
- Referans: `reference/shrine-night.webp`, stil sözleşmesi `reference/style.json` (gözlenen / tasarlanan ayrımıyla).
- `js/shrine3d.js`: gece Japon tapınak avlusu (taş yol, basamaklar, torii, ahşap yapılar, sakura ve süzülen yapraklar, taş fenerler, sokak lambaları, çitler, şeytanın taş halkalı ateş çukuru). Saklanma: sakura, kaya bahçesi, küçük tapınak.
- Kalabalık: tek parçaya birleştirilmiş kapüşonlu lacivert cüppeli figürler (altın şeritler, sırtta amblem), avatar sadece oynarken görünür. Mancınık kalabalığın arkasına gelir.
- Arayüz `html.tema-sakura`: hediye kutuları sağda numaralı dikey sütun (y < 950, TikTok sağ düğmelerinin üstünde).
- `?tema=osmanli` eski Osmanlı avlusunu açar.
- Ölçüm: 1080×1920 kaos trafiği ortalama 83 FPS, en düşük 56 (süs nesneleri gölge düşürmüyor).

### Kalanlar
- Avatar kontrolü (madde 6) gerçek yayında.
- Ekranın altında sürekli duran hediye rehberi (`view.ladder`) ve beğeni karşılığı taş (`like.enabled`), TikTok'un "mekanik hediye talebi" ve "etkileşim karşılığı ödül" kısıtlamalarına takılabilir (Plaka Savaşları bu yüzden kısıtlandı). Yayına çıkmadan önce bu ikisini kapatmayı düşünün.
7. ✅ Başarım ölçüldü (yukarıda).
8. ✅ Doğrulama: demo (düşük ve kaos), test kareleri (hurt, hide, meteor, laugh), mancınık, köprü modu (bağlantı, `restartRound` komutu, enjekte hediye), `?zones=1`, `node scripts/build-demo.mjs` ve derlenmiş kopyanın demo modu; konsolda hata yok.
9. Site kopyasını (`dist/fetih/`) yeniden üretip yükle: yayın yokken yapılmalı (yükleme sitenin adresini değiştirebilir).

## Çalıştırma

```bash
npm install
npm start
```

- Demo: <http://localhost:3000/games/seytan/?demo=1>
- Yayın sayfası: <http://localhost:3000/games/seytan/?yayin=1>
- Panel: <http://localhost:3000/panel/>
