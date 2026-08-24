import { describe, expect, it } from 'vitest'
import {
  baseLanguage,
  detectLanguage,
  proseOf,
  resolveSpellcheckerLanguage,
  spellcheckSet
} from './language'

const SAMPLES: Record<string, string> = {
  pt: `Este documento explica como funciona o corretor ortográfico da aplicação.
    Quando abres um ficheiro, o texto é lido e a língua em que está escrito é
    detetada a partir das palavras mais comuns. Se não houver texto suficiente,
    a aplicação não muda nada e mantém o dicionário que já estava a ser usado.`,
  en: `This document explains how the spell checker in the application works.
    When you open a file, the text is read and the language it was written in is
    detected from the most common words. If there is not enough text, the
    application changes nothing and keeps the dictionary it was already using.`,
  es: `Este documento explica cómo funciona el corrector ortográfico de la
    aplicación. Cuando abres un archivo, el texto se lee y el idioma en el que
    está escrito se detecta a partir de las palabras más comunes. Si no hay
    suficiente texto, la aplicación no cambia nada y mantiene el diccionario.`,
  fr: `Ce document explique comment fonctionne le correcteur orthographique de
    l'application. Quand vous ouvrez un fichier, le texte est lu et la langue
    dans laquelle il est écrit est détectée à partir des mots les plus courants.
    S'il n'y a pas assez de texte, l'application ne change rien du tout.`,
  de: `Dieses Dokument erklärt, wie die Rechtschreibprüfung in der Anwendung
    funktioniert. Wenn Sie eine Datei öffnen, wird der Text gelesen und die
    Sprache, in der er geschrieben ist, aus den häufigsten Wörtern erkannt. Wenn
    es nicht genug Text gibt, ändert die Anwendung nichts an dem Wörterbuch.`,
  it: `Questo documento spiega come funziona il correttore ortografico
    dell'applicazione. Quando apri un file, il testo viene letto e la lingua in
    cui è scritto viene rilevata dalle parole più comuni. Se non c'è abbastanza
    testo, l'applicazione non cambia nulla e mantiene il dizionario di prima.`,
  nl: `Dit document legt uit hoe de spellingcontrole in de applicatie werkt. Als
    je een bestand opent, wordt de tekst gelezen en wordt de taal waarin het is
    geschreven afgeleid uit de meest voorkomende woorden. Als er niet genoeg
    tekst is, verandert de applicatie niets aan het woordenboek dat er al was.`,
  ru: `Этот документ объясняет, как работает проверка орфографии в приложении.
    Когда вы открываете файл, текст читается, и язык, на котором он написан,
    определяется по самым частым словам. Если текста не хватает, приложение
    ничего не меняет и оставляет тот словарь, который уже был выбран.`
}

describe('detectLanguage', () => {
  for (const [code, text] of Object.entries(SAMPLES)) {
    it(`reads a paragraph of ${code}`, () => {
      expect(detectLanguage(text)).toBe(code)
    })
  }

  it('says nothing about a fragment', () => {
    expect(detectLanguage('Todo')).toBeNull()
    expect(detectLanguage('# Notes\n\n- one\n- two\n')).toBeNull()
  })

  it('says nothing about an empty file', () => {
    expect(detectLanguage('')).toBeNull()
  })

  // The whole point of the guard: a wrong dictionary underlines every word, so
  // an unclear file has to leave the current one alone.
  it('says nothing when the text is only symbols and numbers', () => {
    expect(detectLanguage('| 1 | 2 | 3 |\n| --- | --- | --- |\n| 4 | 5 | 6 |')).toBeNull()
  })

  it('ignores fenced code, which is English-shaped in every language', () => {
    const note = `${SAMPLES.pt}

\`\`\`bash
curl -s -G 'https://example.com/api/form' \\
  --data-urlencode 'hash=<form hash>' \\
  --data-urlencode 'version=3' | jq
\`\`\`

\`\`\`sql
select id, name from the_users where active and created_at is not null
\`\`\`
`
    expect(detectLanguage(note)).toBe('pt')
  })

  it('ignores link targets but keeps the words around them', () => {
    const note = `${SAMPLES.pt}\n\n[a documentação](https://the.example.com/getting-started/index.html)`
    expect(detectLanguage(note)).toBe('pt')
  })

  it('ignores YAML front matter', () => {
    const note = `---\ntitle: The Complete Guide\ntags: [the, and, of, with]\n---\n\n${SAMPLES.pt}`
    expect(detectLanguage(note)).toBe('pt')
  })

  it('separates Portuguese from Spanish', () => {
    expect(detectLanguage(SAMPLES.pt)).not.toBe('es')
    expect(detectLanguage(SAMPLES.es)).not.toBe('pt')
  })

  // Notes are short and full of borrowed English, which is the case that has to
  // work rather than the tidy paragraph above.
  it('reads a note of a couple of sentences', () => {
    expect(
      detectLanguage(
        'Reunião de terça. Falámos sobre o novo fluxo de pagamentos e ficou decidido que o Gui trata da parte do backend.'
      )
    ).toBe('pt')
    expect(
      detectLanguage(
        'Tuesday standup. We talked about the new payment flow and agreed that Gui takes the backend side of it.'
      )
    ).toBe('en')
  })

  it('reads a bullet list', () => {
    expect(
      detectLanguage(`- corrigir o redireccionamento do login
- perguntar à equipa de design sobre o estado vazio
- escrever o que ficou decidido na reunião de quinta
- verificar se os tokens antigos ainda são válidos`)
    ).toBe('pt')
  })

  it('is not thrown by English jargon inside another language', () => {
    expect(
      detectLanguage(
        'O deploy falhou outra vez. O build passa em local mas no CI o step de lint rebenta por causa do cache. Vou limpar o cache e tentar de novo amanhã.'
      )
    ).toBe('pt')
  })

  it('says nothing about a file that is only commands', () => {
    expect(
      detectLanguage(
        `curl -s -X POST 'https://x.com/api' -H 'Content-Type: application/json' -d '{"hash":"abc"}' | jq '.forms[]'`
      )
    ).toBeNull()
  })

  it('says nothing about a file that is only headings', () => {
    expect(detectLanguage('# Project\n## Notes\n### Later')).toBeNull()
  })
})

