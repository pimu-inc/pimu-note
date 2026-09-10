import { indentLess, indentMore } from '@codemirror/commands'
import { EditorSelection, type StateCommand } from '@codemirror/state'
import type { KeyBinding } from '@codemirror/view'

/**
 * 要件 F-208 / F-209。
 *
 * F-204〜207（リストの自動継続・空項目での解除・番号の自動採番・チェックボックスの継続）は
 * `@codemirror/lang-markdown` の `markdownKeymap` が Enter / Backspace に対して
 * すでに実装しているので、ここでは扱わない。
 */

/**
 * 選択範囲を記号で囲む。すでに囲まれていれば外す（トグル）。
 * 選択がないときは記号だけ挿入し、カーソルを内側に置く。
 */
function toggleWrap(mark: string): StateCommand {
  return ({ state, dispatch }) => {
    const len = mark.length

    const spec = state.changeByRange((range) => {
      const before = state.sliceDoc(Math.max(0, range.from - len), range.from)
      const after = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + len))

      // すでに囲まれている → 外す
      if (before === mark && after === mark) {
        return {
          changes: [
            { from: range.from - len, to: range.from },
            { from: range.to, to: range.to + len },
          ],
          range: EditorSelection.range(range.from - len, range.to - len),
        }
      }

      const text = state.sliceDoc(range.from, range.to)
      return {
        changes: { from: range.from, to: range.to, insert: `${mark}${text}${mark}` },
        range: range.empty
          ? EditorSelection.cursor(range.from + len)
          : EditorSelection.range(range.from + len, range.to + len),
      }
    })

    dispatch(state.update(spec, { scrollIntoView: true, userEvent: 'input' }))
    return true
  }
}

export const toggleBold = toggleWrap('**')
export const toggleItalic = toggleWrap('*')
export const toggleInlineCode = toggleWrap('`')

export const pimuKeyBindings: readonly KeyBinding[] = [
  // F-209
  { key: 'Mod-b', run: toggleBold, preventDefault: true },
  { key: 'Mod-i', run: toggleItalic, preventDefault: true },
  { key: 'Mod-e', run: toggleInlineCode, preventDefault: true },

  // F-208: リストのインデント上げ下げ。
  // メモ用エディタなので Tab はフォーカス移動ではなくインデントに割り当てる。
  { key: 'Tab', run: indentMore, shift: indentLess, preventDefault: true },
]
