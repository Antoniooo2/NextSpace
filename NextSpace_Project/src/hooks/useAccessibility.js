import { createContext, useContext } from 'react'

export const ACCESSIBILITY_STORAGE_KEY = 'ns-a11y'

export const DEFAULT_ACCESSIBILITY = {
    readAloud: false,
    largeText: false,
    highContrast: false,
}

export const AccessibilityContext = createContext({
    settings: DEFAULT_ACCESSIBILITY,
    speechAvailable: false,
    speaking: false,
    toggle: () => {},
    stop: () => {},
})

export default function useAccessibility() {
    return useContext(AccessibilityContext)
}
