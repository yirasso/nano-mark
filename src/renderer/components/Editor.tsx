import { useEffect, useRef } from 'react'
import { Annotation, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  keymap,
  drawSelection,
  dropCursor,
  lineNumbers,
  placeholder
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { foldGutter, foldKeymap, syntaxHighlighting } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { githubHighlight, githubMarkdownTags, githubTheme } from './editor-theme'
import { samePath } from '../lib/paths'

/** Marks a transaction the app made itself, so it is not reported as a user edit. */
const programmatic = Annotation.define<boolean>()

export interface Reveal {
  path: string
  line: number
  column: number
  length: number
  /** Bumped on every request, so clicking the same result again jumps again. */
  token: number
}

interface EditorProps {
  path: string | null
  value: string
  loadedPath: string | null
  reveal: Reveal | null
  onChange: (next: string) => void
}

export function Editor({
  path,
  value,
  loadedPath,
  reveal,
  onChange
}: EditorProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const pathRef = useRef<string | null>(null)
  const appliedReveal = useRef(0)
  const extensionsRef = useRef<Extension[]>([])

  onChangeRef.current = onChange

  // The view is created once and lives for the whole session. Switching files
  // swaps the state, which also drops the undo history of the previous file.
  useEffect(() => {
    if (!hostRef.current) return

    const extensions: Extension[] = [
      history(),
      drawSelection(),
      dropCursor(),
      lineNumbers(),
      foldGutter(),
      // GitHub's blob view does not soft-wrap; long lines scroll sideways.
      EditorState.tabSize.of(4),
      EditorView.contentAttributes.of({ spellcheck: 'true' }),
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        extensions: [githubMarkdownTags]
      }),
      syntaxHighlighting(githubHighlight),
      githubTheme,
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
      placeholder('Write something.'),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return
        if (update.transactions.some((tr) => tr.annotation(programmatic))) return
        onChangeRef.current(update.state.doc.toString())
      })
    ]

    const view = new EditorView({
      state: EditorState.create({ doc: '', extensions }),
      parent: hostRef.current
    })
    viewRef.current = view
    extensionsRef.current = extensions

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    if (pathRef.current !== path) {
      pathRef.current = path
      view.setState(EditorState.create({ doc: value, extensions: extensionsRef.current }))
      view.scrollDOM.scrollTop = 0
      return
    }

    // Same file, new content: an external change was reloaded underneath us.
    if (view.state.doc.toString() !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: programmatic.of(true)
      })
    }
  }, [path, value])

  // Runs after the document swap above, so the text is already in the view.
  useEffect(() => {
    const view = viewRef.current
    if (!view || !reveal || appliedReveal.current === reveal.token) return
    if (!samePath(reveal.path, path)) return
    // Wait for the file's own content: an empty or stale buffer would send the
    // cursor to the wrong place and burn the request.
    if (!samePath(reveal.path, loadedPath)) return
    if (view.state.doc.toString() !== value) return
    if (reveal.line > view.state.doc.lines) return

    appliedReveal.current = reveal.token

    const line = view.state.doc.line(reveal.line)
    const from = Math.min(line.from + reveal.column, line.to)
    const to = Math.min(from + reveal.length, line.to)

    view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: 'center' })
    })
    view.focus()
  }, [reveal, path, value, loadedPath])

  useEffect(() => {
    if (path) viewRef.current?.focus()
  }, [path])

  return <div className="editor" ref={hostRef} />
}
