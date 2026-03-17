import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/es.json';
import en from './locales/en.json';

const savedLanguage = localStorage.getItem('language') as 'es' | 'en' | null;
const defaultLng = savedLanguage && (savedLanguage === 'es' || savedLanguage === 'en') ? savedLanguage : 'es';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    lng: defaultLng,
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
