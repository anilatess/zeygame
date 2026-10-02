# ZeyGame oyun ekranları — doğrulama

## Tasarım ve kapsam

Kalibrasyon, geri sayım, ortak HUD, tur sonucu ve final; ana menünün lacivert, mavi, pembe ve sarı paletini kullanır. Kamera üzerindeki bilgi panelleri kompakt ve yarı saydamdır. Kalibrasyon yalnız mevcut sol/sağ el algılanmasını gösterir; kişi tanıma iddiası yoktur. Skor, süre ve sonuçlar erişilebilir HTML katmanında; oyun nesneleri ve hedef çizimleri Canvas'tadır.

Ortak HUD canlı skorun tek kaynağıdır. Dans ve Surat Taklidi'nin alt çubukları yalnız o hedefteki en iyi benzerlik yüzdesini gösterir. Meyve Kesme ve Ağızla Yakala'nın talimatı geri sayımda gösterilir; hareket eden nesnelerle çakışan kalıcı talimat kaldırılmıştır. Nesne koordinatları ve çarpışma alanları korunmuştur.

Final kazananı toplam puanlardan belirlenir. Tur sonucu son tur puanlarını kullanır. Beraberlikte iki oyuncuya eşit vurgu yapılır. Final başlığı bir kez odaklanır; Tab sırası Tekrar Oyna → Ana Menüye Dön şeklindedir. Tekrar oynama odağı oyun alanına, ana menüye dönüş odağı etkin başlatma butonuna taşır.

Yeni animasyon veya parçacık efekti eklenmedi; azaltılmış hareket tercihine aykırı yeni Canvas animasyonu yoktur. Bilgi katmanlarında pointer-events kapalıdır; final butonları ve gerektiğinde final kaydırma alanı etkileşime açıktır. Safe area ve DPR yalnız gösterge yerleşiminde dikkate alınır; kamera çözünürlüğü ve cover hesabı değişmemiştir.

Ana menünün HTML bölümü ve GameManager.update durum/puanlama kodu önceki Git sürümüyle birebir karşılaştırıldı: değişmemiştir. Kamera, koordinat dönüştürücü, tracker/model yaşam döngüsü ve service worker kaynakları değişmedi. Commit, push veya deploy yapılmadı.

## Kontrol sonuçları

| Kontrol                                                   | Sonuç       |
| --------------------------------------------------------- | ----------- |
| `npm.cmd run typecheck`                                   | Geçti       |
| `npm.cmd run format:check`                                | Geçti       |
| `npm.cmd run build`                                       | Geçti       |
| Mevcut dokuz `verify-*.mjs` betiği                        | Hepsi geçti |
| Ek `node scripts/verify-game-ui.mjs`                      | Geçti       |
| Görsel test TypeScript dosyasının ayrı strict typecheck'i | Geçti       |
| `git diff --check`                                        | Geçti       |

Ek UI testi gerçek GameManager ile algılanma etiketlerini, model hazır değilken geri sayım/HUD görünürlüğünü, canlı skorları, sonraki tur bilgisini, toplam puan kazananını, beraberliği, odağın bir kez taşınmasını ve ekranların kapanmasını doğrular. Canvas çizimi hata verse bile save/restore dengesi korunur. Mevcut testlerin davranış iddiaları kaldırılmadı; sahte DOM'a focus desteği ve gerçek ana menü/tekrar oynama/final odak kontrolleri eklendi.

## Görsel test yöntemi ve sınırı

Chrome'da 1440×900, 390×844 ve 844×390 CSS viewport boyutları kullanıldı. Her boyutta CALIBRATION, COUNTDOWN, RESULT, FINAL ve sekiz oyunun PLAYING durumu kaydedildi ve incelendi. DOM panel sınırları ve Canvas yazı sınırları ayrıca ölçüldü: yatay taşma, HUD ile Canvas yazısı çakışması veya yazı kesilmesi bulunmadı. Ölçüm kayıtları [layout-checks.json](game-screenshots/layout-checks.json) içindedir.

**Bunlar sahte verili görsel testlerdir. Gerçek kamera görüntüsü, gerçek iki oyuncu, canlı model çıkarımı veya gerçek kamera oynanışı bu çalışmada test edilmedi.** Nötr silüetli arka plan kamera yerine kullanılır; her ekran görüntüsünde bu sınırı belirten etiket vardır. Gerçek yaşam döngüsü, puanlama, koordinat ve ses davranışları mevcut otomatik betiklerle doğrulandı.

Görsel fixture ayrı `game-screens.test.html` geliştirme girişidir; ana uygulama bunu import etmez. `import.meta.env.DEV` kontrolü bulunur. `dist` içinde test sayfası veya fixture kodu olmadığı build sonrası ayrıca kontrol edildi. Kullanıcı uygulamasına kalibrasyon atlama seçeneği eklenmedi.

Fixture'ı yeniden açmak için:

```powershell
npm.cmd run dev -- --configLoader runner --host 127.0.0.1 --port 4182 --strictPort
```

Adres: `http://127.0.0.1:4182/zeygame/game-screens.test.html?state=PLAYING&game=5&target=3`

- `state`: CALIBRATION / COUNTDOWN / PLAYING / RESULT / FINAL.
- `game`: aşağıdaki tabloda yer alan 0–7 indeksleri; aynı `createGames()` kaynağı kullanılır.
- `target`: Dans/Surat için 0–3 hedef.
- `tie`, `loading`, `error`, `update`: kontrollü beraberlik, model bekleme/hata ve bildirim örnekleri.
- Klavyede 1–5 durumları değiştirir; N sonraki oyuna, T beraberlik örneğine geçer.

