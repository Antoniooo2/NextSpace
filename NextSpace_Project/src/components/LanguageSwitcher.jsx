import { useTranslation } from 'react-i18next'
import { changeLanguage, SUPPORTED_LANGUAGES } from '../i18n'

export default function LanguageSwitcher() {
    const { t, i18n } = useTranslation()
    const current = i18n.resolvedLanguage

    return (
        <div className="ns-lang-switch" role="group" aria-label={t('navbar.languageLabel')}>
            {SUPPORTED_LANGUAGES.map((lng) => (
                <button
                    key={lng}
                    type="button"
                    className={`ns-lang-btn${current === lng ? ' is-active' : ''}`}
                    aria-pressed={current === lng}
                    title={t(`navbar.switchTo.${lng}`)}
                    onClick={() => changeLanguage(lng)}
                >
                    {lng.toUpperCase()}
                </button>
            ))}
        </div>
    )
}
