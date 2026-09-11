import { describe, expect, it } from 'vitest'
import { buildClipboardPayload, writeClipboardPayload } from './copy'

/**
 * 要件 F-302 / F-304 の担保。
 * どのモードでも、クリップボードに載る HTML に色やフォントが混じらないこと。
 */

/** DataTransfer の代わり。何が書かれたかを記録する */
function fakeDataTransfer() {
  const items = new Map<string, string>()
  // ブラウザが見た目を焼き込んだ HTML を先に載せていた状況を再現する
  items.set('text/html', '<span style="color: rgb(245, 245, 247)">見た目つき</span>')
  return {
    items,
    clearData: () => items.clear(),
    setData: (type: string, value: string) => void items.set(type, value),
  }
}

describe('buildClipboardPayload', () => {
  it('both では Markdown ソースと色のない HTML を返す', () => {
    const p = buildClipboardPayload('# 見出し\n\n**太字**', 'both')
    expect(p.text).toBe('# 見出し\n\n**太字**')
    expect(p.html).toContain('<h1>見出し</h1>')
    expect(p.html).not.toMatch(/style=|color:/)
  })

  it('plain では HTML を載せない', () => {
    const p = buildClipboardPayload('# 見出し', 'plain')
    expect(p.text).toBe('# 見出し')
    expect(p.html).toBeNull()
  })
})

describe('writeClipboardPayload', () => {
  it('ブラウザが先に載せた見た目つき HTML を捨ててから書く', () => {
    const dt = fakeDataTransfer()
    writeClipboardPayload(dt as unknown as DataTransfer, buildClipboardPayload('**太字**', 'both'))
    expect(dt.items.get('text/plain')).toBe('**太字**')
    expect(dt.items.get('text/html')).toBe('<p><strong>太字</strong></p>')
    expect([...dt.items.values()].join('')).not.toContain('rgb(245')
  })

  it('plain のときは text/html 自体が残らない', () => {
    const dt = fakeDataTransfer()
    writeClipboardPayload(dt as unknown as DataTransfer, buildClipboardPayload('**太字**', 'plain'))
    expect(dt.items.has('text/html')).toBe(false)
    expect(dt.items.get('text/plain')).toBe('**太字**')
  })
})
