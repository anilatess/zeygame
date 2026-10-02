# ZeyGame

## Proje açıklaması

ZeyGame, kamera ve MediaPipe ile kontrol edilen iki kişilik, 8 mini oyunlu parti oyunudur. Kamera ve algılama verileri tarayıcı içinde işlenir.

## Kullanılan teknolojiler

Vite, TypeScript, Canvas 2D, Web Audio API, MediaPipe Tasks Vision, kamera API’leri ve temel PWA Service Worker.

## Yerel çalıştırma

```bash
npm.cmd install
npm.cmd run dev
```

Üretim kontrolü: `npm.cmd run build` ve önizleme için `npm.cmd run preview`.

Mevcut doğrulama komutları (service worker kontrolü build çıktısını okur):

```powershell
npm.cmd run typecheck
npm.cmd run format:check
npm.cmd run build
node scripts/verify-audio.mjs
node scripts/verify-coordinates.mjs
node scripts/verify-detection-gating.mjs
node scripts/verify-face-scoring.mjs
node scripts/verify-model-lifecycle.mjs
node scripts/verify-service-worker.mjs
git diff --check
```

Bu betikler kamera, gerçek cihaz sesi veya yayınlanmış siteyi doğrulamaz. Son kontrolün sonuçları ve sınırları [2 Ekim 2026 doğrulama raporunda](docs/validation-2026-10-02.md) kayıtlıdır.

## Kamera izinleri

Kamera erişimi yalnızca **Oyunu Başlat** düğmesine basıldığında istenir. İzin reddedilirse veya kamera bulunamazsa Türkçe hata gösterilir. Kamera için localhost veya HTTPS gerekir.

## Oyunlar

Oyunlar aşağıdaki sırayla oynanır. Tablo mevcut kod davranışını açıklar; gerçek kamerayla skor doğrulaması tamamlanmış değildir.

| Oyun             | Model | Mevcut davranış                                                                                                                                                      |
| ---------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buz Kırma        | El    | İşaret parmağı küp içindeyken 0,25 saniye aralıkla vuruş sayılır; üç vuruş 1 puandır. Sabit parmak da tekrar vuruş üretir; üç ayrı dokunuş garantisi yoktur.         |
| Çömelme Yarışı   | Vücut | Diz açısı 110° altına indikten sonra 160° üstüne çıkınca 1 puan sayılır. Gerekli landmarkların güvenilirliği kontrol edilmiyor.                                      |
| Ağız Açma Yarışı | Yüz   | `jawOpen > 0.6` ile 1 puan; yeniden sayım için ağız değeri önce `<= 0.6` olmalıdır.                                                                                  |
| Meyve Kesme      | El    | İşaret parmağıyla meyveye temas 1 puan; bomba 2 puan düşürür, skor sıfırın altına inmez.                                                                             |
| Zıplama Yarışı   | Vücut | İlk 12 örnekle kalça referansı alınır; yükselip referansa yaklaşınca 1 puan sayılır.                                                                                 |
| Dans Taklidi     | Vücut | Dört hedef poz, altı saniyelik turlar ve tur başına en iyi benzerlik üzerinden puan üretir. Poz ayrımı/puanlama ve güvenilirlik aktarımı sorunları açıktır.          |
| Surat Taklidi    | Yüz   | Dört yüz ifadesinde altı saniyelik turların en iyi benzerliği puana çevrilir. Nötr yüz ve geçersiz özellikler sentetik testlerle kontrol edilmiştir.                 |
| Ağızla Yakala    | Yüz   | Burun landmarkından yaklaşık ağız konumu üretilir; `jawOpen >= 0.6` iken yiyecek yakalanır. Normal 1, altın 2 puan; bomba 2 puan düşürür, skor sıfırın altına inmez. |

Oyunlar arasında sonuç, son oyunda final ekranı gösterilir. Dans Taklidi ve Surat Taklidi 24 saniye, diğer oyunlar varsayılan 20 saniye sürer. Menü ve HTML açıklamasında hâlâ “üç mini oyun” metni vardır; bu görevde uygulama kodu değiştirilmemiştir.

## Model yükleme ve ses

