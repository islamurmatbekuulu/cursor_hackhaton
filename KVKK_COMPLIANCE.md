# KVKK Uyumluluk / KVKK Compliance

Kaldırım Skoru, Türkiye Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında
**veri minimizasyonu** ve **amaç sınırlaması** ilkeleriyle tasarlanmıştır. Bu
belge, mimaride kodlanmış sert kuralları ve sınırda alınan kararları belgeler.

## 1. Amaç Sınırlaması (KVKK Madde 5)
Sistem **yalnızca** kentsel nesneleri tespit eder: kaldırım işgali (clutter),
çöp, çukur (pothole), inşaat molozu, tabela durumu, grafiti, bakımsız cephe.
Hiçbir koşulda yüz tanıma, plaka okuma (OCR), kişi/araç takibi, yeniden
kimliklendirme veya demografik çıkarım **yapılmaz**.

## 2. Kodda Zorlanan Sert Kurallar (Hard Rules Enforced in Code)

| Kural | Nerede zorlanıyor |
|---|---|
| Kullanıcı yüklemeleri puanlamadan ÖNCE anonimleştirilir | Go `ScorePhotoUseCase` önce `Anonymizer.Anonymize` (sidecar `/anonymize`) çağırır; **yalnızca** dönen bulanık PNG, puanlama için Claude görsel modeline gönderilir (bkz. §5.4). Ham baytlar `in.Image = nil` ile hemen serbest bırakılır. Makbuz `{face_count, plate_count, image_sha256}` Claude çağrısından **önce** loglanır. (Eski Roboflow `/detect` artık fotoğraf yolunda **çağrılmaz**; Street View yolu hâlâ `DetectPreBlurred` kullanır — bkz. §5.1.) |
| Sınıf izin listesi (allowlist) | `model.AllowedClasses()` (Go) + sidecar sınıf filtresi. Listede olmayan her sınıf sınırda düşürülür. |
| Ham görüntü kalıcılaştırılmaz | Go `bytes.Reader`/`multipart` ile yalnızca bellek; `img.Image = nil` ile çağrı sonrası serbest bırakılır. Sidecar `BytesIO`. Disk/`/tmp` yazımı yok. |
| Kimlik verisi loglanmaz | Log yalnızca `{face_count, plate_count, image_sha256}` içerir — ham bayt veya kimlik asla. |
| Pano ID ↔ yüz/plaka sayısı birleştirilmez | `PointResult` yüz/plaka sayısı **içermez**; makbuz ayrı tutulur (PLAYBOOK §8.6). |
| Public bucket yok | Mimaride hiçbir S3/GCS kovası tanımlı değil. |

## 3. Anonimleştirme Yöntemi
**Kullanıcı tarafından yüklenen** her ham görüntü, herhangi bir kentsel-nesne
detektörü baytlara dokunmadan önce `Panoramax/detect_face_plate_sign` (YOLO11l)
modeliyle yüz ve plakaları geri dönülemez biçimde **yerel olarak**
bulanıklaştırılır. İşlem makbuzu `{ face_count, plate_count, image_sha256 }`
olarak yapılandırılmış loga yazılır ve `/detect` makbuz kapısından geçer.

Google Street View görüntüleri bu yerel adımdan **muaftır**: Google, yüzleri ve
plakaları yayından önce kaynakta zaten bulanıklaştırır (bkz. §5). Bu durumda
yerel bulanıklaştırma adımı atlanır; yalnızca `image_sha256` denetlenebilirlik
için loglanır.

## 4. Model Eğitimi Kısıtı
Google Street View görüntüleri üzerinde **hiçbir model eğitilmez/ince
ayarlanmaz** (türev veri kümesi oluşturmak yasaktır). Görüntüler depoya
(bulanık olsa bile) **commit edilmez** (Madde 6 özel nitelikli veri riski).

## 5. Sınırda Kararlar (Borderline Decisions)

