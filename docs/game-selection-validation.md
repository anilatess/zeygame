# Oyun seçimi doğrulaması — 2 Ekim 2026

Parti ve iki kişilik tek oyun oturumları aynı GameManager tarafından yönetilir. Menüdeki Oyun Seç, mevcut sekiz oyunun metadata kartlarını gösterir. Parti sırası korunur; tek oyun sonucu yalnızca oynanan oyunun skorlarını sunar. Oyun kuralları, skor hesapları, süreler, koordinat dönüşümleri ve service worker değiştirilmedi.

## Otomatik kontroller

`npm.cmd run typecheck`, `npm.cmd run format:check`, `npm.cmd run build`, mevcut on doğrulama betiği, yeni `node scripts/verify-game-selection.mjs` ve `git diff --check` başarılı.

Yeni seçim testi gerçek `main.ts`, CameraController, GameManager, oyun sınıfları ve takip sınıflarını çalıştırır. DOM, kamera akışı, model yükleyicileri, algılama çıktıları ve zaman kontrollü sahtedir; kamera/model dosyası indirmez. Sekiz metadata kartı ve takip etiketleri, seçim ekranında kamera/ses başlamaması, sekiz oyunun ayrı oturumları ve doğru modelleri, iki bölge koşulu, aynı bölgede iki algılamanın yetersizliği, pose güvenilirliği, çift tıklama, model hazır olmadan bekleme, yalnız seçilen oyunun başlaması, final/skor/beraberlik, tekrar oynama, seçim/menü çıkışında kaynak kapatma, parti sırasının geri gelmesi, hata/yeniden deneme ve geç gelen model/kamera sonuçları kontrol edilir. Kamera metadata bekleyişinden çıkış da listener ve stream temizliğiyle doğrulanır.

Algılama testi sekiz oyunun CALIBRATION, COUNTDOWN ve PLAYING durumlarında yalnız uygun modelin çalıştığını kontrol eder. Dans entegrasyon testi yeni iki-pose hazırlığına uyarlandı; tüm mevcut 24 saniye ve 40 puan kontrolleri korundu. Ses ve model yaşam döngüsü testlerinde yeni HTML butonlarına ait DOM taklitleri genişletildi.

Üretim çıktısında yalnız uygulama kabuğu dosyaları, JS/CSS, manifest, ikon ve worker bulunur. Görsel test HTML girişi ve test betikleri `dist` içine alınmaz.

## Chrome görsel kontrolleri

1440×900, 390×844 ve 844×390 CSS viewport boyutları kullanıldı. Gerçek uygulamada Oyun Seç ve Ana Menü/Escape dönüşleri denendi; kamera kapalı kaldı. Sekiz kart, metinler, butonlar ve yatay taşma kontrol edildi. Seçim butonları 48px, final butonları 52px veya daha büyük. Klavyeyle kartlara ve üç final butonuna erişim, sarı odak çizgisi, seçim başlığına giriş odağı ve Oyun Seç tetikleyicisine dönüş odağı incelendi. Yatay ana menüde Partiyi Başlat butonu viewport içinde erişilebilir kaldı.

Tek oyun finali, üretimde kullanılmayan `game-screens.test.html?single&state=FINAL&game=2` geliştirme girişinde kontrollü skorlarla gösterildi. Bu sayfa mevcut GameManager/GameUI/CSS katmanlarını kullanır; kamera başlatmaz ve üzerinde **SAHTE VERİ · KAMERA TESTİ DEĞİL** etiketi vardır. Beraberlik ve Yenile bildirimi de yatay görünümde incelendi; paneller çakışmadı. Final fixture butonlarının klavye erişimi incelendi; gerçek oturum kapanışı ve tekrar oynama davranışları yeni main.ts akış testiyle doğrulandı.

Seçim ekranı dikey kaydırılabilir. Aşağıdaki seçim görüntüleri tüm sayfayı içerdiği için yükseklikleri viewport yüksekliğinden büyüktür. Yatay final görüntüsündeki 1px raster yuvarlaması CSS viewport ölçüsünü değiştirmez.

| Viewport | Gerçek uygulamada seçim                        | Sahte verili tek oyun finali                      |
| -------- | ---------------------------------------------- | ------------------------------------------------- |
| 1440×900 | [Seçim](game-selection/selection-1440x900.jpg) | [Final](game-selection/single-final-1440x900.jpg) |
| 390×844  | [Seçim](game-selection/selection-390x844.jpg)  | [Final](game-selection/single-final-390x844.jpg)  |
| 844×390  | [Seçim](game-selection/selection-844x390.jpg)  | [Final](game-selection/single-final-844x390.jpg)  |

[Beraberlik ve güncelleme bildirimi, 844×390](game-selection/single-tie-update-844x390.jpg).

## Gerçek cihazda bekleyen kontroller

- Laptop Chrome ve telefon Safari/Chrome'da iki kişiyle sekiz oyunun ayrı ayrı el/vücut/yüz hazırlığı, dar kamera kadrajı ve gerçek model güvenilirliği.
- Gerçek kamera izni kabul/ret, cihaz kamera göstergesinin seçim/menü çıkışında kapanması ve izin beklerken çıkış.
- Duyulabilir geri sayım/oyun sesi, tekrar oynama ve oturum kapanışında seslerin kesilmesi.
- Gerçek model/CDN hatası ve yeniden deneme, yükleme sırasında çıkış, fiziksel cihaz dönüşü ve güvenli alanlar.
- Tek oyundan sonra sekiz oyunluk partiyi gerçek kamerayla tamamlama ve skorları gözlemleme.

Sahte verili otomatik/görsel kontroller gerçek kamera oynanışı olarak raporlanmaz. Commit, push veya deploy yapılmadı.

## Değiştirilen dosyalar

- `src/main.ts`, `src/game-manager.ts`, `src/game-ui.ts`, `src/camera.ts`, `src/calibration.ts`, `src/types.ts`, `src/styles.css`
- `src/games/squat-race.ts`, `src/games/jump-race.ts`, `src/games/dance-mimic.ts` (yalnız hazırlık metadata'sı)
- `scripts/verify-game-selection.mjs`, `scripts/verify-detection-gating.mjs`, `scripts/verify-dance-scoring.mjs`, `scripts/verify-audio.mjs`, `scripts/verify-model-lifecycle.mjs`, `scripts/visual-game-fixture.ts`
- `README.md`, bu rapor ve yukarıda bağlantıları bulunan yedi JPG.
