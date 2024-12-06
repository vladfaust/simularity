pub mod create;
pub use create::create;

pub mod decode;
pub use decode::decode;

pub mod destroy;
pub use destroy::destroy;

pub mod infer;
pub use infer::infer;

pub mod token_length;
pub use token_length::token_length;

use crate::ffi;

/// Check if a session exists and is not expired.
/// If the session exists, prolong its expiration time.
pub fn touch(session_id: u32) -> bool {
    unsafe { ffi::simularity_gpt_touch(session_id) }
}
