use std::ffi::{c_void, CString};

use crate::ffi;

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dynatemp {
    pub range: Option<f32>,
    pub exponent: Option<f32>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Penalty {
    pub last_n: Option<i32>,
    pub repeat: Option<f32>,
    pub freq: Option<f32>,
    pub present: Option<f32>,
    pub penalize_nl: Option<bool>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MirostatVersion {
    V1,
    V2,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mirostat {
    pub version: MirostatVersion,
    pub tau: Option<f32>,
    pub eta: Option<f32>,
}

#[derive(Default, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    pub n_prev: Option<i32>,
    pub n_probs: Option<i32>,
    pub min_keep: Option<i32>,
    pub top_k: Option<i32>,
    pub top_p: Option<f32>,
    pub min_p: Option<f32>,
    pub tfs_z: Option<f32>,
    pub typical_p: Option<f32>,
    pub temp: Option<f32>,
    pub dynatemp: Option<Dynatemp>,
    pub penalty: Option<Penalty>,
    pub mirostat: Option<Mirostat>,
    pub seed: Option<u32>,
    pub grammar: Option<String>,
    pub stop_sequences: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
pub enum Error {
    SessionNotFound,
    ContextOverflow,
    Unknown(i32),
}

/// Infer the GPT session with the given prompt.
/// Clears the uncommitted prompt.
///
/// # Arguments
///
/// * `session_id` - GPT session ID.
/// * `prompt` - Prompt to infer. May be `None`.
/// * `n_eval` - Number of tokens to decode.
/// * `options` - Inference options.
/// * `decode_progress_callback` - Decode progress callback.
///   Return `true` to continue, or `false` to cancel (not implemented yet).
/// * `inference_callback` - Inference callback.
///   Return `true` to continue, or `false` to cancel.
///
/// # Returns
/// Number of tokens decoded.
///
pub fn infer(
    session_id: u32,
    prompt: Option<&str>,
    n_eval: u32,
    options: Option<Options>,
    mut decode_progress_callback: Option<impl FnMut(f32) -> bool>,
    mut inference_callback: Option<impl FnMut(&str) -> bool>,
) -> Result<u32, Error> {
    let prompt = prompt.map(|p| CString::new(p).unwrap());

    let decode_user_data = if let Some(cb) = decode_progress_callback.as_mut() {
        let mut user_data: &mut dyn FnMut(f32) -> bool = cb;
        &mut user_data as *mut _ as *mut c_void
    } else {
        std::ptr::null_mut()
    };

    let inference_user_data = if let Some(cb) = inference_callback.as_mut() {
        let mut user_data: &mut dyn FnMut(&str) -> bool = cb;
        &mut user_data as *mut _ as *mut c_void
    } else {
        std::ptr::null_mut()
    };

    let mut converted_options = convert_options(options.clone());
    let mut grammar_ptr: Option<*mut i8> = None;
    let mut sequence_ptrs: Option<Vec<*mut i8>> = None;

    if let Some(options) = options.clone() {
        if let Some(grammar) = options.grammar {
            let ptr = CString::new(grammar).unwrap().into_raw();
            grammar_ptr = Some(ptr);
            converted_options.grammar = ptr;
        }

        if let Some(stop_sequences) = options.stop_sequences {
            let ptrs = stop_sequences
                .iter()
                .map(|s| CString::new(s.as_str()).unwrap().into_raw())
                .collect::<Vec<_>>();

            // From Vec<*mut i8> to *const *const i8.
            converted_options.stop_sequences = ptrs.as_ptr() as *const *const i8;
            converted_options.stop_sequences_len = ptrs.len() as u32;

            sequence_ptrs = Some(ptrs);
        }
    }

    println!("converted_options: {:?}", converted_options);

    let result = unsafe {
        ffi::simularity_gpt_infer(
            session_id,
            prompt.as_ref().map_or(std::ptr::null(), |p| p.as_ptr()),
            n_eval,
            converted_options,
            if decode_progress_callback.is_some() {
                Some(ffi::progress_callback_wrapper)
            } else {
                None
            },
            decode_user_data,
            if inference_callback.is_some() {
                Some(ffi::inference_callback_wrapper)
            } else {
                None
            },
            inference_user_data,
        )
    };

    if let Some(grammar_ptr) = grammar_ptr {
        // Drop the CString.
        let _ = unsafe { CString::from_raw(grammar_ptr) };
    }

    if let Some(sequence_ptrs) = sequence_ptrs {
        for ptr in sequence_ptrs {
            // Drop the CString.
            let _ = unsafe { CString::from_raw(ptr) };
        }
    }

    match result {
        -1 => Err(Error::SessionNotFound),
        -2 => Err(Error::ContextOverflow),
        x if x > 0 => Ok(result as u32),
        x => Err(Error::Unknown(x)),
    }
}

fn convert_options(options: Option<Options>) -> ffi::SimularityGptInferenceOptions {
    let mut result = unsafe { ffi::simularity_gpt_inference_options_default() };

    if let Some(options) = options {
        if let Some(n_prev) = options.n_prev {
            result.n_prev = n_prev;
        }

        if let Some(n_probs) = options.n_probs {
            result.n_probs = n_probs;
        }

        if let Some(min_keep) = options.min_keep {
            result.min_keep = min_keep;
        }

        if let Some(top_k) = options.top_k {
            result.top_k = top_k;
        }

        if let Some(top_p) = options.top_p {
            result.top_p = top_p;
        }

        if let Some(min_p) = options.min_p {
            result.min_p = min_p;
        }

        if let Some(tfs_z) = options.tfs_z {
            result.tfs_z = tfs_z;
        }

        if let Some(typical_p) = options.typical_p {
            result.typical_p = typical_p;
        }

        if let Some(temp) = options.temp {
            result.temp = temp;
        }

        if let Some(seed) = options.seed {
            result.seed = seed;
        }

        if let Some(dynatemp) = options.dynatemp {
            if let Some(range) = dynatemp.range {
                result.dynatemp_range = range;
            }

            if let Some(exponent) = dynatemp.exponent {
                result.dynatemp_exponent = exponent;
            }
        }

        if let Some(penalty) = options.penalty {
            if let Some(last_n) = penalty.last_n {
                result.penalty_last_n = last_n;
            }

            if let Some(repeat) = penalty.repeat {
                result.penalty_repeat = repeat;
            }

            if let Some(freq) = penalty.freq {
                result.penalty_freq = freq;
            }

            if let Some(present) = penalty.present {
                result.penalty_present = present;
            }

            if let Some(penalize_nl) = penalty.penalize_nl {
                result.penalize_nl = penalize_nl;
            }
        }

        if let Some(mirostat) = options.mirostat {
            result.mirostat = match mirostat.version {
                MirostatVersion::V1 => 1,
                MirostatVersion::V2 => 2,
            };

            if let Some(tau) = mirostat.tau {
                result.mirostat_tau = tau;
            }

            if let Some(eta) = mirostat.eta {
                result.mirostat_eta = eta;
            }
        }
    }

    result
}
