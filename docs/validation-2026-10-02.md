# ZeyGame son doğrulama — 2 Ekim 2026

Mevcut Git değişiklikleri ve üç yeni dosya incelendi ve korundu. Bu kontrolde kalıcı değişiklikler yalnızca README ve bu rapordur. Uygulama, worker ve mevcut doğrulama betikleri değiştirilmedi. Commit, push veya canlı deploy yapılmadı.

## Geçen otomatik kontroller

| Komut                                      | Sonuç                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `npm.cmd run typecheck`                    | Geçti                                                                          |
| `npm.cmd run format:check`                 | Geçti                                                                          |
| `npm.cmd run build`                        | Geçti; normal build worker üretimini çalıştırdı                                |
| `node scripts/verify-audio.mjs`            | Geçti; ortak ses bağlamı, kullanıcı hareketi, resume ve temizlik               |
| `node scripts/verify-coordinates.mjs`      | Geçti; 1280×720, 1920×1200, 390×844, crop, resize ve DPR=2                     |
| `node scripts/verify-detection-gating.mjs` | Geçti; aktif model, aynı kare cache'i ve eski sonuç temizliği                  |
| `node scripts/verify-face-scoring.mjs`     | Geçti; 91 sınır, 78 geçersiz/eksik veri ve tur toplamları                      |
| `node scripts/verify-model-lifecycle.mjs`  | Geçti; paylaşılan yükleme, hata, retry, geç sonuçlar, kapatma ve main.ts akışı |
| `node scripts/verify-service-worker.mjs`   | Geçti; Node VM/Cache Storage simülasyonu, gerçek tarayıcı değildir             |
| `git diff --check`                         | Geçti; Git'in LF/CRLF bildirimleri hata değildir                               |

Normal build: `tsc -b && vite build --configLoader runner && node scripts/generate-service-worker.mjs`. `dist/sw.js` üretildi; template tokenları çözüldü, altı precache yolunun tümü `/zeygame/` altında ve SHA-256 değerleri diskteki build kaynaklarıyla eşleşiyor. Normal çıktı: `index-DMUH01lx.js`, `index-z67nshwF.css`.

## Gerçek Chrome testi

Tarayıcı mevcut Chrome profiliydi. Test origin'i `http://127.0.0.1:4179`, uygulama ve worker scope'u `/zeygame/` idi. A ve B, `.validation-sw/A` ve `.validation-sw/B` altında mevcut kaynakların kopyalarından üretildi. Geçici sürümlere gözlem paneli, HTML sürüm etiketi, JavaScript veri etiketi ve CSS değişkeni eklendi; kalıcı kaynaklar ezilmedi. Worker mantığı mevcut template'ten üretildi.

| Sürüm | JS                  | CSS                  | Shell cache                      |
| ----- | ------------------- | -------------------- | -------------------------------- |
| A     | `index-BUlKPI_O.js` | `index-DgYfgB5l.css` | `zeygame-shell-802528419c741b5a` |
| B     | `index-BN87_weS.js` | `index-CeuH5tEY.css` | `zeygame-shell-cab24ad9bb5828b4` |

