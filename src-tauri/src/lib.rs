use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_fs::FsExt;

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// F-501: 既定のホットキー。設定から変更できる（F-501a）。
#[cfg(desktop)]
const DEFAULT_SHORTCUT: &str = "CommandOrControl+Alt+N";

/// いま登録されているホットキー。差し替えのために覚えておく。
#[cfg(desktop)]
struct ToggleShortcut(Mutex<Shortcut>);

/// 要件 F-402 / F-403。
///
/// Tauri のファイルシステムスコープは tauri.conf.json で静的に決まるのが基本だが、
/// 保存先フォルダは利用者が後から変えられる必要がある。
/// そこで、選ばれたフォルダを実行時にスコープへ追加する。
/// 起動時にも保存済みの設定を読んでここを呼び直すこと。
#[tauri::command]
fn allow_notes_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(&path, true)
        .map_err(|e| format!("保存先フォルダを許可できませんでした: {e}"))
}

/// 取り込み・書き出しで扱ってよい拡張子。
///
/// ドロップされたファイルも書き出し先も、ノートの保存先フォルダの外にある。
/// fs プラグインのスコープでは扱えないため専用のコマンドを置くが、
/// そのぶん何でも読み書きできてしまわないよう拡張子で絞る。
const IMPORTABLE_EXTENSIONS: [&str; 3] = ["md", "markdown", "txt"];

fn check_extension(path: &std::path::Path) -> Result<(), String> {
    let ok = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| IMPORTABLE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false);

    if ok {
        Ok(())
    } else {
        Err("Markdown またはテキストファイル（.md / .markdown / .txt）だけ扱えます".into())
    }
}

/// 要件 F-405。ドロップされた Markdown を読み込む。
#[tauri::command]
fn read_markdown_file(path: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(path);
    check_extension(&path)?;
    std::fs::read_to_string(&path).map_err(|e| format!("ファイルを読めませんでした: {e}"))
}

/// 要件 F-406。ノートを任意の場所に書き出す。
#[tauri::command]
fn write_markdown_file(path: String, content: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(path);
    check_extension(&path)?;
    std::fs::write(&path, content).map_err(|e| format!("ファイルを書き出せませんでした: {e}"))
}

/// 要件 F-501c。ホットキーを押したときのウィンドウの振る舞い。
///
/// 「見えているかどうか」だけで判定すると、ウィンドウが背面に開いたままのときに
/// 1回目の押下が「隠す」に化けてしまい、利用者からは 2 回押さないと出てこないように見える。
/// 可視状態とフォーカス状態を分けて 3 通りで判定する。
#[cfg(desktop)]
fn toggle_main_window(window: &tauri::WebviewWindow) {
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);

    if !visible {
        // 隠れている → 出して前面に
        let _ = window.show();
        let _ = window.set_focus();
    } else if !focused {
        // 見えてはいるが背面 → 前面に持ってくるだけ（隠さない）
        let _ = window.set_focus();
    } else {
        // すでに最前面 → しまう
        let _ = window.hide();
    }
}

/// 要件 F-501a / F-501b。ホットキーを差し替える。
///
/// 新しいものを先に登録し、成功してから古いものを解除する。
/// 逆順にすると、登録に失敗したときにホットキーが一つも無い状態になってしまう。
#[cfg(desktop)]
#[tauri::command]
fn set_toggle_shortcut(
    app: tauri::AppHandle,
    accelerator: String,
    state: tauri::State<'_, ToggleShortcut>,
) -> Result<(), String> {
    let next: Shortcut = accelerator
        .parse()
        .map_err(|_| format!("このキーの組み合わせは指定できません: {accelerator}"))?;

    let mut current = state.0.lock().unwrap();
    if *current == next {
        return Ok(());
    }

    let shortcuts = app.global_shortcut();
    shortcuts.register(next).map_err(|e| {
        // 他のアプリが既に使っている場合はここで失敗する（F-501b）
        format!("このキーの組み合わせは登録できませんでした。他のアプリが使っている可能性があります（{e}）")
    })?;

    let _ = shortcuts.unregister(*current);
    *current = next;
    Ok(())
}

#[cfg(desktop)]
fn default_shortcut() -> Shortcut {
    DEFAULT_SHORTCUT
        .parse()
        .unwrap_or_else(|_| Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyN))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build());

    #[cfg(desktop)]
    {
        // F-504: ウィンドウの位置とサイズを覚えて復元する
        builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

        builder = builder
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcut(default_shortcut())
                    .expect("既定のホットキーを登録できませんでした")
                    // 登録しているホットキーは常に 1 つだけなので、
                    // どれが来たかを見分ける必要はない
                    .with_handler(|app, _shortcut, event| {
                        if event.state() != ShortcutState::Pressed {
                            return;
                        }
                        match app.get_webview_window("main") {
                            Some(window) => toggle_main_window(&window),
                            None => log::error!("main ウィンドウが見つかりません"),
                        }
                    })
                    .build(),
            )
            .manage(ToggleShortcut(Mutex::new(default_shortcut())))
            .invoke_handler(tauri::generate_handler![
                allow_notes_dir,
                set_toggle_shortcut,
                read_markdown_file,
                write_markdown_file
            ]);
    }

    #[cfg(not(desktop))]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            allow_notes_dir,
            read_markdown_file,
            write_markdown_file
        ]);
    }

    let app = builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        // F-503: 閉じるボタンでアプリを終了させず、隠すだけにして常駐させる。
        // ホットキーから即座に復帰できるのが本アプリの前提のため。
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("アプリを初期化できませんでした");

    app.run(|app_handle, event| {
        // macOS で Dock アイコンをクリックしたときに届く。
        // F-503 で閉じるボタンをウィンドウの非表示に変えているため、
        // ここを処理しないと一度閉じたあとアイコンから戻れなくなる。
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } = event
        {
            if !has_visible_windows {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            let _ = (app_handle, event);
        }
    });
}
