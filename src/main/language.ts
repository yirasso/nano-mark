/**
 * Which language a note is written in, decided from the note itself.
 *
 * Chromium's spellchecker does not detect anything: it checks against whatever
 * dictionaries you enable, and enabling the wrong one underlines every second
 * word. So the language has to be worked out here, from the text, before the
 * session is told what to load.
 *
 * The method is function words. Every language spends a large share of its text
 * on a small closed set of them — `the`, `of`, `and` in English, `de`, `que`,
 * `não` in Portuguese — and that share is stable enough to identify the language
 * from a paragraph. It is deliberately conservative: a guess that is not clearly
 * ahead of the runner-up returns null, because keeping the previous dictionary
 * is far better than switching to a wrong one.
 */

/**
 * The ~35 commonest function words of each language. Only closed-class words —
 * articles, pronouns, prepositions, conjunctions, auxiliaries — because those
 * are the ones whose frequency does not move with the subject of the note.
 */
const STOPWORDS: Record<string, string[]> = {
  en: `the of and to a in is it you that he was for on are with as his they be at
    one have this from or had by not but what all were we when your can there
    been has more if no out so said what`.split(/\s+/),
  pt: `de que e o a do da em um para com não uma os no se na por mais as dos como
    mas ao ele das à seu sua ou quando muito nos já eu também só pelo pela até
    isso ela entre era depois sem mesmo aos você são está`.split(/\s+/),
  es: `de la que el en y a los del se las por un para con no una su al lo como
    más pero sus le ya o este sí porque esta entre cuando muy sin sobre también
    hasta hay donde quien desde todo`.split(/\s+/),
  fr: `de la le et les des en un une du dans est que pour qui sur pas au ce il
    par plus ne se sont avec ou son mais nous comme leur été elle aux cette
    aussi tout être`.split(/\s+/),
  de: `der die und in den von zu das mit sich des auf für ist im dem nicht ein
    eine als auch es an werden aus er hat dass sie nach wird bei einer um sind
    noch wie einem`.split(/\s+/),
  it: `di che e il la per un in una non sono con si da mi ma ho lo ha le ti se
    come più cosa io questo qui hai sei della dei nel al alla`.split(/\s+/),
  nl: `de en van het een is in dat je niet op te met voor zijn er maar die aan
    ook als dan om nog naar bij uit ze door wat heb kan of dit deze` .split(/\s+/),
  sv: `och det att i en jag hon som han på den med var sig för så till av men om
    han har inte den de var vi han ett har eller när där`.split(/\s+/),
  da: `og i jeg det at en den til er som på de med han af for ikke der var mig
    men et har om vi min havde ham hun nu over da`.split(/\s+/),
  nb: `og i jeg det at en et den til er som på de med han av ikke der så var meg
    men ett har om vi min hadde ham hun nå over da`.split(/\s+/),
  fi: `ja on ei se että hän oli kun niin mutta joka tai kuin myös ovat siitä
    olla vain nyt jos vielä sitä hänen mitä kaikki tämä koska sekä ollut noin
    yli osa`.split(/\s+/),
  pl: `w i na nie z do się że jest to o jak ale po dla od tak co za tym już czy
    ten może być gdy przez ich lub bardzo tego jego jeszcze która`.split(/\s+/),
  cs: `a v se na že je o s do to ale za by si který jsem jako po ještě nebo bylo
    když už tak jen před tím mezi ve při této jsou`.split(/\s+/),
  ro: `de la și în a că cu nu o pe un se este pentru din mai care sa au ca dar
    sunt le al fost si său către între după fara doar`.split(/\s+/),
  hu: `a az és hogy nem is de van egy meg ha csak már el volt ezt kell mint még
    vagy ki nagyon itt lehet ez mert amit sem így vagyok fel`.split(/\s+/),
  tr: `bir bu ve ile için de da ne çok o daha en var ama mi olarak gibi kadar
    sonra her şey olan biz siz ben onu kendi ise diye böyle`.split(/\s+/),
  ru: `и в не на я что он с как а то все она так его но да ты к у же вы за бы по
    только ее мне было вот от меня`.split(/\s+/),
  uk: `і в не на я що він з як а то все вона так його але да ти до у же ви за б
    по тільки її мені було ось від мене`.split(/\s+/),
  el: `και το του της των να με για από στο είναι που ή δεν σε στη την ο η τα
    αυτό όταν κάθε αλλά ως πως γιατί μια ένα οι πολύ`.split(/\s+/)
}