1. A ilk açılışta worker tarafından kontrol edildi: controller `/zeygame/sw.js`, scope `/zeygame/`, active `activated`, belge yükleme sayısı **1**.
2. Aynı sunucu B dizinine geçirildi. Yenileme yapmadan `registration.update()` çağrıldı; periyodik güncellemenin bekleme süresi test edilmedi. B `waiting: installed` durumuna geçti ve uygulamanın **Yeni sürüm hazır — Yenile** bildirimi göründü. A belgesi ve yükleme sayısı **1** olarak kaldı.
3. B sunulurken A'nın JS/CSS kaynakları `cache: no-store` ile istendi. Worker üzerinden iki yanıt da **200** ve SHA-256 değerleri ilk A içerikleriyle aynıydı.
4. Uygulamanın kendi **Yenile** düğmesine basıldı. B açıldı, belge yükleme sayısı **2** oldu, worker aktifti ve bildirim kayboldu. B JS/CSS yanıtları **200** idi. A kaynakları B worker üzerinden tekrar istendi; yine **200** ve aynı A hash'leri döndü.
5. Sunucu yalnızca B dosyalarını tuttuğu için eski A dosyalarının ağ alt istekleri sunucu logunda **404** döndü. Worker bunları cache'den karşıladı; sayfanın aldığı JS/CSS yanıtları 404 olmadı. Bu ayrım, ağ logunda hiç 404 görülmediği anlamına gelmez.
6. Test başında başka uygulama adıyla oluşturulan `other-app-validation` cache'indeki `/other-app/sentinel` içeriği `preserved` idi. B aktivasyonu ve çevrimdışı yükleme sonrasında aynı içerik korundu.
7. Yerel HTTP sunucusu tamamen kapatıldı. Terminalde bağımsız bağlantı denemesi `curl: (7) ... Could not connect to server` ile başarısız oldu. Chrome'da normal yeniden yükleme B menüsünü, JS ve CSS'yi **200** yanıtlarıyla cache'den açtı; belge yükleme sayısı **3** oldu. Bu, origin erişiminin kesilmesidir; cihazın genel interneti veya CDN bağlantısı kapatılmadı.

Geçici sunucu ve çalışma dizinleri test sonunda kaldırıldı. Test cache'leri yalnızca bu localhost origin'inde oluştu; canlı siteye erişilmedi veya deploy yapılmadı.

## Açık hatalar — önerilen öncelik sırası

Bu bulgular kaynak incelemesi ve mevcut TypeScript sınıflarının geçici Node tanı çalıştırmasıyla doğrulandı. Gerçek kamera testi olarak sunulmuyor. Kod düzeltmesi yapılmadı.

