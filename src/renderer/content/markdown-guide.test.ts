// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import GUIDE from './markdown-guide.md?raw'
import { renderMarkdown } from '../lib/markdown'

/**
 * The guide is a teaching document, so what matters is that every construct it
 * claims to demonstrate actually survives the renderer. A silent regression here
 * would show the reader markup that does not do what the page says it does.
 */
const html = renderMarkdown(GUIDE)

describe('the built-in markdown guide', () => {
  it('is shipped whole', () => {
    expect(GUIDE.length).toBeGreaterThan(1500)
    expect(GUIDE.startsWith('# ')).toBe(true)
  })

  const produces: [string, RegExp][] = [
    ['headings', /<h2[^>]*>/],
    ['bold', /<strong>/],
    ['italic', /<em>/],
    ['strikethrough', /<del>/],
    ['bullet lists', /<ul>/],
    ['ordered lists', /<ol>/],
    ['task list checkboxes', /<input[^>]+type="checkbox"/],
    ['inline code', /<code>/],
    ['highlightable code blocks', /<pre><code class="language-js"/],
    ['blockquotes', /<blockquote>/],
    ['tables', /<table>/],
    ['links', /<a href="https:\/\/example\.com"/],
    ['horizontal rules', /<hr\s*\/?>/],
    ['raw HTML passthrough', /<kbd>/]
  ]

  for (const [what, pattern] of produces) {
    it(`renders ${what}`, () => {
      expect(html).toMatch(pattern)
    })
  }

  // The examples are fenced with four backticks so they can contain three.
  // Getting that wrong turns the whole rest of the file into one code block.
  it('keeps the syntax examples as code rather than swallowing the page', () => {
    expect(GUIDE).toContain('````')
    const trailing = html.slice(html.indexOf('<table>'))
    expect(trailing).toMatch(/<h2[^>]*>/)
  })

  it('never resolves an image against the worktree', () => {
    // A relative sample path is fine as text; a real one would 404 in preview.
    expect(html).not.toMatch(/<img[^>]+src="(?!\.\/images\/)/)
  })
})
