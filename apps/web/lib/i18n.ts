import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Turkish-first UI copy. No hardcoded strings in components — everything via t().
export const tr = {
  translation: {
    app: {
      title: "Kaldırım Skoru",
      tagline: "İstanbul kaldırımları için görsel kirlilik ve yürünebilirlik skoru",
    },
    search: {
      label: "Sokak veya cadde adı",
      placeholder: "örn. İstiklal Caddesi, Beyoğlu",
      button: "Skorla",
      hint: "Bir sokak adı girin; Street View görüntüleri anonimleştirilip puanlanır.",
    },
    states: {
      loading: "Görüntüler anonimleştiriliyor ve puanlanıyor…",
      emptyTitle: "Henüz bir sonuç yok",
      emptyBody: "Yukarıdan bir sokak arayın. Sonuç haritada ve skor kartında görünecek.",
      errorTitle: "Bir şeyler ters gitti",
      retry: "Tekrar dene",
    },
    score: {
      title: "Kaldırım Skoru",
      grade: "Not",
      pollution: "Kirlilik (ham)",
      points: "Örnek nokta",
      classes: "Tespit edilen sınıflar",
      noDetections: "Bu konumda tespit bulunamadı.",
      panoDate: "Görüntü tarihi",
      limitations: "Sınırlamalar",
    },
    report: {
      pdf: "Şikayet Dosyası İndir (PDF)",
      csv: "CSV indir",
      generating: "Hazırlanıyor…",
      heading: "Kaldırım Skoru — Şikayet Dosyası",
      addressedTo: "İlgili Belediye Başkanlığına",
      formula: "Skor Formülü",
      generatedAt: "Oluşturulma",
    },
    map: {
      legend: "Kirlilik yoğunluğu",
      low: "Düşük",
      high: "Yüksek",
    },
    kvkk: {
      note: "Görüntülerdeki yüz ve plakalar, herhangi bir analiz öncesinde geri dönülemez biçimde bulanıklaştırılır. Ham görüntü saklanmaz.",
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
