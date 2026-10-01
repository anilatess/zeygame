# ZeyGame

## Proje açıklaması

ZeyGame, kamera ve MediaPipe ile kontrol edilen iki kişilik, üç mini oyunlu parti oyunudur. Kamera ve algılama verileri tarayıcı içinde işlenir.

## Kullanılan teknolojiler

Vite, TypeScript, Canvas 2D, Web Audio API, MediaPipe Tasks Vision, kamera API’leri ve temel PWA Service Worker.

## Yerel çalıştırma

```bash
npm.cmd install
npm.cmd run dev
```

Üretim kontrolü: `npm.cmd run build` ve önizleme için `npm.cmd run preview`.

## Kamera izinleri

Kamera erişimi yalnızca **Oyunu Başlat** düğmesine basıldığında istenir. İzin reddedilirse veya kamera bulunamazsa Türkçe hata gösterilir. Kamera için localhost veya HTTPS gerekir.

## Oyunlar

Buz Kırma, Çömelme Yarışı, Ağız Açma Yarışı, Meyve Kesme, Zıplama Yarışı, Dans Taklidi, Surat Taklidi ve Ağızla Yakala sırayla oynanır. Ağızla Yakala’da burun landmarkı yüz merkezi için yaklaşık ağız konumuna çevrilir; `jawOpen` 0.6 veya üzerindeyken düşen yiyecekler yakalanır. Normal yiyecek 1, altın yiyecek 2 puan verir; bomba 2 puan düşürür. Her oyun yalnızca ihtiyaç duyduğu el, pose veya yüz modelini kullanır. Oyunlar arasında sonuç, son oyunda final ekranı gösterilir.

## Mobil kullanım

Telefonu sabit tutun, iyi ışık kullanın; Oyuncu 1 solda, Oyuncu 2 sağda durmalıdır. Tüm vücut oyunlarında kameradan biraz uzaklaşın. Arayüz dikey ve yatay telefon ekranlarına uyumludur.

## GitHub Pages yayınlama

Build scriptindeki `vite build --base=./` ayarı ve göreli PWA yolları GitHub Pages alt yolları için hazırlanmıştır. `npm.cmd run build` sonrasında `dist/` klasörünü Pages kaynağı olarak yayınlayın. Kamera ve PWA özellikleri için HTTPS gerekir.

### GitHub Actions ile otomatik yayınlama

1. Değişiklikleri GitHub repository’nizin `main` branch’ine gönderin.
2. Repository’de **Settings → Pages** bölümünü açın.
3. **Build and deployment → Source** alanında **GitHub Actions** seçin.
4. `.github/workflows/deploy.yml` workflow’u `main` branch push’larında otomatik olarak çalışır. Node.js kurulumu, `npm ci`, `npm run build` ve `dist` artifact yükleme adımları workflow içinde tanımlıdır.
5. Workflow tamamlandığında **Settings → Pages** bölümündeki **Visit site** bağlantısından yayınlanan adresi açın. Aynı adres Actions deploy çıktısında da görünür.

GitHub Pages HTTPS kullandığı için kamera izni ve PWA özellikleri yayınlanan adreste kullanılabilir. MediaPipe WASM/model dosyaları sabit CDN adreslerinden tarayıcıda yüklenir; service worker, manifest ve ikon yolları GitHub Pages alt diziniyle uyumludur.

## PWA

Uygulama adı ve kısa adı **ZeyGame**’dir. Manifest, tema renkleri, ikon ve temel service worker eklenmiştir. Service worker yalnızca kabuk dosyalarını önbelleğe alır; kamera ve MediaPipe çalışma akışını değiştirmez.
