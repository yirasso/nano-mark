import { useEffect, useMemo, useRef } from 'react'
import { highlightCodeBlocks, renderMarkdown } from '../lib/markdown'

interface PreviewProps {
  source: string
  active: boolean
}

export function Preview({ source, active }: PreviewProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  // Hidden previews are not re-rendered, so typing never pays for markdown parsing.
  const html = useMemo(() => (active ? renderMarkdown(source) : ''), [source, active])

  useEffect(() => {
    if (!active || !ref.current) return
    void highlightCodeBlocks(ref.current)
  }, [html, active])

  const onClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (!href) return
    event.preventDefault()
    if (href.startsWith('#')) {
      ref.current?.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView({
        behavior: 'smooth'
      })
      return
    }
    void window.nano.openExternal(href)
  }

  return (
    <div className="markdown" onClick={onClick}>
      <div className="markdown-body" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
