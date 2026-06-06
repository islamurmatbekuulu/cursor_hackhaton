import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Turkish-first municipality console copy. No hardcoded strings in components — everything via t().
export const tr = {
  translation: {
    app: {
      title: "Kaldırım Skoru — Belediye Konsolu",
      badge: "Belediye Konsolu",
      tagline: "Vatandaşların mobil uygulamadan gönderdiği kaldırım fotoğraflarını inceleyin ve sokak bazında skorları takip edin.",
    },
    console: {
      reportsHeading: "Vatandaş Bildirimleri",
      demoBadge: "Demo modu: örnek İstanbul bildirimleri gösteriliyor. Canlı API için NEXT_PUBLIC_USE_DEMO_DATA=false ayarlayın.",
    },
    filter: {
      label: "Sokak veya cadde",
      placeholder: "örn. İstiklal Caddesi, Beyoğlu",
      allStreets: "Tüm sokaklar",
      clear: "Temizle",
      streetAverage: "Sokak ortalama skoru",
      reportCount: "Bildirim sayısı",
      hintPlaces: "Google Places önerilerinden bir sokak seçin veya ad yazıp Enter'a basın.",
      hintDropdown: "Places kullanılamıyor — demo sokak listesinden seçin.",
    },
    list: {
      heading: "Bildirim listesi",
      emptyTitle: "Bu sokak için bildirim yok",
      emptyBody: "Farklı bir sokak seçin veya filtreyi temizleyin.",
    },
    detail: {
      title: "Bildirim Detayı",
      close: "Kapat",
      score: "Skor",
      pollution: "Kirlilik (ham)",
      date: "Gönderim tarihi",
      coords: "Koordinatlar",
      classes: "Kirlilik dağılımı",
      noDetections: "Bu bildirimde tespit bulunamadı.",
      limitations: "Sınırlamalar",
      photoAlt: "Bulanıklaştırılmış vatandaş fotoğrafı",
      photoBadge: "Bulanıklaştırılmış",
      photoCaption: "Vatandaş fotoğrafı — analiz öncesi anonimleştirilmiş kopya",
    },
    map: {
      legendGrades: "Not renkleri",
      aggregateHint: "Büyük daireler: sokak ortalama skoru (tüm sokaklar görünümünde).",
      unavailable: "Harita yüklenemedi",
      unavailableKey:
        "Google Maps tarayıcı anahtarı tanımlı değil. Bildirim listesi yine de çalışır; harita için anahtar ekleyin.",
      unavailableAuth:
        "Google Maps anahtarı reddedildi. Anahtarın Maps JavaScript API + Places API için yetkili ve alan adının (referrer) izinli olduğundan emin olun.",
    },
    kvkk: {
      note: "Vatandaş fotoğrafları analizden önce yüz ve plaka için bulanıklaştırılır; belediye incelemesi için yalnızca bulanık kopya saklanır, ham görüntü asla depolanmaz. Street View kullanılmaz.",
    },
  },
};

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { tr },
    lng: "tr",
    fallbackLng: "tr",
    interpolation: { escapeValue: false },
  });
}

export default i18n;