### 5.1 Street View kaynak-taraflı bulanıklaştırma / Street View source-side blurring
**Karar (2026-06):** Street View görüntüleri için yerel (tekrar) anonimleştirme
adımı kaldırıldı; kullanıcı tarafından yüklenen fotoğraflar için yerel
anonimleştirme **korunuyor**.

**Gerekçe / Rationale.** Google, Street View'i yayınlamadan önce yüzleri ve
araç plakalarını **kaynakta otomatik olarak bulanıklaştırır** (Google Maps
Street View gizlilik politikası: "We blur faces and license plates within
Street View imagery"). Dolayısıyla bu görüntüleri ikinci kez bulanıklaştırmak
gereksizdir ve her taramaya ~60 sn ekler. Kullanıcı tarafından yüklenen
fotoğraflar ise kaynakta anonimleştirilmiş **değildir**; bu nedenle her zaman
önce yerel olarak bulanıklaştırılır (makbuz kapısı zorunludur).

**Decision (EN).** We skip our local face/plate blur step for Google Street View
imagery because Google blurs faces and license plates at the source before
publishing, making a second blur redundant and slow (~60 s/scan). User-uploaded
photos are NOT pre-anonymized and are therefore ALWAYS blurred locally first.

**Teknik mekanizma / Exact mechanism.**
- Go `ScoreStreetUseCase` → `Detector.DetectPreBlurred` çağırır (eski
  `AnonymizeAndDetect` değil). `/anonymize` adımı atlanır.
- İstemci, `/detect` çağrısına açık bir kaynak iddiası başlığı ekler:
  `X-Image-Source: google-streetview-preblurred`
  (Go sabiti `sidecar.StreetViewSource`, Python sabiti
  `STREETVIEW_PREBLURRED_SOURCE` — değerler birebir eşleşir).
- Sidecar `/detect`: bu başlık **tam olarak** bu değeri taşıyorsa makbuz kapısı
  **yalnızca o istek için** atlanır. Aksi halde (kullanıcı fotoğrafı yolu) taze
  bir `/anonymize` makbuzu yoksa istek **412** ile reddedilmeye devam eder.
  Bypass dar ve açıktır; kapı genel olarak kaldırılmamıştır.
- Denetlenebilirlik: her iki yolda da `image_sha256` loglanır (Street View
  yolunda yüz/plaka sayısı üretilmez ve loglanmaz). Hiçbir ham bayt veya kimlik
  bilgisi loglanmaz; `image_sha256` opak bir içerik özetidir ve pano ID ile
  birleştirilmez.

**Kalan risk (kabul edildi) / Residual risk (accepted).** Google'ın kaynak
bulanıklaştırması %100 değildir; nadiren kaçırılan yüz/plaka olabilir. Bu, KVKK
Madde 5 (amaç sınırlaması) kapsamında **kabul edilen bir ödünleşmedir**:
sistemimiz hiçbir koşulda yüz/plaka/kişi/araç tespiti, tanıma, OCR veya takip
yapmaz; yalnızca kentsel-nesne sınıflarını sayar. Kaçırılan bir yüz/plaka,
herhangi bir kimlik çıkarımına tabi tutulmaz, depolanmaz veya pano ID ile
ilişkilendirilmez. Tüm ham görüntüler istek sonunda bellekten serbest bırakılır.

### 5.2 Diğer / Other
- **Pano tarihi gösterimi:** Pano tarihi (ör. "2019-06") UI'da gösterilir ancak
  yüz/plaka sayımıyla birleştirilmez.

### 5.3 Belediye konsolu — bulanıklaştırılmış kanıt saklama / Municipality console blurred evidence
**Karar (2026-06):** Mobil kamera gönderimleri için yalnızca `/anonymize` çıktısı
olan **bulanıklaştırılmış PNG** (`image_blurred BYTEA`) Postgres'te saklanır.
Ham yükleme baytları asla kalıcılaştırılmaz; anonimleştirme sonrası bellekten
serbest bırakılır.

**Amaç sınırlaması / Purpose limitation.** Belediye konsolu (web), vatandaş
bildirimlerini kentsel denetim amacıyla listeler; yüz/plaka OCR, kişi/araç takibi
veya kimlik çıkarımı yapılmaz. API yanıtlarında `face_count` / `plate_count`
döndürülmez; yalnızca yapılandırılmış log satırında tutulur.

**Ham görüntü yasağı / No raw storage.** `submissions.image_blurred` alanı yalnızca
sidecar `/anonymize` gövdesinden gelen PNG baytlarını içerir. Ham JPEG/PNG yükleme
diskte, bucket'ta veya repoda tutulmaz.

**Saklama / Retention.** Hackathon taslağı: gönderim kayıtları ve bulanık kanıt
**90 gün** sonra silinir (üretimde `DATA_DELETION.md` ile hizalanır). Repo'ya
görüntü dosyası commit edilmez.

**Erişim / Access.** `GET /api/v1/submissions/{id}/image` yalnızca bulanık PNG
döndürür; `Cache-Control: private`. Liste uçları görüntü baytı içermez.

### 5.4 LLM görsel puanlama — Anthropic Claude'a bulanık görüntü gönderimi / LLM visual scoring with Anthropic Claude
**Karar (2026-06):** Fotoğraf puanlama yolunda Roboflow nesne-tespit modeli
**aktif yoldan kaldırıldı**. Anonimleştirme (yüz + plaka bulanıklaştırma) adımı
**korunuyor**; ardından yalnızca **bulanıklaştırılmış PNG**, kaldırım /
görsel-kirlilik puanı (0–100), A–F notu, kirlilik kategorileri ve kısa Türkçe bir
rapor üretmesi için Anthropic Claude görsel (vision) modeline gönderilir. Sonuç
mobil uygulamaya döner ve belediye konsolu için gönderim olarak kalıcılaştırılır.

**Decision (EN).** On the photo path the Roboflow object detector is removed from
the active flow. The face/plate anonymization step is KEPT; only the BLURRED PNG
is then sent to Anthropic's Claude vision model, which returns a 0–100
walkability/visual-pollution score, an A–F grade, pollution categories, and a
short Turkish report. The result is returned to the mobile app and persisted for
the municipality console.

**Gerekçe / Rationale.** Demo için, sahaya özgü eğitilmiş bir detektörden çok,
genel amaçlı bir görsel-dil modelinin kaldırım durumunu insanlarca okunabilir
şekilde değerlendirmesi (skor + Türkçe açıklama) daha esnek ve gösterime uygundur.
Tespit yerine **bütünsel sahne değerlendirmesi** yapılır; çıktı yine yalnızca
kentsel-kirlilik sınıflarına indirgenir (allowlist).

**Anonimleştirme önce çalışır / Faces & plates blurred FIRST.** Sıralama
değişmedi: `ScorePhotoUseCase`, Claude'dan **önce** `Anonymizer.Anonymize`
çağırır. Claude'a giden baytlar sidecar `/anonymize` çıktısıdır (yüz/plaka
bulanık). Ham yükleme baytları Claude'a (veya başka herhangi bir yere) **asla**
gönderilmez; anonimleştirmeden hemen sonra `nil` yapılıp GC'ye bırakılır.

