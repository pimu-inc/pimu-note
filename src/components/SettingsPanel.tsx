import ShortcutRecorder from './ShortcutRecorder'
import { formatAccelerator } from '../lib/accelerator'
import type { CopyMode, ThemePreference } from '../lib/settings'

type Props = {
  dir: string
  onChangeDir: () => void
  copyMode: CopyMode
  onChangeCopyMode: (mode: CopyMode) => void
  theme: ThemePreference
  onChangeTheme: (theme: ThemePreference) => void
  shortcut: string
  onChangeShortcut: (accelerator: string) => void
  onResetShortcut: () => void
  shortcutError: string | null
  onClose: () => void
}

export default function SettingsPanel({
  dir,
  onChangeDir,
  copyMode,
  onChangeCopyMode,
  theme,
  onChangeTheme,
  shortcut,
  onChangeShortcut,
  onResetShortcut,
  shortcutError,
  onClose,
}: Props) {
  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings"
        role="dialog"
        aria-label="設定"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-header">
          <h2>設定</h2>
          <button className="ghost" onClick={onClose}>
            閉じる
          </button>
        </header>

        <section className="settings-section">
          <h3>保存先フォルダ</h3>
          <p className="settings-value">{dir}</p>
          <button className="ghost" onClick={onChangeDir}>
            変更…
          </button>
          <p className="settings-help">
            iCloud Drive や Google Drive の中を指定すると、端末をまたいで同期できます。
          </p>
        </section>

        <section className="settings-section">
          <h3>コピーの挙動</h3>
          <label className="settings-choice">
            <input
              type="radio"
              name="copyMode"
              checked={copyMode === 'both'}
              onChange={() => onChangeCopyMode('both')}
            />
            <span>
              <strong>書式付きとプレーンの両方</strong>
              <em>
                貼り先で ⌘V なら書式付き、⌘⇧V なら Markdown のソース。ふだんはこちら。
              </em>
            </span>
          </label>
          <label className="settings-choice">
            <input
              type="radio"
              name="copyMode"
              checked={copyMode === 'plain'}
              onChange={() => onChangeCopyMode('plain')}
            />
            <span>
              <strong>常にプレーンのみ</strong>
              <em>
                書式が意図せず持ち込まれるのを完全に防ぎます。貼り先では常に Markdown
                のソースになります。
              </em>
            </span>
          </label>
          <p className="settings-help">
            この設定にかかわらず、⌘⇧C はいつでもプレーンのみをコピーします。
          </p>
        </section>

        <section className="settings-section">
          <h3>外観</h3>
          <div className="settings-segmented">
            {(
              [
                ['system', 'システムに追従'],
                ['light', 'ライト'],
                ['dark', 'ダーク'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={theme === value ? 'is-active' : 'ghost'}
                onClick={() => onChangeTheme(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>呼び出しのホットキー</h3>
          <ShortcutRecorder
            value={shortcut}
            onRecord={onChangeShortcut}
            onReset={onResetShortcut}
          />
          {shortcutError ? <p className="settings-error">{shortcutError}</p> : null}
          <p className="settings-help">
            他のアプリを使っているときでも、このキーで pimu-note を呼び出せます。
          </p>
        </section>

        <section className="settings-section">
          <h3>そのほかのショートカット</h3>
          <dl className="settings-keys">
            <dt>{formatAccelerator(shortcut)}</dt>
            <dd>どこからでも pimu-note を呼び出す</dd>
            <dt>⌘N</dt>
            <dd>新規ノート</dd>
            <dt>⌘C</dt>
            <dd>コピー（上の設定に従う）</dd>
            <dt>⌘⇧C</dt>
            <dd>プレーンのみコピー</dd>
            <dt>⌘B / ⌘I / ⌘E</dt>
            <dd>太字 / 斜体 / インラインコード</dd>
          </dl>
        </section>
      </div>
    </div>
  )
}
