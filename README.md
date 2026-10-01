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

Buz Kırma, Çömelme Yarışı ve Ağız Açma Yarışı sırayla oynanır. Her oyun yalnızca ihtiyaç duyduğu el, pose veya yüz modelini kullanır. Oyunlar arasında sonuç, son oyunda final ekranı gösterilir.

## Mobil kullanım

Telefonu sabit tutun, iyi ışık kullanın; Oyuncu 1 solda, Oyuncu 2 sağda durmalıdır. Tüm vücut oyunlarında kameradan biraz uzaklaşın. Arayüz dikey ve yatay telefon ekranlarına uyumludur.

## GitHub Pages yayınlama

Build scriptindeki `vite build --base=./` ayarı ve göreli PWA yolları GitHub Pages alt yolları için hazırlanmıştır. `npm.cmd run build` sonrasında `dist/` klasörünü Pages kaynağı olarak yayınlayın. Kamera ve PWA özellikleri için HTTPS gerekir.

## PWA

Uygulama adı ve kısa adı **ZeyGame**’dir. Manifest, tema renkleri, ikon ve temel service worker eklenmiştir. Service worker yalnızca kabuk dosyalarını önbelleğe alır; kamera ve MediaPipe çalışma akışını değiştirmez.
