import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { toggleTaskAt } from './taskToggle'

/** doc の中で marker が最初に現れる位置をクリックした後の文書を返す（切り替わらなければ null） */
function clickAt(doc: string, marker: string) {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage, addKeymap: false })],
  })
  ensureSyntaxTree(state, state.doc.length, 5000)
  const spec = toggleTaskAt(state, doc.indexOf(marker))
  return spec ? state.update(spec).state.doc.toString() : null
}

describe('toggleTaskAt', () => {
  it('未完了のタスクをチェックする', () => {
    expect(clickAt('- [ ] 買い物', '[ ]')).toBe('- [x] 買い物')
  })

  it('完了したタスクを未完了に戻す（大文字の X も）', () => {
    expect(clickAt('- [x] 買い物', '[x]')).toBe('- [ ] 買い物')
    expect(clickAt('- [X] 買い物', '[X]')).toBe('- [ ] 買い物')
  })

  it('入れ子や番号リストのタスクも切り替える', () => {
    expect(clickAt('- 親\n  - [ ] 子', '[ ]')).toBe('- 親\n  - [x] 子')
    expect(clickAt('1. [ ] 番号', '[ ]')).toBe('1. [x] 番号')
  })

  it('タスク以外の [ ] は切り替えない', () => {
    expect(clickAt('ただの [ ] 括弧', '[ ]')).toBeNull()
    expect(clickAt('```\n- [ ] コード\n```', '[ ]')).toBeNull()
  })
})
