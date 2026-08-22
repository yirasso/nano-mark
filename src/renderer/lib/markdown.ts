import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: false })

// Anything that leaves the sanitizer as a link gets pushed through the main
// process instead of navigating this window.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node instanceof Element && node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('rel', 'noreferrer noopener')
    node.removeAttribute('target')
  }
})

export function renderMarkdown(source: string): string {
  const raw = marked.parse(source, { async: false })
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    // `input` stays allowed so GFM task lists keep their checkboxes.
    FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style']
  })
}

let hljsPromise: Promise<typeof import('highlight.js/lib/common').default> | null = null

/**
 * Loaded on the first preview only, so a session that never leaves the editor
 * never pays for it. `lib/common` covers the ~35 languages people actually fence.
 */
export async function highlightCodeBlocks(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>('pre code:not([data-highlighted])')
  if (blocks.length === 0) return

  hljsPromise ??= import('highlight.js/lib/common').then((mod) => mod.default)
  const hljs = await hljsPromise

  // highlight.js sets data-highlighted itself, and refuses to run on an element
  // that already carries it, so the flag must not be set up front.
  blocks.forEach((block) => hljs.highlightElement(block))
}
