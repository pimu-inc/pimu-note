import { describe, expect, it } from 'vitest'
import { describeSystemConflict, formatAccelerator, toAcceleratorKey } from './accelerator'

describe('toAcceleratorKey', () => {
  it('英字・数字・ファンクションキーを変換する', () => {
    expect(toAcceleratorKey('KeyN')).toBe('N')
    expect(toAcceleratorKey('Digit1')).toBe('1')
    expect(toAcceleratorKey('F5')).toBe('F5')
    expect(toAcceleratorKey('F24')).toBe('F24')
  })

  it('矢印キーは Tauri 側の名前に合わせる', () => {
    expect(toAcceleratorKey('ArrowUp')).toBe('Up')
    expect(toAcceleratorKey('ArrowRight')).toBe('Right')
  })

  it('修飾キー単体や対応外のキーは受け付けない', () => {
    // 修飾キーだけではホットキーにならない
    expect(toAcceleratorKey('ShiftLeft')).toBeNull()
    expect(toAcceleratorKey('MetaLeft')).toBeNull()
    // 存在しないファンクションキー
    expect(toAcceleratorKey('F25')).toBeNull()
    expect(toAcceleratorKey('Unknown')).toBeNull()
  })
})

describe('formatAccelerator', () => {
  it('修飾キーを macOS の記号にする', () => {
    expect(formatAccelerator('CommandOrControl+Alt+N')).toBe('⌘⌥N')
    expect(formatAccelerator('CommandOrControl+Shift+Space')).toBe('⌘⇧Space')
    expect(formatAccelerator('Control+Up')).toBe('⌃↑')
  })
})

describe('describeSystemConflict', () => {
  it('macOS が握っている組み合わせを言い当てる', () => {
    expect(describeSystemConflict('CommandOrControl+Space')).toBe('Spotlight 検索')
    expect(describeSystemConflict('Control+Up')).toBe('Mission Control')
  })

  it('問題なさそうな組み合わせでは null', () => {
    expect(describeSystemConflict('CommandOrControl+Alt+N')).toBeNull()
    expect(describeSystemConflict('CommandOrControl+Alt+J')).toBeNull()
  })
})
