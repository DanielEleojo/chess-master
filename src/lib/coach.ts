// Coach voice (ticket 017, ADR 0001): Ollama phrases the fact layer as prose.
// It never computes chess — on any failure the caller keeps showing the facts.
// Daniel reacts to prose quality: the knob is this prompt, not the model.
const OLLAMA = 'http://localhost:11434'
export const MODEL = 'qwen2.5:7b-instruct'

// ponytail: session-only prose cache — regeneration keeps prompt tweaks visible;
// persist into analysis.json if the wait ever annoys.
const cache = new Map<string, string>()

export async function coachSay(key: string, context: string, facts: string[]): Promise<string | null> {
  const hit = cache.get(key)
  if (hit) return hit
  const prompt = `You are a friendly chess coach talking to an adult beginner rated about 800.
${context}
Verified facts (computed by the engine — the only truth you may use):
${facts.map((f) => '- ' + f).join('\n')}
In 2-3 short sentences, explain why his move fails and why the better move works. Use only these facts — never invent moves, squares or tactics. No lists, no headers, plain words.`
  try {
    const r = await fetch(OLLAMA + '/api/generate', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        keep_alive: '30m', // stay warm for the session — cold load costs ~30s
        options: { temperature: 0.6, num_predict: 160 },
      }),
    })
    if (!r.ok) return null
    const text: string = ((await r.json()).response ?? '').trim()
    if (text) cache.set(key, text)
    return text || null
  } catch {
    return null
  }
}

export async function coachUp(): Promise<boolean> {
  try {
    return (await fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(1500) })).ok
  } catch {
    return false
  }
}
