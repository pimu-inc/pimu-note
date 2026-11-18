import { deleteMarkupBackward, insertNewlineContinueMarkupCommand } from '@codemirror/lang-markdown'
import { EditorSelection, type ChangeSpec, type StateCommand, type Transaction } from '@codemirror/state'
import type { KeyBinding } from '@codemirror/view'

/**
 * F-204: リストの途中で Enter を押したら、必ず「すぐ次の行」に次の項目を出す。
 *
 * `@codemirror/lang-markdown` の既定の Enter は、リストの 1 項目めと 2 項目めの間に
 * 空行があると「空行区切りのリスト」とみなし、以降の Enter でも毎回空行を 1 行挟む。
 * Markdown としては正しいが、下書き用のメモでは「空行を挟んで箇条書きを再開しただけ」
 * でもこの扱いになり、勝手に 1 行空くように見える。
 *
 * この挙動だけを止める設定は用意されていないので、既定のコマンドが作った変更から
 * 挟まれた空行を取り除いて適用する。それ以外（記号の継続、空の項目での解除、
 * 番号の振り直し）は既定のまま。
 */

const base = insertNewlineContinueMarkupCommand({ nonTightLists: false })

/** 「改行 + 空行（空白か引用記号だけ）+ 改行」で始まる挿入 */
const LEADING_BLANK_LINE = /^(\r?\n)[ \t>]*\r?\n/

export const continueListOnNextLine: StateCommand = ({ state, dispatch }) => {
  let tr: Transaction | null = null
  if (!base({ state, dispatch: (t) => (tr = t) }) || !tr) return false
  const original: Transaction = tr

  const changes: ChangeSpec[] = []
  /** 取り除いた空行の、変更後の文書での位置と長さ。カーソルをその分だけ戻す */
  const removed: { at: number; length: number }[] = []

  original.changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
    const text = inserted.toString()
    const trimmed = text.replace(LEADING_BLANK_LINE, '$1')
    if (trimmed.length !== text.length) {
      removed.push({ at: fromB, length: text.length - trimmed.length })
    }
    changes.push({ from: fromA, to: toA, insert: trimmed })
  })

  if (removed.length === 0) {
    dispatch(original)
    return true
  }

  const shift = (pos: number) =>
    pos - removed.reduce((sum, r) => (r.at < pos ? sum + r.length : sum), 0)

  dispatch(
    state.update({
      changes,
      selection: EditorSelection.create(
        original.newSelection.ranges.map((r) => EditorSelection.cursor(shift(r.head))),
        original.newSelection.mainIndex,
      ),
      scrollIntoView: true,
      userEvent: 'input',
    }),
  )
  return true
}

/** `markdown()` が入れる既定のキーマップの代わりに使う */
export const listKeyBindings: readonly KeyBinding[] = [
  { key: 'Enter', run: continueListOnNextLine },
  { key: 'Backspace', run: deleteMarkupBackward },
]