/**
 * Letters that only a few of the candidates use. A weak signal on its own — one
 * `ñ` proves little — but it separates the pairs the function words leave close,
 * Portuguese from Spanish above all.
 */
const MARKERS: Record<string, RegExp> = {
  pt: /[ãõ]|ç[aãoõu]/,
  es: /[ñ]|¿|¡/,
  fr: /[œæ]|[éèêë]|'[a-z]/,
  de: /[ß]|[äöü]/,
  it: /[àèéìòù]/,
  sv: /[åäö]/,
  da: /[øå]/,
  nb: /[øå]/,
  fi: /[äö]/,
  pl: /[łżźćńśąę]/,
  cs: /[řůěščžýáíé]/,
  ro: /[șțăî]/,
  hu: /[őűáéíóöü]/,
  tr: /[ığşİ]/,
  el: /[Ͱ-Ͽ]/,
  ru: /[ыъэё]/,
  uk: /[їієґ]/
}

const CYRILLIC = /[Ѐ-ӿ]/
const GREEK = /[Ͱ-Ͽ]/
const WORD = /[\p{L}][\p{L}'’-]*/gu

/** Languages written in a script of their own, so the script alone shortlists them. */
const BY_SCRIPT: Record<string, string[]> = {
  cyrillic: ['ru', 'uk'],
  greek: ['el']
}
const LATIN = Object.keys(STOPWORDS).filter(
  (code) => !BY_SCRIPT.cyrillic.includes(code) && !BY_SCRIPT.greek.includes(code)
)

/** Under this, a note is a fragment and any guess would be noise. */
const MIN_WORDS = 12
/** The winner must account for this share of the words, or it is not a winner. */
const MIN_SCORE = 0.08
/** And it must be this far ahead of the runner-up, or the two are too close to call. */
const MIN_MARGIN = 1.25

const SETS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(STOPWORDS).map(([code, words]) => [code, new Set(words)])
)

/**
 * Strips everything in a markdown file that is not prose. Fenced blocks, inline
 * code, link targets and HTML are usually English-shaped regardless of what the
 * note is written in, and a note that is half shell commands would otherwise be
 * read as English.
 */
export function proseOf(markdown: string): string {
  return markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, ' ') // YAML front matter
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    // Indented code is deliberately left in. Stripping every line that starts
    // with four spaces would also strip the continuation of any nested list,
    // and losing real prose costs the guess more than a few lines of code do.
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/<[^>\n]+>/g, ' ')
    .replace(/\]\([^)\s]*\)/g, '] ') // keep the link text, drop the target
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, ' ')
    .replace(/\S+@\S+\.\S+/g, ' ')
}

/**
 * The language of a note, or null when the text does not say clearly enough.
 * Null is a real answer and callers should treat it as "leave the dictionary
 * alone", not as an error.
 */
export function detectLanguage(markdown: string): string | null {
  const prose = proseOf(markdown).toLowerCase()
  const words = prose.match(WORD)
  if (!words || words.length < MIN_WORDS) return null

  const cyrillic = countMatching(words, CYRILLIC)
  const greek = countMatching(words, GREEK)
  const threshold = words.length * 0.2
  const candidates =
    cyrillic > threshold ? BY_SCRIPT.cyrillic : greek > threshold ? BY_SCRIPT.greek : LATIN

  const scores = candidates
    .map((code) => ({ code, score: score(code, words) }))
    .sort((a, b) => b.score - a.score)

  const [best, next] = scores
  if (!best || best.score < MIN_SCORE) return null
  if (next && next.score > 0 && best.score < next.score * MIN_MARGIN) return null
  return best.code
}

