use data_encoding::HEXLOWER;
use ring::digest::{Context, Digest, SHA256};
use std::fs::File;
use std::io::{BufReader, Read};

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

/// Calculates the SHA-256 hash of the given file.
#[tauri::command]
pub async fn file_sha256(path: String) -> Result<String, tauri::InvokeError> {
    println!("file_sha256(path: {})", path);

    let file = File::open(&path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let digest = sha256_digest(reader).map_err(|e| e.to_string())?;

    Ok(HEXLOWER.encode(digest.as_ref()))
}

fn sha256_digest<R: Read>(mut reader: R) -> Result<Digest, std::io::Error> {
    let mut context = Context::new(&SHA256);
    let mut buffer = [0; 1024];

    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        context.update(&buffer[..count]);
    }

    Ok(context.finish())
}
