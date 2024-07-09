use crate::ffi;

#[derive(Debug, Clone)]
pub enum Error {
    SessionNotFound,
    Unknown(i32),
}

/// Commit the uncommitted prompt (e.g. after `infer`).
///
/// # Arguments
/// * `session_id` - GPT session ID.
///
/// # Returns
/// New context length.
///
pub fn commit(session_id: u32) -> Result<u32, Error> {
    let result = unsafe { ffi::simularity_gpt_commit(session_id) };

    match result {
        -1 => Err(Error::SessionNotFound),
        x if x > 0 => Ok(result as u32),
        x => Err(Error::Unknown(x)),
    }
}