describe('proseOf', () => {
  it('drops fenced blocks whole', () => {
    expect(proseOf('before\n```\nthe code\n```\nafter')).not.toContain('the code')
  })

  it('drops inline code but not the sentence holding it', () => {
    const out = proseOf('run `npm install` to begin')
    expect(out).not.toContain('npm install')
    expect(out).toContain('to begin')
  })

  it('drops bare URLs', () => {
    expect(proseOf('see https://example.com/a/b for more')).not.toContain('example.com')
  })
})

describe('resolveSpellcheckerLanguage', () => {
  const available = ['en-US', 'en-GB', 'en-AU', 'pt-BR', 'pt-PT', 'es', 'de', 'fr']

  it('passes an exact code through', () => {
    expect(resolveSpellcheckerLanguage('es', available, 'en-US')).toBe('es')
  })

  it('prefers the machine region when the language matches', () => {
    expect(resolveSpellcheckerLanguage('pt', available, 'pt-BR')).toBe('pt-BR')
    expect(resolveSpellcheckerLanguage('en', available, 'en-GB')).toBe('en-GB')
  })

  it('falls back to a stated preference rather than whatever sorted first', () => {
    expect(resolveSpellcheckerLanguage('en', available, 'pt-PT')).toBe('en-US')
    expect(resolveSpellcheckerLanguage('pt', available, 'en-US')).toBe('pt-PT')
  })

  // Chromium lists a neutral `pt` next to `pt-BR` and `pt-PT`. Taking the
  // neutral one would correct European Portuguese against Brazilian spellings,
  // so the machine region is consulted before it.
  it('prefers the machine region over the neutral form of a language', () => {
    const withNeutral = ['en', 'en-US', 'pt', 'pt-BR', 'pt-PT']
    expect(resolveSpellcheckerLanguage('pt', withNeutral, 'pt-PT')).toBe('pt-PT')
    expect(resolveSpellcheckerLanguage('pt', withNeutral, 'pt-BR')).toBe('pt-BR')
  })

  it('falls back to the neutral form when the machine is another language', () => {
    const withNeutral = ['en', 'en-US', 'pt', 'pt-BR', 'pt-PT']
    expect(resolveSpellcheckerLanguage('pt', withNeutral, 'en-US')).toBe('pt')
  })

  it('takes a code that already names a region as given', () => {
    expect(resolveSpellcheckerLanguage('pt-BR', available, 'pt-PT')).toBe('pt-BR')
  })

  // Chromium errors on a code it does not have, so nothing unlisted may escape.
  it('returns null for a language Chromium does not carry', () => {
    expect(resolveSpellcheckerLanguage('el', available, 'en-US')).toBeNull()
    expect(resolveSpellcheckerLanguage(null, available, 'en-US')).toBeNull()
  })
})

describe('baseLanguage', () => {
  it('takes the language off a locale', () => {
    expect(baseLanguage('pt-PT')).toBe('pt')
    expect(baseLanguage('en_US')).toBe('en')
    expect(baseLanguage('es')).toBe('es')
  })
})

describe('spellcheckSet', () => {
  const available = ['en-US', 'en-GB', 'pt-BR', 'pt-PT', 'es', 'de', 'fr', 'el']

  // The whole point: one file, two dictionaries, a word passes if either knows
  // it. `bacalhau` from Portuguese, `deploy` from English, in the same note.
  it('pairs the detected language with English', () => {
    expect(spellcheckSet('pt', available, 'pt-PT')).toEqual(['pt-PT', 'en-US'])
    expect(spellcheckSet('fr', available, 'pt-PT')).toEqual(['fr', 'en-US'])
  })

  it('does not enable English twice for an English note', () => {
    expect(spellcheckSet('en', available, 'en-GB')).toEqual(['en-GB'])
    expect(spellcheckSet('en', available, 'pt-PT')).toEqual(['en-US'])
  })

  it('falls back to the machine language when the note does not say', () => {
    expect(spellcheckSet(null, available, 'pt-BR')).toEqual(['pt-BR', 'en-US'])
    expect(spellcheckSet(null, available, 'en-GB')).toEqual(['en-GB'])
  })

  it('follows the machine region for the detected language', () => {
    expect(spellcheckSet('pt', available, 'pt-BR')).toEqual(['pt-BR', 'en-US'])
  })

  // Two is the cap. Every extra dictionary is a wider set of accepted words.
  it('never enables more than two', () => {
    for (const code of ['pt', 'fr', 'de', 'es', 'el', null]) {
      expect(spellcheckSet(code, available, 'pt-PT').length).toBeLessThanOrEqual(2)
    }
  })

  it('drops a language Chromium does not carry, keeping English', () => {
    expect(spellcheckSet('uk', available, 'en-US')).toEqual(['en-US'])
  })

  it('returns nothing when there is no dictionary at all', () => {
    expect(spellcheckSet('pt', [], 'pt-PT')).toEqual([])
  })
})