Ek olarak yatay final beraberliği, klavye odağı, Tekrar Oyna → kalibrasyon, Ana Menüye Dön → gerçek menü, yükleme sırasında gizlenen geri sayım ve sahte Tekrar Dene akışı kontrol edildi. Yenile bildirimiyle final ve Dans HUD birlikte incelendi; final puan alanı dar yükseklikte sıkıştırılır, hedef iskeleti kullanılabilir alanın içine ölçeklenir. Fixture'daki Tekrar Dene gerçek model indirme işlemi değildir; gerçek retry yaşam döngüsü mevcut otomatik test kapsamındadır.

Tarayıcı ekran görüntüsü ölçeklemesi yatay örnekleri 843×390 raster olarak kaydetmiştir; ölçülen CSS viewport 844×390'dır. Dikey ve laptop çıktıları sırasıyla 390×844 ve 1440×900'dür. Görüntüler boyutu uydurmak için genişletilmedi. Genel bakış görselleri orijinal ekran görüntülerinden küçültülerek birleştirilmiştir.

## Ekran görüntüleri

| Durum / oyun         | Laptop                                            | Telefon dikey                                       | Telefon yatay                                        |
| -------------------- | ------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Genel bakış          | [Görsel](game-screenshots/overview-laptop.jpg)    | [Görsel](game-screenshots/overview-portrait.jpg)    | [Görsel](game-screenshots/overview-landscape.jpg)    |
| Kalibrasyon          | [Görsel](game-screenshots/laptop-calibration.jpg) | [Görsel](game-screenshots/portrait-calibration.jpg) | [Görsel](game-screenshots/landscape-calibration.jpg) |
| Geri sayım           | [Görsel](game-screenshots/laptop-countdown.jpg)   | [Görsel](game-screenshots/portrait-countdown.jpg)   | [Görsel](game-screenshots/landscape-countdown.jpg)   |
| Tur sonucu           | [Görsel](game-screenshots/laptop-result.jpg)      | [Görsel](game-screenshots/portrait-result.jpg)      | [Görsel](game-screenshots/landscape-result.jpg)      |
| Final                | [Görsel](game-screenshots/laptop-final.jpg)       | [Görsel](game-screenshots/portrait-final.jpg)       | [Görsel](game-screenshots/landscape-final.jpg)       |
| 0 · Buz Kırma        | [Görsel](game-screenshots/laptop-playing-0.jpg)   | [Görsel](game-screenshots/portrait-playing-0.jpg)   | [Görsel](game-screenshots/landscape-playing-0.jpg)   |
| 1 · Çömelme Yarışı   | [Görsel](game-screenshots/laptop-playing-1.jpg)   | [Görsel](game-screenshots/portrait-playing-1.jpg)   | [Görsel](game-screenshots/landscape-playing-1.jpg)   |
| 2 · Ağız Açma Yarışı | [Görsel](game-screenshots/laptop-playing-2.jpg)   | [Görsel](game-screenshots/portrait-playing-2.jpg)   | [Görsel](game-screenshots/landscape-playing-2.jpg)   |
| 3 · Meyve Kesme      | [Görsel](game-screenshots/laptop-playing-3.jpg)   | [Görsel](game-screenshots/portrait-playing-3.jpg)   | [Görsel](game-screenshots/landscape-playing-3.jpg)   |
| 4 · Zıplama Yarışı   | [Görsel](game-screenshots/laptop-playing-4.jpg)   | [Görsel](game-screenshots/portrait-playing-4.jpg)   | [Görsel](game-screenshots/landscape-playing-4.jpg)   |
| 5 · Dans Taklidi     | [Görsel](game-screenshots/laptop-playing-5.jpg)   | [Görsel](game-screenshots/portrait-playing-5.jpg)   | [Görsel](game-screenshots/landscape-playing-5.jpg)   |
| 6 · Surat Taklidi    | [Görsel](game-screenshots/laptop-playing-6.jpg)   | [Görsel](game-screenshots/portrait-playing-6.jpg)   | [Görsel](game-screenshots/landscape-playing-6.jpg)   |
| 7 · Ağızla Yakala    | [Görsel](game-screenshots/laptop-playing-7.jpg)   | [Görsel](game-screenshots/portrait-playing-7.jpg)   | [Görsel](game-screenshots/landscape-playing-7.jpg)   |

Ek görseller: [beraberlik](game-screenshots/landscape-final-tie.jpg), [buton odağı](game-screenshots/landscape-final-focus.jpg), [final + Yenile](game-screenshots/landscape-final-update.jpg), [Dans + Yenile](game-screenshots/landscape-dance-update.jpg), [model yükleme](game-screenshots/landscape-model-loading.jpg), [model hatası](game-screenshots/landscape-model-error.jpg).

## Değiştirilen ve eklenen dosyalar

- `src/main.ts`
- `src/styles.css`
- `src/game-manager.ts`
- `src/game-ui.ts` (yeni)
- `src/canvas-ui.ts` (yeni)
- `src/games.ts` (yeni; mevcut oyun kurucularının aynı sırayla ortak kaynağı)
- `src/games/dance-mimic.ts`
- `src/games/face-mimic.ts`
- `src/games/fruit-slice.ts`
- `src/games/jump-race.ts`
- `src/games/mouth-catch.ts`
- `scripts/verify-audio.mjs`
- `scripts/verify-detection-gating.mjs`
- `scripts/verify-model-lifecycle.mjs`
- `scripts/verify-game-ui.mjs` (yeni)
- `scripts/visual-game-fixture.ts` (yeni)
- `game-screens.test.html` (yeni)
- `docs/game-screens-validation-2026-10-02.md` (bu rapor)
- `docs/game-screenshots/` (42 orijinal ekran görüntüsü, 3 genel bakış ve ölçüm JSON'u)
