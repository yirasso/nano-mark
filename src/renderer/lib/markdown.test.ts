// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { highlightCodeBlocks, renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders ordinary markdown', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** text.')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('tags fenced blocks with their language', () => {
    const html = renderMarkdown('```ts\nconst a = 1\n```')
    expect(html).toContain('language-ts')
  })

  it('keeps GFM tables and task lists', () => {
    expect(renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')).toContain('<table>')
    expect(renderMarkdown('- [x] done')).toContain('type="checkbox"')
  })

  it('drops script tags', () => {
    const html = renderMarkdown('<script>window.evil = 1</script>\n\ntext')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('window.evil')
  })

  it('drops inline event handlers', () => {
    const html = renderMarkdown('<img src="x" onerror="window.evil = 1">')
    expect(html).not.toContain('onerror')
  })

  it('drops javascript: links', () => {
    const html = renderMarkdown('[click](javascript:window.evil=1)')
    expect(html).not.toContain('javascript:')
  })

  it('drops iframes and inline styles', () => {
    expect(renderMarkdown('<iframe src="http://x"></iframe>')).not.toContain('<iframe')
    expect(renderMarkdown('<p style="position:fixed">x</p>')).not.toContain('style=')
  })

  it('marks links so they cannot reach back into this window', () => {
    const html = renderMarkdown('[example](https://example.com)')
    expect(html).toContain('rel="noreferrer noopener"')
    expect(html).not.toContain('target=')
  })
})

describe('highlightCodeBlocks', () => {
  const host = (markdown: string): HTMLElement => {
    const el = document.createElement('div')
    el.innerHTML = renderMarkdown(markdown)
    return el
  }

  it('colours a fence that named its language', async () => {
    const el = host('```js\nconst x = 1\n```')
    await highlightCodeBlocks(el)
    expect(el.querySelector('pre code')?.innerHTML).toContain('<span')
  })

  // GitHub leaves an untagged fence plain. Guessing paints shell output and log
  // excerpts in the colours of whichever language they happened to resemble.
  it('leaves a fence with no language alone', async () => {
    const el = host('```\nno language, no highlighting\n```')
    await highlightCodeBlocks(el)
    const code = el.querySelector('pre code')
    expect(code?.innerHTML).not.toContain('<span')
    expect(code?.hasAttribute('data-highlighted')).toBe(false)
  })
})
