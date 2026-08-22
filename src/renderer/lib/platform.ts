/**
 * The two words the interface has to spell differently per platform. Both are
 * read once from the bridge so no component has to remember to branch.
 */
export const MOD = window.nano.platform === 'darwin' ? '⌘' : 'Ctrl'

/** What this platform calls the place deleted files go. */
export const BIN = window.nano.platform === 'win32' ? 'Recycle Bin' : 'Trash'
