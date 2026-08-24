import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import type { Tree } from '@lezer/common'

/**
 * Keeps the spellchecker off everything in a file that is not prose.
 *
 * Chromium checks the text of the editable element and knows nothing about
 * markdown, so a note with a shell command in it gets `curl`, `urlencode` and
 * every flag underlined as mistakes. The markdown grammar already knows which
 * spans are not prose; this hands that knowledge to the spellchecker by putting
 * `spellcheck="false"` on them, which Chromium honours per element rather than
 * per editable root.
 */

/**
 * Matched nodes are not descended into, so the outermost one wins: `FencedCode`
 * covers its own marks, info string and text without them being listed.
 */
const NOT_PROSE = new Set([
  'FencedCode',
  'CodeBlock',
  'CodeText',
  'CodeInfo',
  'InlineCode',
  'URL',
  'Autolink',
  'HTMLBlock',
  'HTMLTag',
  'Comment',
  'CommentBlock',
  'ProcessingInstructionBlock'
])

export interface Span {
  from: number
  to: number
}

/**
 * The non-prose spans of a document between `from` and `to`, in document order
 * and never overlapping — which is what a `RangeSetBuilder` requires.
 */
export function proselessRanges(tree: Tree, from: number, to: number): Span[] {
  const spans: Span[] = []
  tree.iterate({
    from,
    to,
    enter: (node) => {
      if (!NOT_PROSE.has(node.name)) return true
      const start = Math.max(node.from, from)
      const end = Math.min(node.to, to)
      if (end > start) spans.push({ from: start, to: end })
      // Anything inside is already covered by the span just added.
      return false
    }
  })
  return spans
}

const notProse = Decoration.mark({ attributes: { spellcheck: 'false' } })

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const tree = syntaxTree(view.state)
  // Only what is on screen: the attribute matters where the text is rendered.
  for (const range of view.visibleRanges) {
    for (const span of proselessRanges(tree, range.from, range.to)) {
      builder.add(span.from, span.to, notProse)
    }
  }
  return builder.finish()
}

export const spellcheckProseOnly = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = build(view)
    }

    update(update: ViewUpdate): void {
      // The tree comparison catches the parse finishing on a long file, which
      // changes what counts as code without changing the document.
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = build(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
)