Kalibrasyonda el modeli, geri sayım ve oyun sırasında yalnızca aktif oyunun el/vücut/yüz modeli algılama yapar. Pasif modellerin önceki algılama sonuçları temizlenir; yüklenmiş model örnekleri menüye dönülene kadar tutulabilir. Modeller ihtiyaç olduğunda yüklenir ve aynı yükleme isteği paylaşılır. Yükleme sırasında kamera görüntüsü devam eder; kalibrasyon, geri sayım ve oyun süresi model hazır olana kadar ilerlemez. Hata sonrası otomatik tekrar döngüsü yoktur; **Tekrar Dene** düğmesi gerekli modeli yeniden yükler. Menüye dönüş eski yükleme sonuçlarını geçersiz kılar ve modelleri kapatır. Bu akış mevcut model yaşam döngüsü ve algılama betikleriyle doğrulanmıştır; gerçek CDN arızası/cihaz testi ayrıca gerekir.

Ses üreten oyunlar ve oyun yöneticisi ortak `AudioService` kullanır. Ses bağlamı **Oyunu Başlat** veya **Tekrar Oyna** tıklamasıyla açılır/devam ettirilir; ses açılamazsa oyun sessiz devam eder. Menüye dönüş aktif sesleri durdurur. Laptop ve iPhone'da duyulabilir ses henüz bu kontrol kapsamında test edilmemiştir.

## Mobil kullanım

Telefonu sabit tutun, iyi ışık kullanın; Oyuncu 1 solda, Oyuncu 2 sağda durmalıdır. Tüm vücut oyunlarında kameradan biraz uzaklaşın. Dikey/yatay yerleşim için CSS kuralları ve ortak koordinat dönüşümü vardır; gerçek telefon hizası manuel kontrol gerektirir.

## GitHub Pages yayınlama

Repository adı `zeygame` olduğu için `vite.config.ts` içinde `base: '/zeygame/'` kullanılır. `npm.cmd run build` sonrasında `dist/` klasörünü Pages kaynağı olarak yayınlayın. Kamera ve PWA özellikleri için HTTPS gerekir.

### GitHub Actions ile otomatik yayınlama

1. Değişiklikleri GitHub repository’nizin `main` branch’ine gönderin.
2. Repository’de **Settings → Pages** bölümünü açın.
3. **Build and deployment → Source** alanında **GitHub Actions** seçin.
4. `.github/workflows/deploy.yml` workflow’u `main` branch push’larında otomatik olarak çalışır. Node.js kurulumu, `npm ci`, `npm run build` ve `dist` artifact yükleme adımları workflow içinde tanımlıdır.
5. Workflow tamamlandığında **Settings → Pages** bölümündeki **Visit site** bağlantısından yayınlanan adresi açın. Aynı adres Actions deploy çıktısında da görünür.

GitHub Pages HTTPS kullandığı için kamera izni ve PWA özellikleri yayınlanan adreste kullanılabilir. MediaPipe WASM/model dosyaları sabit CDN adreslerinden tarayıcıda yüklenir; service worker, manifest ve ikon yolları GitHub Pages alt diziniyle uyumludur.

## Son düzeltmeler ve testler

- Kamera cover crop offsetleri ortak koordinat mapper ile landmark, görüntü ve oyun çarpışmalarında kullanılır; el landmarkları tek katmanda çizilir.
- Buz Kırma'da 0,25 saniye cooldown vardır; sabit temasın tekrar sayılması hâlâ açık hatadır.
- Ana Menüye Dön kamera akışını, render döngüsünü ve modelleri kapatır; ses için tüm oyunlar ortak AudioService kullanır.
- Surat Taklidi yalnızca hedef ifadenin anlamlı blendshape değerlerini oranlar; nötr yüz geçerli skor üretmez.

Kontrol: `npm.cmd run build`; canlı kontrolde dikey parmak-hedef hizası, cooldown, kamera kapanması, nötr yüz skoru, sekizinci oyun adı ve model hata durumunu doğrulayın.

## PWA, güncelleme ve çevrimdışı kullanım

Service worker yalnızca üretim derlemesinde kaydedilir. `npm.cmd run build`, GitHub Pages için `/zeygame/` scope'unda çalışacak worker'ı `dist/` çıktısına üretir. Build içindeki HTML, JavaScript, CSS ve diğer uygulama kabuğu dosyaları sürüm başına birlikte önbelleğe alınır. Kurulumda her dosyanın SHA-256 özeti build içeriğiyle karşılaştırılır. Dosyalardan biri indirilemez, başarısız yanıt verir veya başka sürüme aitse yeni cache kurulumu iptal edilir; önceki tamamlanmış sürüm korunur.

