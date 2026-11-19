# bugrahnd.com.tr

Buğrahan Deveci'nin portfolio sitesi. React + Vite, Astryx tasarım sistemi (chocolate tema), Three.js, TR/EN.

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ klasörüne derler
```

## Görünüm

- Ana sayfa: `src/designs/MagazineHome.tsx` (editoryal serif dergi düzeni, Astryx `chocolate` teması, Fraunces başlıklar).
- 3D: `src/three/`. Sayfanın arkasında tek sabit WebGL tuvali (`World.tsx`) var; hero ekranı, parçacıklar, proje halkası (`ProjectRing.tsx`) ve sıvı form (`LiquidBlob.tsx`) bu tuvale drei `View` ile çizilir.
- Animasyonlar: `src/components/ui/` altındaki Magic UI bileşenleri (21st.dev'de de listelenen; Tailwind + motion). Sayfalara `src/fx.tsx` ve `src/designer.tsx` üzerinden bağlanır.

## İçerik

- Projeler, deneyim, yetenekler ve iletişim: `src/data.ts`. Her metin `{tr, en}` çiftidir.
- Arayüz metinleri: `src/i18n.tsx` içindeki `UI`.
- Görseller ve PDF'ler: `public/assets/`. Yeni proje görselleri `public/assets/images/<proje>/` altına.
- Tarayıcıda oynanan Unity oyunları: `public/numbo/`, `public/tileup/`.

## Yayın

`main` dalına her push'ta `.github/workflows/deploy.yml` siteyi derleyip GitHub Pages'e yayınlar.
Repo ayarlarında **Settings → Pages → Source** bir kez **GitHub Actions** olarak seçilmelidir.
