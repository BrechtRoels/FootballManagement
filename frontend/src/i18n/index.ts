import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import nl from "./locales/nl.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";

export const SUPPORTED_LANGUAGES = ["en", "nl", "fr", "de"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      nl: { translation: nl },
      fr: { translation: fr },
      de: { translation: de },
    },
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    nonExplicitSupportedLngs: true, // map "nl-BE" -> "nl", "de-DE" -> "de", …
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "lang",
      caches: ["localStorage"],
    },
  });

export default i18n;
