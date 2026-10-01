# İki Kişilik Kamera Partisi

Vite, TypeScript ve Canvas 2D ile hazırlanmış, kamera kontrollü iki kişilik parti oyunu başlangıç projesi.

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
