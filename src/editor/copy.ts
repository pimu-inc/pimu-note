import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import type { EditorState } from '@codemirror/state'
import { EditorView, type KeyBinding } from '@codemirror/view'
import { markdownToSafeHtml } from '../lib/clipboard'

/** F-306: 設定で「常にプレーンのみ」に切り替えられる */
export type CopyMode = 'both' | 'plain'

/**
 * コピー対象の文字列を取り出す。
 * 選択があればその範囲、なければカーソル行。CodeMirror の既定の挙動に合わせている。
 */
function copyTarget(state: EditorState): string {
  const selected = state.selection.ranges
    .filter((r) => !r.empty)
    .map((r) => state.sliceDoc(r.from, r.to))

  if (selected.length > 0) return selected.join('\n')

  const line = state.doc.lineAt(state.selection.main.head)
  return line.text
}

/** ⌘⇧C 用。選択がなければノート全体を対象にする */
function plainCopyTarget(state: EditorState): string {
  const selected = state.selection.ranges
    .filter((r) => !r.empty)
    .map((r) => state.sliceDoc(r.from, r.to))

  return selected.length > 0 ? selected.join('\n') : state.doc.toString()
}

/**
 * 要件 F-301〜F-304。⌘C でプレーン Markdown と HTML の両方をクリップボードに載せる。
 *
 * Tauri のクリップボード API ではなく、ブラウザの copy イベントを横取りしている。
 * こちらなら選択範囲をそのまま扱えるうえ、2 つの形式を 1 回の操作で載せられる。
 */
export function markdownCopy(getMode: () => CopyMode) {
  return EditorView.domEventHandlers({
    copy(event, view) {
      const data = event.clipboardData
      if (!data) return false

      const text = copyTarget(view.state)
      if (!text) return false

      // F-302: プレーン側は加工せず、書いた Markdown をそのまま入れる
      data.setData('text/plain', text)

      if (getMode() === 'both') {
        data.setData('text/html', markdownToSafeHtml(text))
      }

      event.preventDefault()
      return true
    },
  })
}

/**
 * 要件 F-305。⌘⇧C はプレーンテキストだけを載せる。
 *
 * 貼り先が ⌘⇧V（書式なし貼り付け）に対応していない場合の逃げ道。
 */
export function plainOnlyCopyBinding(onDone?: () => void): KeyBinding {
  return {
    key: 'Mod-Shift-c',
    preventDefault: true,
    run(view) {
      const text = plainCopyTarget(view.state)
      void writeText(text).then(() => onDone?.())
      return true
    },
  }
}
