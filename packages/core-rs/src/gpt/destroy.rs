use crate::ffi;

#[derive(Debug, Clone)]
pub enum Error {
    SessionNotFound,
    Unknown(i32),
}

/// Destroy a GPT session.
///
/// # Arguments
/// * `session_id` - GPT session ID.
///
pub fn destroy(session_id: u32) -> Result<(), Error> {
    let result = unsafe { ffi::simularity_gpt_destroy(session_id) };

    match result {
        -1 => Err(Error::SessionNotFound),
        x if x > 0 => Ok(()),
        x => Err(Error::Unknown(x)),
    }
}