function score(code: string, words: string[]): number {
  const set = SETS[code]
  const marker = MARKERS[code]
  let hits = 0
  let marks = 0
  for (const word of words) {
    if (set.has(word)) hits += 1
    else if (marker && marker.test(word)) marks += 1
  }
  // Markers are corroboration, not evidence: half the weight of a function word.
  return (hits + marks * 0.5) / words.length
}

function countMatching(words: string[], pattern: RegExp): number {
  let count = 0
  for (const word of words) if (pattern.test(word)) count += 1
  return count
}

/**
 * Turns a detected language into a code Chromium will actually accept. Passing
 * one it does not have is an error, not a warning, so nothing reaches the
 * session without coming out of `available` first.
 *
 * Regional variants are picked by what the machine is set to: a `pt` note on a
 * pt-BR system gets pt-BR. Failing that, the listed preference decides, so `en`
 * does not silently become en-AU because it sorted first.
 */
const PREFERRED_VARIANTS: Record<string, string[]> = {
  en: ['en-US', 'en-GB'],
  pt: ['pt-PT', 'pt-BR'],
  es: ['es', 'es-419'],
  de: ['de', 'de-DE']
}

export function resolveSpellcheckerLanguage(
  detected: string | null,
  available: string[],
  locale: string
): string | null {
  if (!detected) return null
  const lower = available.map((code) => code.toLowerCase())
  const pick = (code: string): string | null => {
    const index = lower.indexOf(code.toLowerCase())
    return index === -1 ? null : available[index]
  }

  // A code that already names a region is taken as given.
  if (detected.includes('-')) return pick(detected)

  // The machine's own region wins when it is the same language, so European
  // Portuguese does not get corrected against Brazilian spellings.
  if (baseLanguage(locale) === detected) {
    const regional = pick(locale)
    if (regional) return regional
  }
  // Then the neutral form of the language, which takes no side between regions.
  const neutral = pick(detected)
  if (neutral) return neutral
  // Then a stated preference, so `en` does not become en-AU by sort order.
  for (const preferred of PREFERRED_VARIANTS[detected] ?? []) {
    const match = pick(preferred)
    if (match) return match
  }
  return available.find((code) => code.toLowerCase().startsWith(`${detected}-`)) ?? null
}

/**
 * The language that rides along with whatever a note is written in.
 *
 * Chromium calls a word a mistake only when none of the enabled dictionaries
 * knows it, so a second dictionary buys the borrowed vocabulary — `deploy`,
 * `build`, `cache` — without which a Portuguese note about software is
 * underlined half the way down. English is that source for every other language
 * here.
 */
const COMPANION = 'en'

/**
 * The dictionaries to enable for a note: the language it is written in, and
 * English alongside it.
 *
 * Two, and never more. Every extra dictionary widens the set of accepted words,
 * and a typo in one language is often a real word in another — mistyping `them`
 * as `tem` stops being a mistake the moment Portuguese is enabled. Two is where
 * the borrowed vocabulary is covered and the damage stops.
 */
export function spellcheckSet(
  detected: string | null,
  available: string[],
  locale: string
): string[] {
  const primary =
    resolveSpellcheckerLanguage(detected, available, locale) ??
    resolveSpellcheckerLanguage(locale, available, locale) ??
    resolveSpellcheckerLanguage(baseLanguage(locale), available, locale)
  if (!primary) return []
  // An English note does not need English twice.
  if (baseLanguage(primary) === COMPANION) return [primary]

  const companion = resolveSpellcheckerLanguage(COMPANION, available, locale)
  return companion && companion !== primary ? [primary, companion] : [primary]
}

/** The base language of a locale: `pt-PT` is `pt`. */
export function baseLanguage(locale: string): string {
  return locale.split(/[-_]/)[0].toLowerCase()
}
