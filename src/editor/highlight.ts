import { HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

/**
 * 要件 F-201 / F-203。
 *
 * 「色だけ変えて、文字サイズと行の高さは一切変えない」ためのハイライト定義。
 *
 * 見出しを大きくしたり、インラインコードを等幅フォントにしたりすると行の高さが揺れ、
 * カーソルが行ごとに跳ねてしまう。ここで指定してよいのは color / font-weight /
 * font-style / text-decoration だけで、font-size と font-family と line-height は
 * 絶対に触らない。
 */

type Palette = {
  /** #, -, ** などの記法記号そのもの。要件 F-202 で常に見えている必要がある */
  marker: string
  heading: string
  strong: string
  emphasis: string
  code: string
  link: string
  quote: string
}

const light: Palette = {
  marker: '#a8a8ae',
  heading: '#0e6191',
  strong: '#1d1d1f',
  emphasis: '#1d1d1f',
  code: '#b0326b',
  link: '#1281c0',
  quote: '#6e6e73',
}

const dark: Palette = {
  marker: '#6e6e78',
  heading: '#60bcf0',
  strong: '#f5f5f7',
  emphasis: '#f5f5f7',
  code: '#ff9ecb',
  link: '#3baced',
  quote: '#98989d',
}

function buildHighlightStyle(p: Palette) {
  return HighlightStyle.define([
    // 見出しは 1〜6 すべて同じ扱い。太字と色だけで、大きさは変えない
    {
      tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6],
      color: p.heading,
      fontWeight: '700',
    },

    { tag: t.strong, color: p.strong, fontWeight: '700' },
    { tag: t.emphasis, color: p.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },

    // インラインコードとコードブロック。等幅にすると行の高さが変わるので色のみ
    { tag: [t.monospace, t.literal], color: p.code },

    { tag: [t.link, t.url], color: p.link, textDecoration: 'underline' },
    { tag: t.quote, color: p.quote, fontStyle: 'italic' },

    // 記法記号（#, -, *, >, ` など）だけを控えめな色にする。
    // 記号は見出しや強調の内側にあるので、それらより後ろに置いて上書きさせる。
    // なお t.list は「リスト記号」ではなく「リスト項目の中身全体」に付くタグなので、
    // ここで色を当てると本文まで灰色になる。使わないこと。
    { tag: t.processingInstruction, color: p.marker, fontWeight: '400' },
  ])
}

export const lightHighlightStyle = buildHighlightStyle(light)
export const darkHighlightStyle = buildHighlightStyle(dark)

/**
 * エディタの土台となる見た目。
 * font-size と line-height をここで一度だけ決め打ちし、以降どのトークンでも上書きしない。
 */
export const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
  },
  '.cm-scroller': {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif',
    lineHeight: '1.75',
    padding: '16px 20px 40px',
  },
  '.cm-content': {
    caretColor: 'var(--accent)',
    // 行ごとに高さが変わらないよう、継承を明示的に固定する
    fontSize: 'inherit',
    lineHeight: 'inherit',
  },
  '.cm-line': {
    fontSize: 'inherit',
    lineHeight: 'inherit',
    padding: '0',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--selection)',
  },
})

/** ライト / ダークで背景と文字色だけを差し替える */
export const lightTheme = EditorView.theme({ '&': { color: '#1d1d1f', backgroundColor: '#ffffff' } })
export const darkTheme = EditorView.theme(
  { '&': { color: '#f5f5f7', backgroundColor: '#1c1c1e' } },
  { dark: true },
)
