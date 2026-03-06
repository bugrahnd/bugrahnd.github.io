# 🚀 Hızlı Başlangıç Rehberi

## Adım 1: Dosyaları İndirin
Tüm dosyaları bilgisayarınıza indirin ve bir klasöre çıkartın.

## Adım 2: index.html'i Açın
`index.html` dosyasına çift tıklayın veya tarayıcıya sürükleyin.

## Adım 3: Kişiselleştirme

### A) Hakkımda Bölümünü Düzenleyin

**index.html** dosyasını bir metin editörü ile açın (VS Code, Notepad++ vb.)

Şu satırları bulun ve değiştirin:

```html
<!-- Satır ~120 civarı -->
<p class="about-intro">
    Dijital dünyada benzersiz deneyimler yaratmaya tutkuyla bağlı bir geliştiriciyim. 
    Kodun sanatla buluştuğu noktada çalışıyorum.
</p>
```

### B) İstatistikleri Güncelleyin

```html
<!-- Satır ~135 civarı -->
<span class="stat-number" data-target="50">0</span>  <!-- Proje sayısı -->
<span class="stat-number" data-target="30">0</span>  <!-- Müşteri sayısı -->
<span class="stat-number" data-target="5">0</span>   <!-- Yıl deneyim -->
```

### C) İletişim Bilgilerini Değiştirin

```html
<!-- Satır ~250 civarı -->
<a href="mailto:your@email.com" class="contact-method">
    <!-- Email adresinizi buraya -->
</a>

<a href="https://github.com/yourusername" class="contact-method">
    <!-- GitHub kullanıcı adınızı buraya -->
</a>

<a href="https://linkedin.com/in/yourusername" class="contact-method">
    <!-- LinkedIn profil adresinizi buraya -->
</a>
```

## Adım 4: Proje Ekleme

**js/projects-data.js** dosyasını açın.

Yeni bir proje eklemek için array'e yeni obje ekleyin:

```javascript
{
    id: 9, // SON ID + 1
    title: "Yeni Projem",
    category: "web", // "web", "3d", veya "app"
    description: "Projenin kısa açıklaması",
    tags: ["React", "Node.js"],
    image: null, // veya "assets/images/proje.jpg"
    demoUrl: "https://demo-url.com", // Canlı demo linki
    downloadUrl: null, // veya "/projects/app.apk"
    videoUrl: null, // veya "https://www.youtube.com/embed/VIDEO_ID"
    details: {
        description: "Detaylı açıklama buraya",
        features: [
            "Özellik 1",
            "Özellik 2",
            "Özellik 3"
        ],
        technologies: ["React", "Node.js", "MongoDB"],
        challenges: "Projede karşılaşılan zorluklar ve çözümler",
        github: "https://github.com/username/repo"
    }
}
```

## Adım 5: Profil Fotoğrafı Ekleme

1. Fotoğrafınızı `assets/images/` klasörüne koyun (örn: `profile.jpg`)
2. **index.html** dosyasında `.image-placeholder` bölümünü bulun (Satır ~145)
3. SVG kodunu silin ve şunu ekleyin:

```html
<div class="image-placeholder">
    <img src="assets/images/profile.jpg" alt="Profil" 
         style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">
</div>
```

## Adım 6: Proje Görselleri

1. Proje görsellerinizi `assets/images/` klasörüne ekleyin
2. `js/projects-data.js` dosyasında:

```javascript
image: "assets/images/proje-gorseli.jpg"
```

## Adım 7: İndirilebilir Dosyalar (APK/EXE)

1. Dosyalarınızı `projects/` klasörüne koyun
2. Projede `downloadUrl` belirtin:

```javascript
downloadUrl: "/projects/my-app.apk"
```

## Adım 8: YouTube Video Ekleme

1. YouTube videosunu açın
2. "Paylaş" → "Yerleştir" (Embed)
3. URL'i kopyalayın (örn: `https://www.youtube.com/embed/dQw4w9WgXcQ`)
4. Projede:

```javascript
videoUrl: "https://www.youtube.com/embed/VIDEO_ID"
```

## ⚙️ Gelişmiş Ayarlar

### Renkleri Değiştirme

**css/style.css** dosyasını açın, `:root` bölümünü bulun:

```css
:root {
    --sunset-orange: #FF6B35;  /* Ana turuncu */
    --sunset-pink: #FF8585;    /* Pembe */
    --sunset-purple: #9B59B6;  /* Mor */
    --sunset-yellow: #FFD93D;  /* Sarı */
}
```

### 3D Şekilleri Özelleştirme

**js/3d-scene.js** dosyasında:

```javascript
// Renk değiştirme
color: 0xFF6B35  // Yeni hex kodu

// Boyut değiştirme
IcosahedronGeometry(1.0, 0)  // Sayıyı artır/azalt

// Daha fazla şekil eklemek için createGeometries() fonksiyonunu düzenleyin
```

## 🌐 Yayınlama

### GitHub Pages ile:
1. GitHub'da yeni repo oluşturun
2. Dosyaları yükleyin
3. Settings → Pages → Branch: main → Save
4. 5 dakika sonra siteniz yayında!

### Netlify ile:
1. netlify.com'a gidin
2. Klasörü sürükle-bırak
3. 30 saniye sonra yayında!

## 🆘 Sorun Giderme

**3D şekiller görünmüyor:**
- Tarayıcınız WebGL destekliyor mu kontrol edin
- Console'da hata var mı bakın (F12)

**Projeler yüklenmiyor:**
- `js/projects-data.js` dosyasındaki virgülleri kontrol edin
- Console'da syntax error var mı bakın

**Mobilde bozuk görünüyor:**
- Tarayıcı cache'ini temizleyin
- Sayfayı yenileyin (Ctrl+F5)

## 💡 İpuçları

1. **VS Code** kullanın - Syntax highlighting ve hata kontrolü
2. **Live Server** extension'ı yükleyin - Otomatik yenileme
3. Her değişiklikten sonra **sayfayı yenileyin** (F5)
4. **Console'u açık tutun** (F12) - Hataları görmek için

## 🎨 Tasarım Önerileri

- Sunset temasına uygun görseller kullanın
- Yüksek çözünürlüklü fotoğraflar seçin (min 1200px genişlik)
- Tutarlı bir renk paleti kullanın
- Projelerde ekran görüntüleri ekleyin

---

**İyi çalışmalar! 🚀**

Sorunlarınız için: README.md dosyasına bakın veya bana ulaşın.
