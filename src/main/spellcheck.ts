import { app, BrowserWindow, Menu, session, type ContextMenuParams } from 'electron'
import { detectLanguage, spellcheckSet } from './language'

/**
 * The spellchecker, which is Chromium's, pointed at the languages of whatever
 * file is open.
 *
 * macOS is absent from all of this on purpose: there the OS spellchecker is
 * used, it identifies the language by itself, and `setSpellCheckerLanguages` is
 * documented as a no-op. Calling it would look like it worked and change
 * nothing.
 */
const isMac = process.platform === 'darwin'

/** How many corrections a menu offers before the list stops being a shortcut. */
const MAX_SUGGESTIONS = 6

/** What the session is set to right now, so unchanged text costs nothing. */
let applied: string[] = []

function languagesFor(content: string): string[] {
  const available = session.defaultSession.availableSpellCheckerLanguages
  return spellcheckSet(detectLanguage(content), available, app.getLocale())
}

/**
 * Reads the language off a document and hands it, plus English, to the session.
 * Chromium calls a word a mistake only when none of the enabled dictionaries
 * knows it, so `bacalhau` and `fish` both pass in the same file while `bacalau`
 * and `fishe` are still caught.
 *
 * A file that does not say clearly enough falls back to the machine's own
 * language rather than keeping the last file's, so what is in force is always
 * either read off what is on screen or the obvious default.
 */
export function applyDocumentLanguage(content: string): void {
  if (isMac) return

  const next = languagesFor(content)
  if (next.length === 0) return
  if (next.length === applied.length && next.every((code, i) => code === applied[i])) return

  try {
    session.defaultSession.setSpellCheckerLanguages(next)
    applied = next
  } catch {
    // An unavailable code is an error, not a warning. Nothing about a note is
    // worth taking the window down for.
  }
}

/** The languages a menu should name, so an automatic switch is visible. */
function currentLanguages(): string[] {
  if (isMac) return []
  if (applied.length > 0) return applied
  return spellcheckSet(null, session.defaultSession.availableSpellCheckerLanguages, app.getLocale())
}

function languageNames(codes: string[]): string {
  let display: Intl.DisplayNames | null = null
  try {
    display = new Intl.DisplayNames(['en'], { type: 'language' })
  } catch {
    display = null
  }
  const names = codes.map((code) => display?.of(code) ?? code)
  if (names.length < 2) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Right-clicking a word Chromium has underlined offers the corrections it has,
 * and a way to say the word was right all along.
 *
 * Electron shows no context menu of its own, so without this the underline is
 * decoration: you can see the mistake and do nothing about it. The menu appears
 * only over a misspelling — every other right-click belongs to the sidebar's
 * own menu, and two menus at once would be one too many.
 */
export function installSpellcheckMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable || !params.misspelledWord) return
    buildMenu(window, params).popup({ window })
  })
}

function buildMenu(window: BrowserWindow, params: ContextMenuParams): Menu {
  const { webContents } = window
  const suggestions = params.dictionarySuggestions.slice(0, MAX_SUGGESTIONS)

  const template: Electron.MenuItemConstructorOptions[] =
    suggestions.length > 0
      ? suggestions.map((suggestion) => ({
          label: suggestion,
          click: () => webContents.replaceMisspelling(suggestion)
        }))
      : [{ label: 'No suggestions', enabled: false }]

  template.push(
    { type: 'separator' },
    {
      label: `Add “${params.misspelledWord}” to the dictionary`,
      click: () => webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
    }
  )

  // The dictionaries change by themselves with the file, so the menu says which
  // ones just called this word wrong.
  const languages = currentLanguages()
  if (languages.length > 0) {
    template.push(
      { type: 'separator' },
      { label: `Checking ${languageNames(languages)}`, enabled: false }
    )
  }

  return Menu.buildFromTemplate(template)
}
