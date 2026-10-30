export type VoiceOption = { uri: string; name: string; lang: string }

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function listVoices(): VoiceOption[] {
  if (!speechSupported()) return []
  const voices = window.speechSynthesis.getVoices()
  return voices
    .map((voice) => ({ uri: voice.voiceURI, name: voice.name, lang: voice.lang }))
    .sort((a, b) => {
      const aLocal = a.lang.startsWith('en') ? 0 : 1
      const bLocal = b.lang.startsWith('en') ? 0 : 1
      if (aLocal !== bLocal) return aLocal - bLocal
      return a.name.localeCompare(b.name)
    })
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel()
}

/**
 * Speaks `text` and resolves when it finishes. Resolves `false` when nothing was
 * actually spoken (no speech support, empty text, or the utterance failed), so
 * callers that pace themselves off speech can fall back to a timer.
 */
export function speak(
  text: string,
  options: { rate?: number; voiceURI?: string } = {},
): Promise<boolean> {
  if (!speechSupported() || !text.trim()) return Promise.resolve(false)
  const synth = window.speechSynthesis

  return new Promise((resolve) => {
    // Chrome can drop an utterance queued in the same tick as cancel().
    synth.cancel()
    window.setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = options.rate ?? 1
      utterance.pitch = 1
      const voice = synth
        .getVoices()
        .find((candidate) => candidate.voiceURI === options.voiceURI)
      if (voice) utterance.voice = voice
      utterance.onend = () => resolve(true)
      utterance.onerror = () => resolve(false)
      synth.speak(utterance)
    }, 60)
  })
}
