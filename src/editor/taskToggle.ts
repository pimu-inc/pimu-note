import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder, type EditorState, type TransactionSpec } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'

/**
 * `- [ ]` / `- [x]` のチェックボックスをクリックで切り替える。
 *
 * F-202（記法記号は常に表示）を守るため、`[ ]` をウィジェットに置き換えたりはせず、
 * 文字のまま「押せる」見た目を付けるだけにする（ephe と同じ方式）。
 *
 * 判定は正規表現ではなく GFM の構文木（TaskMarker）で行う。
 * コードブロックの中の `- [ ]` を誤って切り替えないため。
 */

const MARKER_CLASS = 'cm-task-marker'
const markerMark = Decoration.mark({ class: MARKER_CLASS, inclusive: false })

/** 見えている範囲にある TaskMarker（`[ ]` / `[x]`）に印を付ける */
function buildMarkers(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === 'TaskMarker') builder.add(node.from, node.to, markerMark)
      },
    })
  }
  return builder.finish()
}

/**
 * pos にある TaskMarker を切り替える変更を返す。TaskMarker でなければ null。
 * `[ ]` → `[x]`、`[x]` / `[X]` → `[ ]`。
 */
export function toggleTaskAt(state: EditorState, pos: number): TransactionSpec | null {
  const node = syntaxTree(state).resolveInner(pos, 1)
  if (node.name !== 'TaskMarker') return null

  const inner = node.from + 1
  const checked = state.sliceDoc(inner, inner + 1).toLowerCase() === 'x'
  return {
    changes: { from: inner, to: inner + 1, insert: checked ? ' ' : 'x' },
    userEvent: 'input.toggleTask',
  }
}

const markers = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildMarkers(view)
    }
    update(update: ViewUpdate) {
      // 構文木はバックグラウンドで伸びていくので、木が変わったときも作り直す
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildMarkers(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

const clickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0 || event.shiftKey || event.metaKey || event.altKey) return false
    const target = event.target instanceof Element ? event.target.closest(`.${MARKER_CLASS}`) : null
    if (!target) return false

    const spec = toggleTaskAt(view.state, view.posAtDOM(target))
    if (!spec) return false

    // カーソルを動かさずに切り替える
    event.preventDefault()
    view.dispatch(spec)
    return true
  },
})

const theme = EditorView.baseTheme({
  [`.${MARKER_CLASS}`]: {
    cursor: 'pointer',
    borderRadius: '3px',
  },
  [`.${MARKER_CLASS}:hover`]: {
    backgroundColor: 'var(--hover)',
  },
})

export const taskToggle = [markers, clickHandler, theme]
