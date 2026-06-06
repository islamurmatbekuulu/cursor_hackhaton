# Veri Silme Taahhüdü / Data Deletion Commitment

## 1. Proje
Kaldırım Skoru — Cursor Hackathon, Haziran 2026.

## 2. Veri Sorumlusu / Data Controller
Proje ekibi (hackathon katılımcısı). İletişim: repo sahibi GitHub profili.

## 3. İşlenen Veri Kategorisi
Google Street View Static API üzerinden ve/veya kullanıcı yüklemesiyle geçici
olarak alınan, ham (anonimleştirilmemiş) sokak görüntüleri. Görüntüler yalnızca
RAM'de tutulur; kalıcı diske, geçici dosyaya (`/tmp`) veya buluta **yazılmaz**.

## 4. İşleme Amacı (KVKK Madde 5 — Amaç Sınırlaması)
Yalnızca kentsel nesne tespiti (kaldırım işgali, çöp, çukur, tabela, grafiti,
bakımsız cephe). Hiçbir koşulda kişi tanıma, plaka okuma, kişi/araç takibi yapılmaz.

## 5. Anonimleştirme
Her ham görüntü `Panoramax/detect_face_plate_sign` (YOLO11l) modeli ile yüz ve
plakaları geri-dönülemez şekilde bulanıklaştırıldıktan **sonra** detektöre verilir.
Log: `{ face_count, plate_count, image_sha256 }`. Ham bayt loglanmaz.

## 6. Saklama Süresi
- Ham görüntüler: **0 saniye** (istek süresince yalnızca bellek içi).
- Bulanıklaştırılmış görüntüler: yalnızca istek yaşam döngüsü boyunca (bellek içi).
- Tespit metadataları (sayım + skor): proje sonunda silinir.

## 7. Silme Taahhüdü
Etkinlik sonunda tüm görüntü, tespit ve log verileri geri dönülemez biçimde silinir:
- Render hizmetleri (Go API + Python sidecar) silinir.
- Vercel deployment'ı silinir.
- Depoya hiçbir görüntü commit edilmemiştir (`.gitignore` ile engellenir); eğer
  yanlışlıkla eklenirse `git filter-repo --invert-paths --path raw_images/` ile
  geçmişten temizlenir.
- Roboflow workspace'inde paylaşılan veri kümesine görüntü yüklenmemiştir.

## 8. İmza / Signature
Geliştirme ekibi — Haziran 2026 — Git commit SHA: (son demo tag'i `v1.0.0-demo`).
