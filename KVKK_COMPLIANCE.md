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
| Anonimleştirme her zaman tespitten ÖNCE çalışır | Sidecar `@requires_anonymization` middleware'i; `/detect` taze (<60 sn) bir anonimleştirme makbuzu (sha256) olmadan reddeder. Go `sidecar.Client` önce `/anonymize`, sonra `/detect` çağırır. |
| Sınıf izin listesi (allowlist) | `model.AllowedClasses()` (Go) + sidecar sınıf filtresi. Listede olmayan her sınıf sınırda düşürülür. |
| Ham görüntü kalıcılaştırılmaz | Go `bytes.Reader`/`multipart` ile yalnızca bellek; `img.Image = nil` ile çağrı sonrası serbest bırakılır. Sidecar `BytesIO`. Disk/`/tmp` yazımı yok. |
| Kimlik verisi loglanmaz | Log yalnızca `{face_count, plate_count, image_sha256}` içerir — ham bayt veya kimlik asla. |
| Pano ID ↔ yüz/plaka sayısı birleştirilmez | `PointResult` yüz/plaka sayısı **içermez**; makbuz ayrı tutulur (PLAYBOOK §8.6). |
| Public bucket yok | Mimaride hiçbir S3/GCS kovası tanımlı değil. |

## 3. Anonimleştirme Yöntemi
Her ham görüntü, herhangi bir kentsel-nesne detektörü baytlara dokunmadan önce
`Panoramax/detect_face_plate_sign` (YOLO11l) modeliyle yüz ve plakaları geri
dönülemez biçimde bulanıklaştırılır. İşlem makbuzu:
`{ face_count, plate_count, image_sha256 }` olarak yapılandırılmış loga yazılır.

## 4. Model Eğitimi Kısıtı
Google Street View görüntüleri üzerinde **hiçbir model eğitilmez/ince
ayarlanmaz** (türev veri kümesi oluşturmak yasaktır). Görüntüler depoya
(bulanık olsa bile) **commit edilmez** (Madde 6 özel nitelikli veri riski).

## 5. Sınırda Kararlar (Borderline Decisions)
- **Street View zaten bulanıklaştırıyor; neden tekrar?** KVKK Madde 5 ve hackathon
  kuralları, herhangi bir detektör baytlara dokunmadan önce *kendi*
  geri-dönülemez anonimleştirmemizi göstermemizi gerektirir. İkili savunma katmanı.
- **Pano tarihi gösterimi:** Pano tarihi (ör. "2019-06") UI'da gösterilir ancak
  yüz/plaka sayımıyla birleştirilmez.

## 6. Veri Silme
Bkz. [`DATA_DELETION.md`](./DATA_DELETION.md). Etkinlik sonunda tüm hizmetler,
deployment'lar ve geçici veriler geri dönülemez biçimde silinir.

---
Herhangi bir görev yukarıdaki yasaklardan birini isterse, geliştirme reddedilir
ve KVKK Madde 5 (amaç sınırlaması) / Madde 6 (özel nitelikli veri) gerekçe gösterilir.
