import { describe, expect, it } from 'vitest'
import { markdownToSafeHtml } from './clipboard'

/** 生成された HTML を実際に解析して、要素と属性を見る */
function elementsOf(html: string): Element[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return [...doc.body.querySelectorAll('*')]
}

/**
 * 要件 F-303 / F-304 の担保。
 *
 * ここが壊れると、Gmail などに貼ったときアプリの見た目ごと持ち込まれたり、
 * 想定しないタグが流れ込んだりする。純粋な入出力なのでテストで固定しておく。
 */

describe('markdownToSafeHtml', () => {
  it('見出し・強調・箇条書きを構造タグに変換する', () => {
    const html = markdownToSafeHtml('# 見出し\n\nこれは **太字** です。\n\n- ひとつ\n- ふたつ\n')

    expect(html).toContain('<h1>見出し</h1>')
    expect(html).toContain('<strong>太字</strong>')
    expect(html).toContain('<li>ひとつ</li>')
    expect(html).toContain('<ul>')
  })

  it('style 属性・class・色やフォント指定を一切残さない', () => {
    const html = markdownToSafeHtml('# 見出し\n\n```js\nconst a = 1\n```\n')

    // markdown-it はコードブロックに language-* の class を付けるが、落ちていること
    const els = elementsOf(html)
    expect(els.length).toBeGreaterThan(0)
    expect(els.every((e) => e.attributes.length === 0)).toBe(true)
  })

  it('ソース中の生 HTML はタグとして解釈しない', () => {
    const html = markdownToSafeHtml('<script>alert(1)</script>\n\n<b style="color:red">赤</b>\n')
    const els = elementsOf(html)

    // 要素としては生えていないこと（文字列としてエスケープされて残るのは問題ない）
    expect(els.map((e) => e.tagName.toLowerCase())).not.toContain('script')
    expect(els.map((e) => e.tagName.toLowerCase())).not.toContain('b')
    expect(els.every((e) => !e.hasAttribute('style'))).toBe(true)
    expect(html).toContain('&lt;script&gt;')
  })

  it('リンクは href だけ残す', () => {
    const html = markdownToSafeHtml('[例](https://example.com)')
    const anchors = elementsOf(html).filter((e) => e.tagName === 'A')

    expect(anchors).toHaveLength(1)
    expect(anchors[0].getAttribute('href')).toBe('https://example.com')
    // href 以外の属性は付いていないこと
    expect(anchors[0].attributes).toHaveLength(1)
  })

  it('危険なスキームのリンクは生成しない', () => {
    for (const source of ['[危険](javascript:alert(1))', '[危険](data:text/html,<script>)']) {
      const html = markdownToSafeHtml(source)
      const hrefs = elementsOf(html)
        .filter((e) => e.tagName === 'A')
        .map((e) => e.getAttribute('href') ?? '')

      expect(hrefs.some((h) => h.startsWith('javascript:') || h.startsWith('data:'))).toBe(false)
      // 文章としての中身は残っていること
      expect(html).toContain('危険')
    }
  })

  it('許可していないタグは中身を残して外側だけ剥がす', () => {
    // 表は許可タグに入れていない。中身の文字は消えず、タグだけ落ちること
    const html = markdownToSafeHtml('| A | B |\n| --- | --- |\n| 1 | 2 |\n')

    expect(html).not.toContain('<table')
    expect(html).not.toContain('<td')
    expect(html).toContain('A')
    expect(html).toContain('1')
  })

  it('空の入力では空文字を返す', () => {
    expect(markdownToSafeHtml('')).toBe('')
  })
})
