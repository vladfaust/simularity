use crate::sqlite::SqliteValue;
use crate::AppState;
use rusqlite::types::FromSql;

struct RusqliteError(rusqlite::Error);

impl std::convert::From<RusqliteError> for tauri::InvokeError {
    fn from(val: RusqliteError) -> Self {
        tauri::InvokeError::from(format!("Sqlite error: {}", val.0))
    }
}

/// Open an SQLite connection.
/// The application will hold the connection until it is closed.
#[tauri::command]
pub async fn sqlite_open(
    uri: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    let conn = Box::new(rusqlite::Connection::open(&uri).map_err(RusqliteError)?);
    state.sqlite_connections.lock().await.insert(uri, conn);
    Ok(())
}

/// Execute an SQLite query that does not return rows.
#[tauri::command]
pub async fn sqlite_execute(
    uri: &str,
    sql: &str,
    params: Vec<SqliteValue>,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    println!("sqlite_execute: {} {:?}", sql, params);

    let lock = state.sqlite_connections.lock().await;
    let conn = lock
        .get(uri)
        .ok_or(tauri::InvokeError::from("connection not found"))?;

    let params = rusqlite::params_from_iter(params);
    conn.execute(sql, params).map_err(RusqliteError)?;

    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    columns: Vec<String>,
    rows: Vec<Vec<SqliteValue>>,
}

impl QueryResult {
    fn new(columns: Vec<String>, rows: Vec<Vec<SqliteValue>>) -> Self {
        Self { columns, rows }
    }
}

/// Execute an SQLite query.
#[tauri::command]
pub async fn sqlite_query(
    uri: &str,
    sql: &str,
    params: Vec<SqliteValue>,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResult, tauri::InvokeError> {
    println!("sqlite_query: {} {:?}", sql, params);

    let lock = state.sqlite_connections.lock().await;
    let conn = lock
        .get(uri)
        .ok_or(tauri::InvokeError::from("connection not found"))?;

    let mut stmt = conn.prepare(sql).map_err(RusqliteError)?;
    let column_count = stmt.column_count();

    // Clone the vec to avoid borrowing issues.
    let column_names = stmt
        .column_names()
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<String>>();

    let params = rusqlite::params_from_iter(params);
    let mut rows = stmt.query(params).map_err(RusqliteError)?;

    let mut result: Vec<Vec<SqliteValue>> = Vec::new();

    while let Some(row) = rows.next().map_err(RusqliteError)? {
        let mut columns: Vec<SqliteValue> = Vec::new();

        for i in 0..column_count {
            let value = SqliteValue::column_result(row.get_ref_unwrap(i)).map_err(|e| {
                tauri::InvokeError::from(format!(
                    "SQLite error converting column {}: {}",
                    column_names[i], e
                ))
            })?;

            columns.push(value);
        }

        result.push(columns);
    }

    Ok(QueryResult::new(column_names, result))
}

/// Close an SQLite connection.
#[tauri::command]
pub async fn sqlite_close(
    uri: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), tauri::InvokeError> {
    let _ = state
        .sqlite_connections
        .lock()
        .await
        .remove(&uri)
        .ok_or(tauri::InvokeError::from("connection not found"))?;

    Ok(())
}
