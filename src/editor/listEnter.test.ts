import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { continueListOnNextLine } from './listEnter'

/** 末尾にカーソルを置いて Enter を押した後の文書とカーソル位置を返す */
function pressEnterAtEnd(doc: string) {
  let state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(doc.length),
    extensions: [markdown({ base: markdownLanguage, addKeymap: false })],
  })
  ensureSyntaxTree(state, state.doc.length, 5000)
  const handled = continueListOnNextLine({
    state,
    dispatch: (tr) => {
      state = tr.state
    },
  })
  return { handled, doc: state.doc.toString(), head: state.selection.main.head }
}

describe('continueListOnNextLine', () => {
  it('空行を挟んで再開した箇条書きでも、次の項目はすぐ次の行に出る', () => {
    const before = '- あ\n\n- sssssss'
    const after = pressEnterAtEnd(before)
    expect(after.doc).toBe('- あ\n\n- sssssss\n- ')
    expect(after.head).toBe(after.doc.length)
  })

  it('番号リストでも空行を挟まず、番号は続く', () => {
    const after = pressEnterAtEnd('1. あ\n\n2. い')
    expect(after.doc).toBe('1. あ\n\n2. い\n3. ')
    expect(after.head).toBe(after.doc.length)
  })

  it('ふつうの箇条書きは従来どおり継続する', () => {
    const after = pressEnterAtEnd('- あ\n- い')
    expect(after.doc).toBe('- あ\n- い\n- ')
  })

  it('空の項目で Enter を押すと記号が外れる', () => {
    const after = pressEnterAtEnd('- あ\n- ')
    expect(after.doc).toBe('- あ\n')
  })

  it('リストの外では何もしない（既定の改行に任せる）', () => {
    expect(pressEnterAtEnd('ふつうの文').handled).toBe(false)
  })
})
