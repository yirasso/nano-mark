// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { githubMarkdownTags } from './editor-theme'
import { proselessRanges } from './editor-spellcheck'

const language = markdown({
  base: markdownLanguage,
  codeLanguages: languages,
  extensions: [githubMarkdownTags]
}).language

/** The text the spellchecker would be kept away from, in document order. */
function excluded(doc: string): string[] {
  const tree = language.parser.parse(doc)
  return proselessRanges(tree, 0, doc.length).map((span) => doc.slice(span.from, span.to))
}

/** What is left for the spellchecker to look at. */
function checked(doc: string): string {
  const tree = language.parser.parse(doc)
  let out = ''
  let at = 0
  for (const span of proselessRanges(tree, 0, doc.length)) {
    out += doc.slice(at, span.from)
    at = span.to
  }
  return out + doc.slice(at)
}

describe('proselessRanges', () => {
  it('covers a fenced block whole, fences and info string included', () => {
    const doc = 'Antes\n\n```bash\ncurl -s --data-urlencode x\n```\n\nDepois'
    expect(excluded(doc)).toEqual(['```bash\ncurl -s --data-urlencode x\n```'])
    expect(checked(doc)).toBe('Antes\n\n\n\nDepois')
  })

  it('covers inline code without taking the sentence with it', () => {
    const doc = 'Corre o `npm install` primeiro'
    expect(excluded(doc)).toEqual(['`npm install`'])
    expect(checked(doc)).toBe('Corre o  primeiro')
  })

  it('covers an indented code block', () => {
    const doc = 'Assim:\n\n    git rebase --onto main\n\nPronto'
    expect(excluded(doc).join('')).toContain('git rebase --onto main')
  })

  it('covers a link target but leaves the link text', () => {
    const doc = 'Ver a [documentação](https://exemplo.pt/guia/index.html) primeiro'
    expect(excluded(doc)).toEqual(['https://exemplo.pt/guia/index.html'])
    expect(checked(doc)).toBe('Ver a [documentação]() primeiro')
  })

  it('covers a bare autolink', () => {
    const doc = 'Está em <https://exemplo.pt/guia> se precisares'
    expect(excluded(doc).join('')).toContain('https://exemplo.pt/guia')
  })

  it('covers inline HTML', () => {
    const doc = 'Um <kbd>Ctrl</kbd> qualquer'
    expect(excluded(doc)).toEqual(['<kbd>', '</kbd>'])
    expect(checked(doc)).toBe('Um Ctrl qualquer')
  })

  it('leaves ordinary prose entirely alone', () => {
    const doc = '# Reunião\n\nFalámos sobre o novo fluxo e ficou decidido que avançamos.'
    expect(excluded(doc)).toEqual([])
    expect(checked(doc)).toBe(doc)
  })

  it('returns ranges in document order and without overlaps', () => {
    const doc = 'Ver `um`, depois <https://a.pt/b>, e\n\n```js\nconst x = 1\n```\n\ne `dois`.'
    const tree = language.parser.parse(doc)
    const spans = proselessRanges(tree, 0, doc.length)
    expect(spans.length).toBeGreaterThan(3)
    for (let i = 0; i < spans.length; i += 1) {
      expect(spans[i].to).toBeGreaterThan(spans[i].from)
      if (i > 0) expect(spans[i].from).toBeGreaterThanOrEqual(spans[i - 1].to)
    }
  })

  it('clamps to the window it was asked about', () => {
    const doc = '```\nconst x = 1\n```'
    const tree = language.parser.parse(doc)
    expect(proselessRanges(tree, 4, 9)).toEqual([{ from: 4, to: 9 }])
  })
})
