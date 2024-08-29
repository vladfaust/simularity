// See https://github.com/tauri-apps/plugins-workspace/issues/999#issuecomment-1965624559.
#[cfg(not(target_os = "linux"))]
/// Opens the file manager at the given path.
#[tauri::command]
pub async fn file_manager_open(path: String) -> Result<(), tauri::InvokeError> {
    println!("file_manager_open(path: {})", path);
    use std::{path::PathBuf, process::Command};

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path]) // The comma after select is not a typo
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        let path_buf = PathBuf::from(&path);

        if path_buf.is_dir() {
            Command::new("open")
                .args([&path])
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("open")
                .args(["-R", &path])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
