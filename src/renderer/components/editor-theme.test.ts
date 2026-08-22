// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { highlightTree } from '@lezer/highlight'
import { githubHighlight, githubMarkdownTags } from './editor-theme'

/**
 * These expectations are measurements taken off github.com, not preferences.
 * If one fails, either the mapping drifted or GitHub changed — check before
 * "fixing" the number.
 */
const language = markdown({
  base: markdownLanguage,
  codeLanguages: languages,
  extensions: [githubMarkdownTags]
}).language

const rules = githubHighlight.module?.getRules().split('\n') ?? []

/** The colour a span ends up with: last matching rule wins, as in the browser. */
function effectiveColor(classes: string): string | null {
  const names = new Set(classes.split(' ').filter(Boolean))
  let color: string | null = null
  for (const rule of rules) {
    const match = /^\.(\S+)\s*\{(.*)\}\s*$/.exec(rule.trim())
    if (!match || !names.has(match[1])) continue
    const declared = /(?:^|;)\s*color:\s*([^;]+)/.exec(match[2])
    if (declared) color = declared[1].trim()
  }
  return color
}

function effectiveWeight(classes: string): string | null {
  const names = new Set(classes.split(' ').filter(Boolean))
  let weight: string | null = null
  for (const rule of rules) {
    const match = /^\.(\S+)\s*\{(.*)\}\s*$/.exec(rule.trim())
    if (!match || !names.has(match[1])) continue
    const declared = /font-weight:\s*([^;]+)/.exec(match[2])
    if (declared) weight = declared[1].trim()
  }
  return weight
}

interface Span {
  text: string
  color: string | null
  weight: string | null
}

function highlight(doc: string): Span[] {
  const spans: Span[] = []
  highlightTree(language.parser.parse(doc), githubHighlight, (from, to, classes) => {
    spans.push({
      text: doc.slice(from, to),
      color: effectiveColor(classes),
      weight: effectiveWeight(classes)
    })
  })
  return spans
}

const find = (spans: Span[], text: string): Span | undefined =>
  spans.find((span) => span.text === text)

describe('the highlight style produces rules at all', () => {
  it('has a stylesheet to reason about', () => {
    expect(rules.length).toBeGreaterThan(5)
  })
})

describe('markdown marks, split apart from processingInstruction', () => {
  it('colours a heading and its hash the same', () => {
    const spans = highlight('## Commands\n')
    expect(find(spans, '##')?.color).toBe('var(--gh-markup-heading)')
    expect(find(spans, '##')?.weight).toBe('700')
    expect(find(spans, ' Commands')?.color).toBe('var(--gh-markup-heading)')
    expect(find(spans, ' Commands')?.weight).toBe('700')
  })

  it('does not enlarge headings the way the rendered view does', () => {
    const sizes = rules
      .filter((rule) => rule.includes('font-size'))
      .map((rule) => /font-size:\s*([^;}]+)/.exec(rule)?.[1].trim())
    expect(sizes.every((size) => size === '1em')).toBe(true)
  })

  it('colours a list dash as a variable, not as punctuation', () => {
    const spans = highlight('- one\n- two\n')
    expect(find(spans, '-')?.color).toBe('var(--gh-variable)')
  })

  it('colours emphasis markers as strings and leaves the text alone', () => {
    const spans = highlight('a **no semicolons** b\n')
    expect(find(spans, '**')?.color).toBe('var(--gh-string)')
    // GitHub does not embolden bold source text; only the markers are coloured.
    expect(find(spans, 'no semicolons')?.color).toBe('var(--gh-fg-default)')
    expect(find(spans, 'no semicolons')?.weight).toBe('400')
  })

  it('leaves italic source text upright', () => {
    const spans = highlight('a *multiple* b\n')
    expect(find(spans, '*')?.color).toBe('var(--gh-string)')
    expect(find(spans, 'multiple')?.color).toBe('var(--gh-fg-default)')
  })

  it('colours inline code content as a constant, inside string backticks', () => {
    const spans = highlight('run `vue-tsc` first\n')
    expect(find(spans, '`')?.color).toBe('var(--gh-string)')
    expect(find(spans, 'vue-tsc')?.color).toBe('var(--gh-constant)')
  })

  it('colours link brackets as strings and underlines the url', () => {
    const spans = highlight('see [docs](docs/measurements.md) now\n')
    expect(find(spans, '[')?.color).toBe('var(--gh-string)')
    expect(find(spans, ']')?.color).toBe('var(--gh-string)')
    expect(find(spans, 'docs')?.color).toBe('var(--gh-fg-default)')
    expect(find(spans, 'docs/measurements.md')?.color).toBe('var(--gh-string)')
  })

  it('shows a fence language the way it shows a heading', () => {
    const spans = highlight('```bash\npnpm dev\n```\n')
    expect(find(spans, '```')?.color).toBe('var(--gh-string)')
    expect(find(spans, 'bash')?.color).toBe('var(--gh-markup-heading)')
    expect(find(spans, 'bash')?.weight).toBe('700')
  })
})

describe('languages embedded in fenced blocks', () => {
  it('colours a comment inside a bash fence', async () => {
    // Nested languages load on demand, so give the parser the loaded dialect.
    const desc = languages.find((entry) => entry.alias.includes('bash'))
    expect(desc).toBeDefined()
    await desc?.load()

    const spans = highlight('```bash\n# build it\npnpm build\n```\n')
    const comment = spans.find((span) => span.text.includes('# build it'))
    expect(comment?.color).toBe('var(--gh-comment)')
  })
})

describe('constructs that carry no token of their own on GitHub', () => {
  it('paints a blockquote, marker and text alike, as an entity tag', () => {
    const spans = highlight('> The markers fade.\n')
    expect(find(spans, '>')?.color).toBe('var(--gh-entity-tag)')
    expect(find(spans, ' The markers fade.')?.color).toBe('var(--gh-entity-tag)')
  })

  it('leaves a table in the default colour instead of treating the header as a heading', () => {
    const spans = highlight('| Column | Meaning |\n| --- | --- |\n| a | b |\n')
    const coloured = spans.filter((span) => span.color && span.color !== 'var(--gh-fg-default)')
    expect(coloured).toEqual([])
  })
})
