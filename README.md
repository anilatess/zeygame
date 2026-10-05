# ZeyGame

## Proje açıklaması

ZeyGame, kamera ve MediaPipe ile kontrol edilen 8 mini oyunlu parti oyunudur. Aynı cihazda iki kişi, tek kişilik test ve iki cihaz arasında online karşılaşma modları vardır. Hareket algılama tarayıcıda yapılır; online modda kamera ve isteğe bağlı mikrofon WebRTC ile rakibe iletilir.

## Kullanılan teknolojiler

React, Vite, TypeScript, Canvas 2D, Web Audio API, MediaPipe Tasks Vision, Supabase Auth/Realtime/Postgres, WebRTC ve PWA Service Worker.

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
node scripts/verify-pose-reliability.mjs
node scripts/verify-dance-scoring.mjs
node scripts/verify-ice-contacts.mjs
node scripts/verify-game-ui.mjs
node scripts/verify-game-selection.mjs
git diff --check
```

Bu betikler kamera, gerçek cihaz sesi veya yayınlanmış siteyi doğrulamaz. Son kontrolün sonuçları ve sınırları [2 Ekim 2026 doğrulama raporunda](docs/validation-2026-10-02.md) kayıtlıdır.

## Kamera izinleri

Kamera erişimi yalnızca **Partiyi Başlat** veya **Bu Oyunu Oyna** düğmesine basıldığında istenir. Oyun seçimi ekranını açmak kamera veya ses başlatmaz. İzin reddedilirse veya kamera bulunamazsa Türkçe hata gösterilir. Kamera için localhost veya HTTPS gerekir.

## Parti ve tek oyun modları

**Aynı Ekranda Oyna**, ortak oyun listesindeki sekiz oyunu sırayla oynatır ve finalde toplam puanları gösterir. **Bir oyun seç**, aynı listedeki sekiz karttan birini iki kişilik tek oyun oturumu olarak başlatır. **Tek Kişilik Test**, tek kişiyi izler ve algılama/FPS bilgilerini gösterir. **Online Oyna**, farklı cihazlardan iki oyuncuyu oda koduyla birleştirir.

Tek oyun sonucunda yalnızca seçilen oyunun adı, iki skor ve kazanan/beraberlik gösterilir. **Aynı Oyunu Tekrar Oyna**, aynı oyun için hazırlığı ve skorları yeniden başlatır. **Başka Oyun Seç** ve **Ana Menüye Dön**, kamera, algılama modelleri, render döngüsü ve ses kaynaklarını kapatır. Sonradan parti başlatmak sekiz oyun sırasını geri getirir. Oturum modu ve sırası tek GameManager içinde tutulur.

Hazırlık kontrolü aktif oyunun takip türünü kullanır: her iki bölgede el veya yüz; vücut oyunlarında güvenilir ve kadrajda görünen gerekli eklemler. Çömelme kalça/diz/ayak bileklerini, Zıplama iki kalçayı, Dans omuz/kol/kalça/bacak noktalarını ister. Bu kontrol algılanma hazırlığıdır, kişi kimliği doğrulaması değildir. Model hazır olmadan hazırlık veya geri sayım ilerlemez.

Oyun seçimi test kapsamı, Chrome ekran görüntüleri ve gerçek cihazda bekleyen kontroller [oyun seçimi doğrulama raporunda](docs/game-selection-validation.md) bulunur. Tek oyun finalinin görsel kontrolü sahte verili geliştirme sayfasındadır; gerçek kamera testi değildir.

## Oyunlar

Oyunlar aşağıdaki sırayla oynanır. Tablo mevcut kod davranışını açıklar; gerçek kamerayla skor doğrulaması tamamlanmış değildir.

| Oyun             | Model | Mevcut davranış                                                                                                                                                                                                                                                                                      |
| ---------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buz Kırma        | El    | İşaret parmağıyla üç ayrı giriş/çıkış teması 1 puandır. Sabit temas tekrar sayılmaz; birden fazla el varsa tüm ilgili parmaklar genişletilmiş çıkış sınırının dışında görülmelidir.                                                                                                                  |
| Çömelme Yarışı   | Vücut | Güvenilir ayakta → çömelmiş → ayakta dizisi 1 puandır. Diz eşikleri 110°/160°; gerekli altı eklem kontrol edilir. Takip kaybı yarım tekrarı iptal eder.                                                                                                                                              |
| Ağız Açma Yarışı | Yüz   | `jawOpen > 0.6` ile 1 puan; yeniden sayım için ağız değeri önce `<= 0.6` olmalıdır.                                                                                                                                                                                                                  |
| Meyve Kesme      | El    | İşaret parmağıyla meyveye temas 1 puan; bomba 2 puan düşürür, skor sıfırın altına inmez.                                                                                                                                                                                                             |
| Zıplama Yarışı   | Vücut | İlk 12 örnekle kalça referansı alınır; yükselip referansa yaklaşınca 1 puan sayılır.                                                                                                                                                                                                                 |
| Dans Taklidi     | Vücut | T pozu, Eller yukarı, Çömelmiş poz ve Tek kol yukarı (sol) sırayla gösterilir. T/çömelmiş hedefte kollar yana; tek kol hedefinde sol kol yukarı, sağ kol yana uzatılır. Dört 6 saniyelik turda zorunlu eklem koşullarının en düşük puanı değerlendirilir; tur en iyisi toplam skora bir kez eklenir. |
| Surat Taklidi    | Yüz   | Büyük gülümseme, Şaşkın yüz, Bir gözünü kapat, diğerini açık tut ve Öpücük ifadesi sırayla taklit edilir. Dört 6 saniyelik turun en iyi benzerliği puana çevrilir. Nötr yüz ve geçersiz özellikler sentetik testlerle kontrol edilmiştir.                                                            |
| Ağızla Yakala    | Yüz   | Burun landmarkından yaklaşık ağız konumu üretilir; `jawOpen >= 0.6` iken yiyecek yakalanır. Normal 1, altın 2 puan; bomba 2 puan düşürür, skor sıfırın altına inmez.                                                                                                                                 |

Oyunlar arasında sonuç, son oyunda final ekranı gösterilir. Dans Taklidi ve Surat Taklidi 24 saniye, diğer oyunlar varsayılan 20 saniye sürer. Menüdeki sayı, **Oyunları Keşfet** ve **Oyun Seç** listesi ekranlarındaki oyun açıklamaları mevcut oyun yöneticisinin listesinden üretilir. Dans ve yüz hedefleri kendi metadata'sından açıklamalara aktarılır; statik HTML meta açıklaması oyun sayısı içermez.

## Model yükleme ve ses

Kalibrasyon, geri sayım ve oyun sırasında yalnızca aktif oyunun el/vücut/yüz modeli algılama yapar. Pasif modellerin önceki algılama sonuçları temizlenir; yüklenmiş model örnekleri menüye dönülene kadar tutulabilir. Modeller ihtiyaç olduğunda yüklenir ve aynı yükleme isteği paylaşılır. Yükleme sırasında kamera görüntüsü devam eder; kalibrasyon, geri sayım ve oyun süresi model hazır olana kadar ilerlemez. Hata sonrası otomatik tekrar döngüsü yoktur; **Tekrar Dene** düğmesi gerekli modeli yeniden yükler. Menüye dönüş eski yükleme sonuçlarını geçersiz kılar ve modelleri kapatır. Bu akış mevcut model yaşam döngüsü ve algılama betikleriyle doğrulanmıştır; gerçek CDN arızası/cihaz testi ayrıca gerekir.

Ses üreten oyunlar ve oyun yöneticisi ortak `AudioService` kullanır. Ses bağlamı **Partiyi Başlat**, **Bu Oyunu Oyna** veya tekrar oynama tıklamasıyla açılır/devam ettirilir; ses açılamazsa oyun sessiz devam eder. Menüye dönüş aktif sesleri durdurur. Laptop ve iPhone'da duyulabilir ses henüz bu kontrol kapsamında test edilmemiştir.

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
- Buz Kırma üç ayrı temas sayar; 0,25 saniyelik cooldown yalnız ek korumadır. Sabit temas, takip kaybı ve çoklu el durumları otomatik testlerle kontrol edilmiştir; gerçek kamera testi bekler.
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

## Online kurulum ve yatay oyun

1. Supabase projesinde anonim girişleri (Anonymous Sign-ins) etkinleştirin.
2. `supabase/migrations/` altındaki dört SQL migration dosyasını numara sırasıyla uygulayın. Bunlar oda üyeliği/RLS, özel Realtime kanalları ve tur skorlarını tanımlar. Bu güncelleme yeni migration gerektirmez.
3. `.env.example` dosyasını `.env.local` olarak kopyalayın; `VITE_SUPABASE_URL` ve `VITE_SUPABASE_PUBLISHABLE_KEY` değerlerini girin. Tarayıcıya yalnız publishable/anon anahtarı verilir; service-role anahtarı kullanılmaz.
4. GitHub Pages için aynı iki değeri repository **Actions variables** alanına ekleyin. Yerel dosyalar GitHub yayınına otomatik taşınmaz.
5. Farklı ağlar arasında WebRTC bağlantısı için gerekirse `VITE_WEBRTC_ICE_SERVERS` JSON dizisini yapılandırın; bu değer artık yayın akışına da aktarılır. Varsayılan yalnız STUN kullanır, her ağda görüntü bağlantısını garanti etmez. Kalıcı özel TURN parolalarını istemciye gömmeyin; üretimde süreli TURN kimlik bilgisi hizmeti tercih edin.

Online ekran yatay kullanılır. Dik konumda çevirme uyarısı oyun kontrollerini kapatır; hareketler puan üretmez. Başlamış tur durmaz: iki oyuncunun başlangıç ve bitişi sunucunun ortak zamanına bağlıdır. Arka plandan dönmek veya modelin gecikmesi ek süre sağlamaz; kaçırılan süre geçmişe ait hareket uydurulmadan ilerletilir.

Yatay oyunda sol yarı her zaman yerel oyuncunun kamera/oyun alanı, sağ yarı rakibin kamera görüntüsüdür. P1/P2 kimliği değişmez, skor ve çarpışmalar doğru oyuncuya yazılır. Ekran boyutu değiştiğinde hedeflerin konumu ölçeklenir, skorlar sıfırlanmaz. Kamera hazırlanırken destekleyen tarayıcılarda tam ekran ve yatay yön kilidi denenir. Desteklemeyen tarayıcılarda (bazı iPhone/Safari sürümleri dahil) görünüm kullanılabilir tarayıcı alanını kaplar ve cihaz elle çevrilir.

Son skor sunucu tarafından kabul edilene kadar yerel gönderim kuyruğunda tutulur. Bağlantı geri geldiğinde ve 1,5 saniyelik yeniden denemelerde tekrar gönderilir; kullanılabilir yerel depolama varsa sayfa yenilemesinden sonra da korunur. Kuyruk oda/oyuncu/tur kimliğine bağlıdır; eski tur yeni tura yazılmaz. Tur kapatma isteği de başarısızsa yeniden denenir. Bu mekanizma yalnız gönderilmeyi bekleyen skoru korur; sayfa yenilendiğinde tüm oyun sahnesini veya geçmiş hareketleri geri yüklemez.

WebRTC, oda bağlantısı hazır olmadan sinyal göndermez. Kaybolan ilk hazır mesajı yeniden gönderilir; yanıt mesajları birbirini sonsuz kez tetiklemez. Rakip sayfayı yenilediğinde ve taşıma bağlantısı koptuğunda bağlantı yeniden kurulur/denenir. Başarısız bağlantıda görüntü alanı durum mesajı gösterir; oyun skoru kamera aktarımına bağlı değildir.

## Tüm kontroller ve yayın koşulu

```sh
npm run validate
```

Bu komut TypeScript, biçim, üretim derlemesi ve tüm `verify-*.mjs` kontrollerini sırayla çalıştırır. `npm run verify` önceden üretilmiş `dist` gerektirir. GitHub Actions da derlemeden sonra aynı doğrulama grubunu çalıştırır; hata olursa Pages artifact'i yayınlanmaz. `.gitattributes` Windows ve Linux satır sonlarını tutarlı tutar.

5 Ekim 2026 kontrolleri:
- Sekiz oyunda ortak bitiş zamanı; altı saniyelik arka plan aralığı ve model gecikmesi.
- Final skorunda başarısız gönderim, yeniden yükleme, bekleyen isteğin ardından daha yeni skor ve tur değişimi.
- Normal karelerde milisaniye yuvarlamasının sahte takip kaybı üretmemesi.
- P1/P2 için yeniden boyutlandırmada skorun korunması ve Buz Kırma parmak/hedef çarpışması.
- Taklit RTC bağlantısıyla kayıp ilk mesaj, yanıt döngüsü, rakibin yeniden bağlanması, ICE yeniden denemesi ve kaynak temizliği.
- Gerçek tarayıcıda üretim `OnlineArena` bileşeniyle 844×390 ve 640×360 yatay, 390×844 dik görünüm. Kamera/mikrofon yerine açıkça etiketli yapay görüntü kullanıldı.

Görsel örnek, geliştirme sunucusunda `/zeygame/online-arena.test.html?slot=1` veya `?slot=2` adresindedir ve üretim paketine dahil edilmez. Bu kontroller iki gerçek cihazdaki WebRTC, mikrofon, CDN ve telefon tarayıcısının tam ekran davranışını doğrulamaz. Bu cihaz kontrolleri ayrıca yapılmalıdır.