1. **Vücut güvenilirliği ve Çömelme sayımı — kod düzeltildi, otomatik doğrulama geçti; gerçek kamera testi bekliyor.** İlk incelemede `src/pose-tracker.ts` içindeki `smooth()` yalnızca x/y/z döndürdüğü için visibility/presence kayboluyordu; düşük güvenilirlikli nokta `{x:0.4,y:0.3,z:0}` oluyor ve Dans kontrolü bunu güvenilir kabul ediyordu. `src/games/squat-race.ts` güven kontrolü yapmadığından visibility=presence=0 girdisi **[1,0]** skor üretiyordu. Takip düzeltmesinde smoothing yalnızca x/y/z konumlarını önceki 0.65/yeni 0.35 ağırlıklarıyla yumuşatıyor; mevcut karenin visibility/presence alanlarını değiştirmeden koruyor. Eksik alan eklenmiyor, eski güven yeni kareye taşınmıyor. Çömelmede iki kalça, iki diz ve iki ayak bileği (23–28) mevcut olmalı; x/y/z sonlu olmalı. Her landmark için visibility veya presence alanlarından en az biri sağlanmalı; sağlanan tüm değerler sonlu, 0–1 aralığında ve adlandırılmış `MIN_LANDMARK_CONFIDENCE = 0.55` eşiğine eşit veya üstünde olmalı. Tek başına visibility veya presence destekleniyor; ikisi de yoksa kare reddediliyor, açıkça 0 değeri eksik alan sayılmıyor. Geçersiz kare veya takip kaybı yarım tekrarı iptal ediyor; başlangıçta ve takip geri geldiğinde önce güvenilir ayakta duruş gerekiyor. Yalnız ayakta → çömelmiş → ayakta dizisi 1 puan veriyor. 110°/160° açı eşikleri ve varsayılan 20 saniye korundu. Ortak pose güvenilirlik yardımcısı bulunmadı; Dans/Zıplama yerel kontrolleri eksik güveni kabul ettikleri için burada kullanılmadı, bu oyunların puanlama kodları değiştirilmedi. Yeni `node scripts/verify-pose-reliability.mjs` testi gerçek `PoseTracker.load()/detect()` ve `SquatRace.start()/update()/getScores()` üzerinden güven alanlarının korunmasını, yüksekten sıfıra geçişi, 146 geçersiz girdi durumunu, opsiyonel güven kombinasyonlarını, tam 1 puanlık geçerli tekrarı, sabit duruşu, ilk pozun çömelmiş olmasını, takip kaybını/geri gelişini ve oyuncu bağımsızlığını doğruladı. Typecheck, format:check, build, mevcut altı doğrulama betiği, yeni test ve git diff --check geçti. Gerçek kamerada test yapılmadı; diğer bulguların durumu değiştirilmedi.
2. **Dans Taklidi poz ayrımı/puanlama — açık.** `src/games/dance-mimic.ts:92` ölçtüğü altı açı içinde dirsek, kalça ve diz açılarını kullanıyor; kolun gövdeye göre yönünü ayıran omuz açısı yok. T hedefinin dirsek/kalça değerleri 90° iken sentetik düz T pozunda bunlar 180°. Kollar aşağıda dik duruş ile T pozu aynı hedefte **0.6574074074** benzerlik aldı (`reliable:true`). Dolayısıyla yanlış poz yaklaşık %66 / tur için 7 puan alabilir ve doğru T pozundan ayrışmaz. Eski raporun tam metni çalışma dizininde yok; bu somut puanlama sorunu yeniden üretildi, çözülmüş kabul edilemez.
3. **Buz Kırma ayrı dokunuş sayımı — açık.** `src/games/ice-breaker.ts:62` yalnızca küp içinde olmayı ve cooldown'u kontrol ediyor; temastan çıkıp tekrar girme şartı yok. Parmağı aynı yerde tutan tanı girdisinde t=0, 0.25, 0.5 saniyede vuruşlar **1, 2, 3**, skor **[1,0]** oldu. Cooldown çalışıyor; üç ayrı dokunuş garantisi çözülmedi. Oyunun kendi açıklaması da hâlâ üç ayrı dokunuş istiyor.
4. **Eski oyun sayısı metinleri — açık.** `src/main.ts:21` menüde “üç mini oyunda”, `index.html:11` meta açıklamasında “üç mini oyunlu” diyor. Oyun yöneticisinde sekiz oyun var; gerçek Chrome menüsünde eski metin görüldü. Kod değiştirilmedi.

Tamamlanmış eski cache'lerin birikmesi mevcut koruma tercihidir; açık sekmelere hizmet etmek için tutuluyor, disk kullanımı sınırlanmıyor. README'deki “en yeni çevrimdışı sürüm” ifadesi daraltıldı: kod cache oluşturulma sırasına bakıyor, ayrıca sürüm tarihi karşılaştırmıyor. Rollback veya önceden var olan cache'in yeniden güncellenmesi bu kontrol kapsamında test edilmedi.

## Yapılmayan kontroller

- Kamera açıkken iki oyuncuyla sekiz oyunun skorları, geçişleri, gerçek hizası, menüde kameranın fiziksel kapanması ve tekrar oynama.
- Gerçek model/CDN arızası ve yeniden deneme; otomatik betikler model yükleyicilerini taklit eder.
- Laptop/iPhone'da duyulabilir ses; iPhone/Safari, kurulu PWA ve yayınlanmış HTTPS sitede güncelleme.
- Aktif oyun sırasında A→B; gerçek Chrome testi menüde yapıldı. Koddaki kullanıcı isteği şartı incelendi, kamera açık oturum başarı iddiası yok.
- Boş cache ile ilk çevrimdışı ziyaret, tam çevrimdışı oyun ve cihazın genel internetini kesme.
- Birden çok açık sekme, eski v2 worker'dan geçiş, rollback, cache kotası ve browser eviction.

Gerçek cihaz için kısa manuel kontrol listesi README'nin sonundadır. Bu kontroller işaretlenmiş veya başarılı kabul edilmiş değildir.
