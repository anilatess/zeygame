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

## Oyun yöneticisi ve Buz Kırma

`GameManager`, `MENU`, `CALIBRATION`, `COUNTDOWN`, `PLAYING`, `RESULT` ve `FINAL` durumları arasında geçiş yapar. Kalibrasyon tamamlanınca üç saniyelik geri sayım başlar ve ardından 20 saniyelik **Buz Kırma** mini oyunu çalışır.

Her oyuncunun kendi ekran yarısında buz küpleri oluşur. İşaret parmağı ucu (8 numaralı landmark) bir küpe üç kez dokunduğunda küp kırılır ve ilgili oyuncu bir puan kazanır. Küpler dört saniye içinde kırılmazsa kaybolur. Oyun sonunda skorlar ve Türkçe kazanan/beraberlik mesajı gösterilir. Kısa dokunma, kırılma ve geri sayım sesleri Web Audio API ile üretilir; ses desteklenmezse oyun çalışmaya devam eder.

İkinci oyun **Çömelme Yarışı**dır. Oyun geçişinde yalnızca Pose Landmarker yüklenir ve iki vücut sol/sağ bölgeye ayrılır. Kalça-diz-ayak bileği açısı 110 derecenin altına indiğinde çömelme başlar; 160 derecenin üzerine çıktığında bir puan tamamlanır. Basit hareket yumuşatma uygulanır ve aynı çömelme ikinci kez sayılmaz.

Üçüncü oyun **Ağız Açma Yarışı**dır. Bu aşamada yalnızca Face Landmarker yüklenir; yüzler sol/sağ bölgeye atanır ve `jawOpen` blendshape değeri 0.6 üzerine çıktığında oyuncu bir puan alır. Ağız kapanmadan tekrar puan verilmez. `mouthSmileLeft`, `mouthSmileRight`, `eyeBlinkLeft` ve `eyeBlinkRight` değerleri de oyuncu yüz verisinde saklanır. Yüz algılanmazsa oyun devam eder.

## İki oyunculu kalibrasyon

Kamera ve model başladıktan sonra kısa bir kalibrasyon ekranı açılır. Görüntünün sol yarısı Oyuncu 1, sağ yarısı Oyuncu 2 olarak ayrılır. Bilek landmarkının aynalanmış x konumuna göre eller oyunculara atanır; iki tarafta da en az bir el algılanmadan kalibrasyon tamamlanmaz. Oyuncu 1 mavi, Oyuncu 2 pembe çizilir ve ortadaki dikey çizgi bölgeleri gösterir. İki el algılandığında kalibrasyon ekranı kapanır ve kamera/landmark çizimleri devam eder.