Sayfa gezinmeleri ağdan alınır ve doğrulanan HTML ile bağlı JavaScript/CSS birlikte tamamlanmadan sürüm cache'ine eklenmez. Ağ yoksa tamamlanma işaretli cache'lerden bir uygulama kabuğu gösterilir; seçim cache oluşturulma sırasını kullanır, ayrıca sürüm tarihi karşılaştırmaz. Tamamlanmış eski sürüm cache'leri açık sekmelerin hash'li dosya isteklerini desteklemek için otomatik silinmez; başarısız ve yarım kalan yeni cache ise kurulum sırasında silinir. Worker aktivasyonu sayfayı kendi başına yenilemez; hazır olduğunda **Yeni sürüm hazır — Yenile** bildirimi çıkar ve geçiş kullanıcı tıklamasıyla yapılır.

Çevrimdışı açılabilen şey uygulama kabuğudur. MediaPipe WASM ve model dosyaları CDN'den geldiği için çevrimdışı oyun oynama desteği garanti edilmez. Üretim service worker akışını yerelde incelemek için `npm.cmd run build` ardından `npm.cmd run preview` kullanın; geliştirme sunucusunda worker kaydı yapılmaz.

Aktivasyon yalnızca ZeyGame'e ait tamamlanma işareti olmayan eski/yarım cache'leri temizler; diğer uygulamaların cache'lerine dokunmaz. Tamamlanmış eski sürümler korunur ve disk kullanımı sürüm sayısıyla büyüyebilir. `node scripts/verify-service-worker.mjs`, build sonrasında worker olaylarını ve Cache Storage'ı simüle eder; gerçek tarayıcıda iki sürüm arasında güncelleme testinin yerini tutmaz.

2 Ekim 2026'da Chrome'da, ayrı geçici üretim sürümleriyle aynı localhost origin ve `/zeygame/` scope altında A→B geçişi test edildi. A sayfası güncelleme beklerken yenilenmedi; bildirim ve **Yenile** ile B'ye geçiş, eski JS/CSS için cache yanıtları ve başka uygulama cache'inin korunması doğrulandı. Yerel HTTP sunucusu tamamen durdurulduktan sonra B kabuğu yeniden açıldı. Cihazın genel internet bağlantısı kesilmedi; kamera açık oyun, ilk ziyaretin çevrimdışı yapılması, iPhone/Safari ve canlı yayın sonrası geçiş test edilmedi. Tam çevrimdışı oyun desteği iddia edilmez.

## Gerçek cihaz için manuel kontrol listesi

- [ ] Sekiz oyunu sırayla tamamla; iki oyuncunun skorlarını, oyunlar arası sonuçları ve final toplamını kontrol et. Buz Kırma'da sabit parmak/ayrı dokunuşu, Dans Taklidi'nde doğru/yanlış pozu ve Çömelme'de görünmeyen dizleri özellikle karşılaştır.
- [ ] Dikey ve yatay konumda, ekran döndürme sonrasında parmak/hedef, yüz/yiyecek ve vücut çizimlerinin kamera görüntüsüyle hizasını kontrol et.
- [ ] Görünür **Ana Menüye Dön** düğmesinden dön; kamera göstergesinin ve seslerin kapandığını, yeni oturumun tekrar başlayabildiğini kontrol et.
- [ ] Finalde **Tekrar Oyna** ile skorların sıfırlandığını, kalibrasyonun ve sekiz oyun sırasının yeniden başladığını kontrol et.
- [ ] Model isteğini engelleyerek hata oluştur; kamera görüntüsünü, duran süreyi ve **Tekrar Dene** düğmesini kontrol et. Bağlantıyı geri getirip tek yeniden denemeyle devam et; hata sırasında menüye dönüp tekrar başlatmayı da dene.
- [ ] Laptop Chrome ve iPhone Safari'de başlatma/tekrar oynama tıklamasından sonra geri sayım ve oyun seslerini dinle; menüye dönüşte sesin kesildiğini kontrol et.
- [ ] Yayın sonrasında A açıkken B'yi sun; aktif oyunun kendiliğinden yenilenmediğini, bildirimi, **Yenile** ile geçişi ve JS/CSS yanıtlarını kontrol et. Başarılı çevrimiçi açılıştan sonra bağlantıyı kesip yalnızca kabuğun açılmasını doğrula.
