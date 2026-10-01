# İki Kişilik Kamera Partisi

Vite, TypeScript, Canvas 2D ve MediaPipe Tasks Vision el takibi ile hazırlanmış, kamera kontrollü iki kişilik parti oyunu başlangıç projesi.

## Kurulum

Node.js 18 veya üzeri gerekir:

```bash
npm install
```

## Geliştirme sunucusu

```bash
npm run dev
```

Tarayıcıda gösterilen yerel adresi açın ve **Oyunu Başlat** düğmesine basın. Kamera erişimi için uygulamanın güvenli bir bağlamda (localhost veya HTTPS) çalışması gerekir.

## Build ve test

Üretim derlemesini ve TypeScript kontrolünü çalıştırmak için:

```bash
npm run build
```

Üretim çıktısını yerel olarak incelemek için:

```bash
npm run preview
```

Kamera izni reddedildiğinde veya cihazda kamera bulunmadığında arayüz Türkçe açıklayıcı hata gösterir. Kamera akışı sayfa kapatılırken durdurulur.

## MediaPipe el takibi

MediaPipe Hand Landmarker modeli yalnızca **Oyunu Başlat** düğmesine basıldıktan sonra yüklenir. El görüntüsü ve landmark verileri tarayıcı içinde işlenir; kamera görüntüsü herhangi bir sunucuya gönderilmez. CDN’de sabitlenmiş `@mediapipe/tasks-vision@1.0.1` sürümü kullanılır.

Test etmek için `npm run dev` ile uygulamayı açın, kamera iznini verin ve kameraya bir veya iki el gösterin. Her elin 21 noktası ve bağlantı çizgileri aynalanmış kamera görüntüsü üzerinde görünmelidir. El kadrajdan çıktığında uygulama çalışmaya devam eder.
