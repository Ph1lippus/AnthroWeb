/// AnthroWeb Tauri desktop application library.
/// Provides the main entry point for the Tauri backend.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
