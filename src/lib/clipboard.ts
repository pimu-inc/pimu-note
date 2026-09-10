import MarkdownIt from 'markdown-it'

/**
 * 要件 F-301〜F-306。
 *
 * このアプリの中核。クリップボードには
 *   - プレーンテキスト = 加工していない Markdown ソース（F-302）
 *   - HTML = 構造タグだけの、スタイルを一切持たない HTML（F-303 / F-304）
 * の 2 つを載せる。貼り先が ⌘V なら書式付き、⌘⇧V ならソースを取り出せる。
 *
 * HTML に色やフォントが混じると、Gmail などに貼ったときアプリの見た目ごと
 * 持ち込まれてしまう。そのためタグは許可制にし、属性は原則すべて落とす。
 */

const md = new MarkdownIt({
  // ソース中の生 HTML は解釈せずエスケープする。
  // 解釈すると、書いた覚えのないタグがそのまま貼り先に流れる余地ができる。
  html: false,
  linkify: false,
  breaks: false,
})

/**
 * 貼り先に持ち込んでよいタグ。
 *
 * 要件で挙がっている構造タグに加えて、段落と改行と水平線と打ち消しを許可する。
 * markdown-it が段落を `<p>` で出すため、これがないと文が全部つながる。
 */
const ALLOWED_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'hr',
  'strong',
  'em',
  'del',
  'ul',
  'ol',
  'li',
  'code',
  'pre',
  'blockquote',
  'a',
])

/** リンク先として許可するスキーム。javascript: などを弾く */
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:']

function isSafeHref(value: string): boolean {
  try {
    // 相対 URL は貼り先で意味を持たないので、絶対 URL だけを通す
    const url = new URL(value)
    return SAFE_SCHEMES.includes(url.protocol)
  } catch {
    return false
  }
}

/**
 * 許可タグ以外を外し、属性を落とす。
 *
 * 許可されていないタグは中身を残して外側だけ剥がす（unwrap）。
 * まるごと消すと文章が欠けてしまうため。
 */
function sanitizeElement(root: Element): void {
  for (const child of [...root.children]) {
    sanitizeElement(child)

    const tag = child.tagName.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) {
      child.replaceWith(...child.childNodes)
      continue
    }

    for (const attr of [...child.attributes]) {
      const keepHref = tag === 'a' && attr.name === 'href' && isSafeHref(attr.value)
      if (!keepHref) child.removeAttribute(attr.name)
    }
  }
}

/** Markdown を、スタイルを持たない HTML に変換する */
export function markdownToSafeHtml(source: string): string {
  const rendered = md.render(source)
  const doc = new DOMParser().parseFromString(`<body>${rendered}</body>`, 'text/html')
  sanitizeElement(doc.body)
  return doc.body.innerHTML.trim()
}
