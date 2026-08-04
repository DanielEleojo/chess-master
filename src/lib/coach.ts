// Coach voice (ticket 017, ADR 0001): an LLM phrases the fact layer as prose.
// It never computes chess — on any failure the caller keeps showing the facts.
// Daniel reacts to prose quality: the knob is this prompt, not the model.
// Routed through the Worker's /api/coach (Workers AI) rather than a direct
// browser->Ollama call — that only worked when both shared Daniel's laptop.
export const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8'

// ponytail: session-only prose cache — regeneration keeps prompt tweaks visible;
// persist into analysis.json if the wait ever annoys.
const cache = new Map<string, string>()

// Ticket 023/024: rigorous baseline, no cushioning — a "friendly" coach doesn't
// hold him accountable. 'harsh' is reserved for real blunders and repeats the
// evidence already proves (recommend.ts's weak-drill/inactive rungs, and
// analyze.ts's 'blunder' severity) — never a first-ever miss.
export type Register = 'plain' | 'harsh'

function persona(register: Register): string {
  const base =
    'You are a chess coach talking to an adult beginner rated about 800. Be rigorous, not encouraging: state the mistake and the fix plainly, no cushioning, no exclamation points.'
  return register === 'harsh'
    ? base + ' This one is bad enough to say so plainly — call it what it is, still no insults.'
    : base
}

export async function coachSay(
  key: string,
  context: string,
  facts: string[],
  register: Register = 'plain',
): Promise<string | null> {
  return generate(
    key,
    `${persona(register)}
${context}
Verified facts (computed by the engine — the only truth you may use):
${facts.map((f) => '- ' + f).join('\n')}
In 2-3 short sentences, explain why his move fails and why the better move works. Use only these facts — never invent moves, squares or tactics. No lists, no headers, plain words.`,
  )
}

// "Coach says" card (018): phrase the recommender's pick against the milestone.
export async function coachPitch(
  key: string,
  milestoneLine: string,
  pick: { title: string; evidence: string[] },
  register: Register = 'plain',
): Promise<string | null> {
  return generate(
    key,
    `${persona(register)}
${milestoneLine}
The training plan (already decided by the trainer, not by you): ${pick.title}.
Evidence from his own games and drills:
${pick.evidence.map((f) => '- ' + f).join('\n')}
In 2 short sentences, tell him this is what to work on right now and how it is costing him points toward that next milestone. Use only these facts — never invent games, moves or numbers. Plain words, no lists.`,
  )
}

async function generate(key: string, prompt: string): Promise<string | null> {
  const hit = cache.get(key)
  if (hit) return hit
  try {
    const r = await fetch('/api/coach', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ prompt }),
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
    return (await fetch('/api/coach', { signal: AbortSignal.timeout(3000) })).ok
  } catch {
    return false
  }
}
