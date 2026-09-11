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

export type ClipboardPayload = { text: string; html: string | null }

/**
 * クリップボードに載せる中身を組み立てる。
 * 入力は加工していない Markdown ソース（F-302）。HTML は色もフォントも持たない（F-304）。
 */
export function buildClipboardPayload(source: string, mode: CopyMode): ClipboardPayload {
  return { text: source, html: mode === 'both' ? markdownToSafeHtml(source) : null }
}

/**
 * DataTransfer へ書き込む。
 * 先に clearData しておくことで、ブラウザが見た目を焼き込んだ HTML を
 * 残していても必ず捨てられる。
 */
export function writeClipboardPayload(data: DataTransfer, payload: ClipboardPayload): void {
  data.clearData()
  data.setData('text/plain', payload.text)
  if (payload.html !== null) data.setData('text/html', payload.html)
}

/**
 * 要件 F-301〜F-304。エディタ内の ⌘C。
 *
 * ブラウザの copy イベントを横取りし、エディタの state から正確な範囲を取り出す
 * （DOM の選択範囲は画面に描画されている行しか含まないため、state を使う）。
 * カスタムの domEventHandlers は CodeMirror 組み込みより先に走り、
 * true を返せば組み込み処理もブラウザ既定のコピーも走らない。
 */
export function markdownCopy(getMode: () => CopyMode) {
  return EditorView.domEventHandlers({
    copy(event, view) {
      const data = event.clipboardData
      if (!data) return false

      const text = copyTarget(view.state)
      if (!text) return false

      writeClipboardPayload(data, buildClipboardPayload(text, getMode()))
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