**Claude'a verilen talimat / What Claude is instructed to do.** Sistem komutu
(prompt) modele **açıkça** şunu söyler: yalnızca kaldırım/kentsel görsel-kirlilik
koşullarını (çöp, bozuk/işgal edilmiş kaldırım, inşaat molozu, grafiti,
solmuş/bozuk tabela, bakımsız cephe) değerlendir; **kişileri tanımlama/tarif
etme/sayma**, **plaka veya kimliklendirici metin okuma/yazma (OCR yok)**, **yüz
tanıma**, **kişi/araç takibi yapma**. Yanıt yalnızca
`{score, grade, categories[], report_tr}` JSON'udur. Kod tarafında **yalnızca**
bu alanlar okunur; kategoriler allowlist'e göre filtrelenir; modelin döndürebileceği
başka herhangi bir (kimliklendirici olabilecek) içerik **yok sayılır / atılır**.
Tam prompt metni `services/api/internal/infrastructure/llm/claude/client.go`
içindedir.

**Ham görüntü saklanmaz/gönderilmez / No raw storage or transfer.** §5.3'teki gibi,
kalıcılaştırılan tek görüntü temsili `submissions.image_blurred` (bulanık PNG)
olmaya devam eder. Claude'a yalnızca bu bulanık baytlar gider; yanıttan üretilen
`score/grade/report` kalıcılaştırılır.

