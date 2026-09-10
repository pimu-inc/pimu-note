import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, drawSelection, keymap } from '@codemirror/view'
import { markdownCopy, plainOnlyCopyBinding, type CopyMode } from '../editor/copy'
import {
  baseTheme,
  darkHighlightStyle,
  darkTheme,
  lightHighlightStyle,
  lightTheme,
} from '../editor/highlight'
import { pimuKeyBindings } from '../editor/shortcuts'

type Props = {
  /** 初期値。以降の更新は CodeMirror 側が持つので、ノートを切り替えたときだけ変える */
  initialValue: string
  /** ノートを切り替えたことを示す識別子。変わるとエディタの中身を差し替える */
  noteId: string
  onChange: (value: string) => void
  /** F-601〜603: 実際に適用する外観。OS 追従の解決は呼び出し側が済ませる */
  isDark: boolean
  /** F-306: ⌘C の挙動。CodeMirror の外で読むので getter で渡す */
  getCopyMode: () => CopyMode
  /** コピー処理などから現在の内容を取り出すためのハンドル */
  viewRef?: React.MutableRefObject<EditorView | null>
}

/** ライト / ダークをまとめて差し替えるための仕切り */
const appearance = new Compartment()

function appearanceFor(isDark: boolean) {
  return isDark
    ? [darkTheme, syntaxHighlighting(darkHighlightStyle)]
    : [lightTheme, syntaxHighlighting(lightHighlightStyle)]
}

export default function Editor({
  initialValue,
  noteId,
  onChange,
  isDark,
  getCopyMode,
  viewRef,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const innerViewRef = useRef<EditorView | null>(null)
  /**
   * ノート切り替えによる中身の差し替え中であることを示す。
   *
   * 差し替えも docChanged として通知されるため、この間に onChange を呼ぶと
   * 「新しく開いたノートの中身を、まだ切り替わりきっていない保存先へ書く」
   * という事故につながる。差し替えは利用者の入力ではないので通知しない。
   */
  const swappingRef = useRef(false)
  const isDarkRef = useRef(isDark)
  isDarkRef.current = isDark
  // onChange を extension の中に閉じ込めないよう、最新の関数を ref 越しに読む
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const getCopyModeRef = useRef(getCopyMode)
  getCopyModeRef.current = getCopyMode

  // --- エディタの生成は一度だけ ---
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,

          // 自前のキーバインドを先に置いて、既定より優先させる（Tab の取り合いを避ける）
          keymap.of([plainOnlyCopyBinding(), ...pimuKeyBindings]),
          markdownCopy(() => getCopyModeRef.current()),
          keymap.of([...historyKeymap, ...defaultKeymap]),

          // markdown() が markdownKeymap（Enter でのリスト継続など）も入れてくれる
          markdown({ base: markdownLanguage }),

          baseTheme,
          appearance.of(appearanceFor(isDarkRef.current)),

          EditorView.updateListener.of((update) => {
            if (update.docChanged && !swappingRef.current) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
        ],
      }),
    })

    innerViewRef.current = view
    if (viewRef) viewRef.current = view
    view.focus()

    return () => {
      view.destroy()
      innerViewRef.current = null
      if (viewRef) viewRef.current = null
    }
    // 生成は一度だけ。initialValue の差し替えは下の effect が担当する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- F-601〜603: 外観の切り替え ---
  useEffect(() => {
    const view = innerViewRef.current
    if (!view) return
    view.dispatch({ effects: appearance.reconfigure(appearanceFor(isDark)) })
  }, [isDark])

  // --- ノートを切り替えたら中身を丸ごと入れ替える ---
  useEffect(() => {
    const view = innerViewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === initialValue) return

    swappingRef.current = true
    try {
      // dispatch は同期的に走るので、この間だけ通知を止めれば足りる
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: initialValue },
        selection: { anchor: 0 },
      })
    } finally {
      swappingRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  return <div className="editor-host selectable" ref={hostRef} />
}
