# 🌅 Sunset Theme Portfolio Website

Modern, 3D elementli ve sunset temalı portfolio web sitesi. Three.js ile oluşturulmuş etkileyici 3D geometrik şekiller ve smooth animasyonlar içerir.

## ✨ Özellikler

- 🎨 Sunset gradient color palette (Turuncu, Pembe, Mor, Sarı)
- 🔮 Three.js ile 3D geometrik şekiller (Icosahedron, Octahedron, Torus, Dodecahedron)
- 🎬 Smooth animasyonlar ve geçişler
- 📱 Responsive tasarım (Mobil, tablet, desktop)
- 🎯 Proje detay sayfaları
- 📹 Video entegrasyonu desteği
- 💾 EXE/APK indirme linkleri
- 🌐 Canlı demo linkleri
- 📧 İletişim formu

## 📁 Dosya Yapısı

```
portfolio-site/
├── index.html              # Ana sayfa
├── project.html            # Proje detay sayfası
├── css/
│   ├── style.css          # Ana stil dosyası
│   └── project-detail.css # Proje detay stilleri
├── js/
│   ├── 3d-scene.js        # Three.js 3D sahne
│   ├── animations.js       # Animasyonlar
│   ├── projects-data.js   # Proje verileri
│   ├── project-detail.js  # Proje detay sayfası JS
│   └── main.js            # Ana JavaScript
├── assets/
│   ├── images/            # Görseller
│   └── videos/            # Videolar
└── projects/              # Proje dosyaları (EXE, APK vb.)
```

## 🚀 Kullanım

### 1. Dosyaları Açma

Projeyi kullanmak için tüm dosyaları bir klasöre kaydedin ve `index.html` dosyasını tarayıcıda açın.

### 2. Proje Ekleme

`js/projects-data.js` dosyasını düzenleyerek kendi projelerinizi ekleyin:

```javascript
{
    id: 9, // Benzersiz ID
    title: "Proje Adı",
    category: "web", // web, 3d, veya app
    description: "Kısa açıklama",
    tags: ["React", "Node.js", "MongoDB"],
    image: "assets/images/project-image.jpg", // Opsiyonel
    demoUrl: "https://demo.com", // Opsiyonel
    downloadUrl: "/projects/app.apk", // Opsiyonel
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID", // Opsiyonel
    details: {
        description: "Detaylı açıklama",
        features: [
            "Özellik 1",
            "Özellik 2"
        ],
        technologies: ["React", "Node.js"],
        challenges: "Karşılaşılan zorluklar",
        github: "https://github.com/username/repo" // Opsiyonel
    }
}
```

### 3. Profil Bilgilerini Güncelleme

#### index.html dosyasında:

- **Hakkımda bölümü**: "Kim olduğumu keşfet" bölümündeki metni düzenleyin
- **İstatistikler**: `data-target` değerlerini değiştirin
- **İletişim bilgileri**: Email, GitHub, LinkedIn linklerini güncelleyin

#### Profil fotoğrafı eklemek için:

`index.html` dosyasında `.image-placeholder` bölümünü bulun ve şu şekilde değiştirin:

```html
<div class="image-placeholder">
    <img src="assets/images/profile.jpg" alt="Profil Fotoğrafı" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">
</div>
```

### 4. İletişim Formu Entegrasyonu

`js/main.js` dosyasındaki `sendContactForm` fonksiyonunu düzenleyerek backend API'nize bağlayın:

```javascript
async function sendContactForm(data) {
    const response = await fetch('YOUR_API_ENDPOINT', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    // ...
}
```

### 5. Proje Görselleri

Proje görselleri için `assets/images/` klasörüne resimlerinizi ekleyin ve `projects-data.js` dosyasında `image` alanını güncelleyin.

### 6. İndirilebilir Dosyalar

EXE veya APK dosyalarınızı `projects/` klasörüne koyun ve `downloadUrl` alanında yolunu belirtin:

```javascript
downloadUrl: "/projects/my-app.apk"
```

## 🎨 Renk Paleti Değiştirme

`css/style.css` dosyasındaki `:root` bölümünde CSS değişkenlerini düzenleyebilirsiniz:

```css
:root {
    --sunset-orange: #FF6B35;
    --sunset-pink: #FF8585;
    --sunset-purple: #9B59B6;
    --sunset-yellow: #FFD93D;
    --sunset-red: #E74C3C;
}
```

## 🔮 3D Sahne Ayarları

`js/3d-scene.js` dosyasında 3D şekillerin renklerini, boyutlarını ve animasyon hızlarını özelleştirebilirsiniz:

```javascript
// Renk değiştirme
color: 0xFF6B35  // Hex renk kodu

// Boyut değiştirme
new THREE.IcosahedronGeometry(0.8, 0)  // İlk parametre boyut

// Animasyon hızı
rotationSpeed: { x: 0.005, y: 0.008 }
```

## 📱 Responsive Breakpoints

- Desktop: 1024px+
- Tablet: 768px - 1023px
- Mobile: < 768px

## 🌐 Tarayıcı Desteği

- Chrome (önerilen)
- Firefox
- Safari
- Edge
- Opera

## 📝 Lisans

Bu proje kişisel kullanım için ücretsizdir. Ticari kullanım için lütfen iletişime geçin.

## 🤝 Katkıda Bulunma

Önerileriniz ve katkılarınız için pull request gönderebilirsiniz.

## 📧 İletişim

Sorularınız için: [your@email.com](mailto:your@email.com)

---

**Not**: Bu site Three.js kullanır, bu yüzden modern bir tarayıcı gereklidir. İyi kullanımlar! 🚀
