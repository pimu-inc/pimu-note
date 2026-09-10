/**
 * ホットキー表記の変換。要件 F-501a。
 *
 * Tauri のアクセラレータ表記（"CommandOrControl+Alt+N"）と、
 * ブラウザの KeyboardEvent、画面表示用の記号を行き来する。
 */

/** KeyboardEvent.code を Tauri のキー名に変換する。対応外なら null */
export function toAcceleratorKey(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]

  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return digit[1]

  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code

  const named: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Backquote: 'Backquote',
    Minus: 'Minus',
    Equal: 'Equal',
    BracketLeft: 'BracketLeft',
    BracketRight: 'BracketRight',
    Semicolon: 'Semicolon',
    Quote: 'Quote',
    Comma: 'Comma',
    Period: 'Period',
    Slash: 'Slash',
    Backslash: 'Backslash',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
  }
  return named[code] ?? null
}


/** 画面に出すときは macOS の記号に置き換える */
export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => {
      switch (part) {
        case 'CommandOrControl':
        case 'CmdOrCtrl':
          return '⌘'
        case 'Alt':
          return '⌥'
        case 'Shift':
          return '⇧'
        case 'Control':
          return '⌃'
        case 'Up':
          return '↑'
        case 'Down':
          return '↓'
        case 'Left':
          return '←'
        case 'Right':
          return '→'
        default:
          return part
      }
    })
    .join('')
}


/**
 * macOS 自体が握っていることが多い組み合わせ。
 *
 * これらは `RegisterEventHotKey` での登録自体は成功してしまうことがあり、
 * 「登録できたのに押しても反応しない」という分かりにくい状態になる。
 * 失敗として検出できない以上、選ぶ前に注意を出すしかない。
 * システム設定でその機能を切っていれば使えるので、禁止ではなく警告に留める。
 */
const KNOWN_SYSTEM_SHORTCUTS: Record<string, string> = {
  'CommandOrControl+Space': 'Spotlight 検索',
  'Control+Space': '入力ソースの切り替え',
  'CommandOrControl+Shift+3': 'スクリーンショット（画面全体）',
  'CommandOrControl+Shift+4': 'スクリーンショット（選択範囲）',
  'CommandOrControl+Shift+5': 'スクリーンショットと画面収録',
  'CommandOrControl+Alt+Escape': '強制終了',
  'Control+Up': 'Mission Control',
  'Control+Down': 'アプリケーションウインドウ',
  'Control+Left': '左のスペースへ移動',
  'Control+Right': '右のスペースへ移動',
}

/**
 * macOS が既に使っている可能性が高いなら、その用途を返す。
 * 問題なさそうなら null。
 */
export function describeSystemConflict(accelerator: string): string | null {
  return KNOWN_SYSTEM_SHORTCUTS[accelerator] ?? null
}
