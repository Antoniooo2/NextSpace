const MAX_CHUNK = 180

export const speechSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'

if (speechSupported) {
    window.speechSynthesis.getVoices()
}

export function speechLangFor(language) {
    return language === 'es' ? 'es-ES' : 'en-US'
}

export function readableText(element) {
    if (!element) return ''
    const raw = element.innerText || element.textContent || ''
    return raw
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((line) => (/[.!?:;,]$/.test(line) ? line : `${line}.`))
        .join(' ')
}

function splitLong(sentence) {
    const pieces = []
    let current = ''
    sentence.split(/\s+/).forEach((word) => {
        const next = current ? `${current} ${word}` : word
        if (next.length > MAX_CHUNK && current) {
            pieces.push(current)
            current = word
        } else {
            current = next
        }
    })
    if (current) pieces.push(current)
    return pieces
}

function chunksOf(text) {
    const sentences = text.replace(/([.!?])\s+/g, '$1\n').split('\n')
    const chunks = []
    let current = ''
    sentences
        .map((sentence) => sentence.trim())
        .filter(Boolean)
        .forEach((sentence) => {
            if (sentence.length > MAX_CHUNK) {
                if (current) chunks.push(current)
                current = ''
                chunks.push(...splitLong(sentence))
                return
            }
            const next = current ? `${current} ${sentence}` : sentence
            if (next.length > MAX_CHUNK) {
                chunks.push(current)
                current = sentence
            } else {
                current = next
            }
        })
    if (current) chunks.push(current)
    return chunks
}

function voiceFor(lang) {
    const voices = window.speechSynthesis.getVoices()
    const wanted = lang.toLowerCase()
    const base = wanted.split('-')[0]
    const normalized = (voice) => voice.lang.replace('_', '-').toLowerCase()
    return (
        voices.find((voice) => normalized(voice) === wanted) ||
        voices.find((voice) => normalized(voice).startsWith(base)) ||
        null
    )
}

export function stopSpeaking() {
    if (speechSupported) window.speechSynthesis.cancel()
}

export function speak(text, lang, onDone) {
    if (!speechSupported) return false
    const synth = window.speechSynthesis
    synth.cancel()
    const chunks = chunksOf(text)
    if (chunks.length === 0) return false

    let done = false
    const finish = () => {
        if (done) return
        done = true
        if (onDone) onDone()
    }
    const voice = voiceFor(lang)

    chunks.forEach((chunk, index) => {
        const utterance = new window.SpeechSynthesisUtterance(chunk)
        utterance.lang = lang
        if (voice) utterance.voice = voice
        if (index === chunks.length - 1) utterance.onend = finish
        utterance.onerror = finish
        synth.speak(utterance)
    })
    if (synth.paused) synth.resume()
    return true
}