**Loglama / Logging.** Claude istemcisi yalnızca `{model, image_sha256, score,
grade, kategori_sayısı, token kullanımı}` loglar. API anahtarı **asla**, rapor
metni **asla**, hiçbir kimlik bilgisi **asla** loglanmaz. Anahtar ortam
değişkeninden (env) okunur, yoksa servis başlamaz (fail-fast); istemci paketine
veya yanıtlara sızdırılmaz.

**Kalan risk (kabul edildi) / Residual risk (accepted).**
- **Üçüncü taraf / yurt dışı aktarım:** Bulanık görüntü, üçüncü taraf bir işleyiciye
  (Anthropic, ABD) HTTPS üzerinden iletilir. Görüntü, kişiler bakımından kaynakta
  anonimleştirilmiştir (yüz/plaka bulanık), ancak yine de dış bir servise aktarım
  söz konusudur. Bu, hackathon demosu kapsamında **kabul edilen bir karardır**;
  üretimde KVKK Madde 9 (yurt dışına aktarım) için açık rıza / yeterlilik kararı /
  veri işleme sözleşmesi gerekir.
- **Bulanıklaştırma kusuru:** §5.1'deki gibi, yerel YOLO/Haar bulanıklaştırması
  %100 değildir; nadiren kaçırılan bir yüz/plaka Claude'a ulaşabilir. Sistem bu
  durumda dahi kimlik çıkarımı **istemez**; model açıkça kimliklendirmemeye
  yönlendirilir ve yalnızca skor/kategori/rapor saklanır.
- **Serbest-metin rapor:** `report_tr` modelden gelen serbest metindir; talimata
  rağmen teorik olarak kimliklendirici ifade içerebilir. Azaltım: güçlü sistem
  komutu + yalnızca kentsel-kirlilik odaklı çıktı; raporun loglanmaması; gerekirse
  belediye konsolunda insan denetimi. Kaçırılan bir yüz/plaka **hiçbir** kimlik
  çıkarımına, OCR'a, tanımaya veya pano/araç eşleştirmesine tabi tutulmaz.

**Decision (EN, summary).** Blurred imagery is sent to Anthropic Claude purely to
score sidewalk visual pollution. Faces/plates are blurred first; raw bytes are
never sent or stored; Claude is explicitly instructed not to identify people,
read plates, perform OCR, face recognition, or person/vehicle tracking; only
score/grade/categories/report are kept and any identifying content is discarded.
Residual risks (third-party/cross-border transfer of blurred images, imperfect
blur, free-text report) are acknowledged and accepted for the demo.

## 6. Veri Silme
Bkz. [`DATA_DELETION.md`](./DATA_DELETION.md). Etkinlik sonunda tüm hizmetler,
deployment'lar ve geçici veriler geri dönülemez biçimde silinir.

---
Herhangi bir görev yukarıdaki yasaklardan birini isterse, geliştirme reddedilir
ve KVKK Madde 5 (amaç sınırlaması) / Madde 6 (özel nitelikli veri) gerekçe gösterilir.
