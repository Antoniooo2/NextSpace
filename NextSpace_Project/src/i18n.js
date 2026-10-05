import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import es from './locales/es.json'

export const LANGUAGE_STORAGE_KEY = 'ns-lang'
export const SUPPORTED_LANGUAGES = ['en', 'es']

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    fallbackLng: 'en',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: [],
    },
    interpolation: {
      escapeValue: false,
    },
  })

function syncDocumentLanguage(lng) {
  if (typeof document !== 'undefined' && lng) {
    document.documentElement.lang = lng.split('-')[0]
  }
}

syncDocumentLanguage(i18n.resolvedLanguage)
i18n.on('languageChanged', syncDocumentLanguage)

export function changeLanguage(lng) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng)
  } catch (error) {
    console.warn('Could not save the language preference:', error)
  }
  return i18n.changeLanguage(lng)
}

export default i18n
