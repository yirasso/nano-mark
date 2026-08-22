import { EditorView } from '@codemirror/view'
import { HighlightStyle } from '@codemirror/language'
import { styleTags, Tag, tags as t } from '@lezer/highlight'
import type { MarkdownExtension } from '@lezer/markdown'

/**
 * GitHub gives each markdown punctuation mark its own colour, but lezer-markdown
 * lumps them all into `processingInstruction`. These tags split them apart again
 * so the highlight style can tell a list dash from a pair of asterisks.
 */
export const gh = {
  headerMark: Tag.define(),
  listMark: Tag.define(),
  quoteMark: Tag.define(),
  emphasisMark: Tag.define(),
  codeMark: Tag.define(),
  linkMark: Tag.define(),
  inlineCode: Tag.define()
}

export const githubMarkdownTags: MarkdownExtension = {
  props: [
    styleTags({
      HeaderMark: gh.headerMark,
      ListMark: gh.listMark,
      QuoteMark: gh.quoteMark,
      EmphasisMark: gh.emphasisMark,
      CodeMark: gh.codeMark,
      LinkMark: gh.linkMark,
      // Separated from fenced CodeText, which GitHub leaves in the default colour.
      InlineCode: gh.inlineCode,
      // GitHub has no table token in its palette, so tables stay in the default
      // colour rather than inheriting lezer's heading tag for the header row.
      'TableHeader/...': t.content,
      TableDelimiter: t.content
    })
  ]
}

/**
 * The blob view: 12px monospace on a 20px grid, a quiet line-number gutter, and
 * no styling of its own beyond colour. Metrics measured on github.com.
 */
export const githubTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--gh-fg-default)',
    backgroundColor: 'var(--gh-bg-default)',
    fontSize: 'var(--gh-code-size)'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--gh-mono)',
    lineHeight: 'var(--gh-code-line)',
    overflow: 'auto'
  },
  '.cm-content': {
    padding: '8px 0',
    caretColor: 'var(--gh-fg-default)'
  },
  '.cm-line': { padding: '0 10px' },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--gh-fg-default)',
    borderLeftWidth: '2px'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--gh-selection)'
  },
  '.cm-gutters': {
    backgroundColor: 'var(--gh-bg-default)',
    color: 'var(--gh-fg-muted)',
    border: 'none',
    fontFamily: 'var(--gh-mono)',
    fontSize: 'var(--gh-code-size)'
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 16px',
    minWidth: '0'
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 4px 0 0',
    color: 'var(--gh-fg-muted)',
    opacity: '0',
    transition: 'opacity 100ms'
  },
  '.cm-gutters:hover .cm-foldGutter .cm-gutterElement': { opacity: '1' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--gh-bg-muted)',
    border: '1px solid var(--gh-border-default)',
    color: 'var(--gh-fg-muted)'
  },
  '.cm-placeholder': { color: 'var(--gh-fg-muted)' }
})

/**
 * Measured off github.com, and deliberately literal about two things people
 * expect to be otherwise: bold and italic source text is *not* emboldened or
 * slanted, and headings are not enlarged. GitHub only colours the markers.
 *
 * Order matters. A mark inside `**...**` carries both `strong` and
 * `emphasisMark`, so the mark rules come last to win the tie.
 */
export const githubHighlight = HighlightStyle.define([
  /* ----- markdown structure ----- */
  {
    tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6],
    color: 'var(--gh-markup-heading)',
    fontWeight: '700',
    fontSize: '1em'
  },
  { tag: t.strong, color: 'var(--gh-fg-default)', fontWeight: '400' },
  { tag: t.emphasis, color: 'var(--gh-fg-default)', fontStyle: 'normal' },
  { tag: t.strikethrough, color: 'var(--gh-fg-default)', textDecoration: 'none' },
  { tag: t.link, color: 'var(--gh-fg-default)', textDecoration: 'none' },
  // Measured: GitHub paints the whole quoted line, marker included, as an entity tag.
  { tag: t.quote, color: 'var(--gh-entity-tag)', fontStyle: 'normal' },
  { tag: t.list, color: 'var(--gh-fg-default)' },
  { tag: t.monospace, color: 'var(--gh-fg-default)' },
  { tag: t.contentSeparator, color: 'var(--gh-fg-default)' },
  { tag: [t.url, t.special(t.url)], color: 'var(--gh-string)', textDecoration: 'underline' },
  // The language after a fence, shown the same way as a heading.
  { tag: t.labelName, color: 'var(--gh-markup-heading)', fontWeight: '700' },

  /* ----- languages embedded in fenced blocks ----- */
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--gh-comment)' },
  {
    tag: [
      t.keyword,
      t.modifier,
      t.controlKeyword,
      t.moduleKeyword,
      t.operatorKeyword,
      t.definitionKeyword,
      t.typeName,
      t.self
    ],
    color: 'var(--gh-keyword)'
  },
  { tag: [t.string, t.special(t.string), t.docString], color: 'var(--gh-string)' },
  { tag: t.regexp, color: 'var(--gh-string-regexp)' },
  {
    tag: [
      t.number,
      t.bool,
      t.null,
      t.atom,
      t.literal,
      t.propertyName,
      t.attributeName,
      t.operator,
      t.className
    ],
    color: 'var(--gh-constant)'
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.variableName)],
    color: 'var(--gh-entity)'
  },
  { tag: [t.tagName, t.angleBracket], color: 'var(--gh-entity-tag)' },
  { tag: [t.standard(t.variableName), t.namespace], color: 'var(--gh-variable)' },
  { tag: t.variableName, color: 'var(--gh-fg-default)' },
  { tag: t.invalid, color: 'var(--gh-invalid)' },

  /* ----- the marks, last so they beat the spans they sit inside ----- */
  { tag: gh.headerMark, color: 'var(--gh-markup-heading)', fontWeight: '700' },
  { tag: gh.listMark, color: 'var(--gh-variable)' },
  {
    tag: [gh.emphasisMark, gh.codeMark, gh.linkMark],
    color: 'var(--gh-string)',
    fontWeight: '400',
    fontStyle: 'normal'
  },
  { tag: gh.quoteMark, color: 'var(--gh-entity-tag)', fontStyle: 'normal' },
  { tag: gh.inlineCode, color: 'var(--gh-constant)' }
])
