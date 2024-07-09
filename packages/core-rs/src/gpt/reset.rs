use crate::ffi;

#[derive(Debug, Clone)]
pub enum Error {
    SessionNotFound,
    Unknown(i32),
}

/// Reset the context of the GPT session to the initial prompt.
///
/// # Arguments
/// * `session_id` - GPT session ID.
///
/// # Returns
/// New context length.
///
pub fn reset(session_id: u32) -> Result<u32, Error> {
    let result = unsafe { ffi::simularity_gpt_reset(session_id) };

    match result {
        -1 => Err(Error::SessionNotFound),
        x if x > 0 => Ok(result as u32),
        x => Err(Error::Unknown(x)),
    }
}
