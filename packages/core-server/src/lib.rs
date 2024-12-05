use pyo3::{exceptions::PyValueError, prelude::*, types::PyTuple};

#[pyclass]
pub struct ModelInfo {
    #[pyo3(get)]
    pub n_params: u64,
    #[pyo3(get)]
    pub size: u64,
    #[pyo3(get)]
    pub n_ctx_train: i64,
}

#[pyclass]
#[derive(Clone)]
pub struct Dynatemp {
    pub range: Option<f32>,
    pub exponent: Option<f32>,
}

#[pymethods]
impl Dynatemp {
    #[new]
    #[pyo3(signature = (range=None, exponent=None))]
    fn new(range: Option<f32>, exponent: Option<f32>) -> Self {
        Dynatemp { range, exponent }
    }
}

#[pyclass]
#[derive(Clone)]
pub struct Penalty {
    pub last_n: Option<i32>,
    pub repeat: Option<f32>,
    pub freq: Option<f32>,
    pub present: Option<f32>,
    pub penalize_nl: Option<bool>,
}

#[pymethods]
impl Penalty {
    #[new]
    #[pyo3(signature = (last_n=None, repeat=None, freq=None, present=None, penalize_nl=None))]
    fn new(
        last_n: Option<i32>,
        repeat: Option<f32>,
        freq: Option<f32>,
        present: Option<f32>,
        penalize_nl: Option<bool>,
    ) -> Self {
        Penalty {
            last_n,
            repeat,
            freq,
            present,
            penalize_nl,
        }
    }
}

#[pyclass]
#[derive(Clone)]
pub struct Mirostat {
    pub version: String, // "v1" or "v2".
    pub tau: Option<f32>,
    pub eta: Option<f32>,
}

#[pymethods]
impl Mirostat {
    #[new]
    #[pyo3(signature = (version, tau=None, eta=None))]
    fn new(version: String, tau: Option<f32>, eta: Option<f32>) -> Self {
        Mirostat { version, tau, eta }
    }
}

#[pyclass]
#[derive(Clone)]
pub struct InferenceOptions {
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
    pub lua_grammar: Option<String>,
}

#[pymethods]
impl InferenceOptions {
    #[new]
    #[allow(clippy::too_many_arguments)]
    #[pyo3(signature = (n_prev=None, n_probs=None, min_keep=None, top_k=None, top_p=None, min_p=None, tfs_z=None, typical_p=None, temp=None, dynatemp=None, penalty=None, mirostat=None, seed=None, grammar=None, stop_sequences=None, lua_grammar=None))]
    fn new(
        n_prev: Option<i32>,
        n_probs: Option<i32>,
        min_keep: Option<i32>,
        top_k: Option<i32>,
        top_p: Option<f32>,
        min_p: Option<f32>,
        tfs_z: Option<f32>,
        typical_p: Option<f32>,
        temp: Option<f32>,
        dynatemp: Option<&Dynatemp>,
        penalty: Option<&Penalty>,
        mirostat: Option<&Mirostat>,
        seed: Option<u32>,
        grammar: Option<String>,
        stop_sequences: Option<Vec<String>>,
        lua_grammar: Option<String>,
    ) -> Self {
        InferenceOptions {
            n_prev,
            n_probs,
            min_keep,
            top_k,
            top_p,
            min_p,
            tfs_z,
            typical_p,
            temp,
            dynatemp: dynatemp.cloned(),
            penalty: penalty.cloned(),
            mirostat: mirostat.cloned(),
            seed,
            grammar,
            stop_sequences,
            lua_grammar,
        }
    }
}

#[pyclass]
pub struct InferenceResult {
    #[pyo3(get)]
    pub result: String,
    #[pyo3(get)]
    pub context_length: u32,
}

/// Initialize the core server.
#[pyfunction]
#[pyo3(signature = (gpt_sessions_ttl=None, gpt_sessions_max=None))]
fn init(gpt_sessions_ttl: Option<u32>, gpt_sessions_max: Option<u32>) -> PyResult<()> {
    simularity_core::init(gpt_sessions_ttl, gpt_sessions_max);
    Ok(())
}

/// Load a model from a file.
#[pyfunction]
fn model_load(model_path: &str, model_id: &str) -> PyResult<ModelInfo> {
    let result = simularity_core::model_load(model_path, model_id, None::<fn(_) -> bool>);

    if let Ok(r) = result {
        Ok(ModelInfo {
            n_params: r.n_params,
            size: r.size,
            n_ctx_train: r.n_ctx_train,
        })
    } else {
        Err(PyErr::new::<PyValueError, _>(format!("{:?}", result.err())))
    }
}

/// Create a GPT session.
///
/// # Arguments
///
/// * `progress_callback` - Python function that will be called with the progress (float), expects a bool return value.
#[pyfunction]
#[pyo3(signature = (model_id, context_size=None, batch_size=None, initial_prompt=None, state_file_path=None, progress_callback=None))]
fn gpt_create(
    py: Python,
    model_id: &str,
    context_size: Option<u32>,
    batch_size: Option<u32>,
    initial_prompt: Option<&str>,
    state_file_path: Option<&str>,
    progress_callback: Option<PyObject>,
) -> PyResult<u32> {
    let result = simularity_core::gpt::create(
        model_id,
        context_size,
        batch_size,
        initial_prompt,
        state_file_path,
        progress_callback.map(|cb| {
            move |progress| {
                cb.call1(py, PyTuple::new(py, vec![progress]).unwrap())
                    .unwrap()
                    .is_truthy(py)
                    .unwrap()
            }
        }),
    );

    if let Ok(r) = result {
        Ok(r)
    } else {
        Err(PyErr::new::<PyValueError, _>(format!("{:?}", result.err())))
    }
}

/// Check if a session exists and is not expired.
/// If the session exists, prolong its expiration time.
#[pyfunction]
fn gpt_touch(session_id: u32) -> PyResult<bool> {
    Ok(simularity_core::gpt::touch(session_id))
}

/// Get the length of the prompt in tokens.
#[pyfunction]
fn gpt_token_length(model_id: &str, prompt: &str) -> PyResult<u32> {
    let result = simularity_core::gpt::token_length(model_id, prompt);

    if let Ok(r) = result {
        Ok(r)
    } else {
        Err(PyErr::new::<PyValueError, _>(format!("{:?}", result.err())))
    }
}

/// # Arguments
///
/// * `inference_callback` - Python function that will be called with the inference result (str), expects a bool return value.
#[pyfunction]
#[pyo3(signature = (session_id, n_eval, prompt, options=None, inference_callback=None))]
fn gpt_infer(
    py: Python,
    session_id: u32,
    n_eval: u32,
    prompt: &str,
    options: Option<&InferenceOptions>,
    inference_callback: Option<PyObject>,
) -> PyResult<InferenceResult> {
    let mut resulting_string = String::new();

    let inference_callback = |s: &str| {
        resulting_string.push_str(s);

        if let Some(cb) = &inference_callback {
            cb.call1(py, PyTuple::new(py, vec![s]).unwrap())
                .unwrap()
                .is_truthy(py)
                .unwrap()
        } else {
            true
        }
    };

    let result =
        simularity_core::gpt::infer(
            session_id,
            Some(prompt),
            n_eval,
            options.map(|options| simularity_core::gpt::infer::Options {
                n_prev: options.n_prev,
                n_probs: options.n_probs,
                min_keep: options.min_keep,
                top_k: options.top_k,
                top_p: options.top_p,
                min_p: options.min_p,
                tfs_z: options.tfs_z,
                typical_p: options.typical_p,
                temp: options.temp,
                dynatemp: options.dynatemp.as_ref().map(|d| {
                    simularity_core::gpt::infer::Dynatemp {
                        range: d.range,
                        exponent: d.exponent,
                    }
                }),
                penalty: options
                    .penalty
                    .as_ref()
                    .map(|p| simularity_core::gpt::infer::Penalty {
                        last_n: p.last_n,
                        repeat: p.repeat,
                        freq: p.freq,
                        present: p.present,
                        penalize_nl: p.penalize_nl,
                    }),
                mirostat: options.mirostat.as_ref().map(|m| {
                    simularity_core::gpt::infer::Mirostat {
                        version: match m.version.as_str() {
                            "v1" => simularity_core::gpt::infer::MirostatVersion::V1,
                            "v2" => simularity_core::gpt::infer::MirostatVersion::V2,
                            _ => panic!("Invalid Mirostat version"),
                        },
                        tau: m.tau,
                        eta: m.eta,
                    }
                }),
                seed: options.seed,
                grammar: options.grammar.clone(),
                stop_sequences: options.stop_sequences.clone(),
                lua_grammar: options.lua_grammar.clone(),
            }),
            None::<fn(_) -> bool>,
            Some(inference_callback),
        );

    if let Ok(context_length) = result {
        Ok(InferenceResult {
            result: resulting_string,
            context_length,
        })
    } else {
        Err(PyErr::new::<PyValueError, _>(format!("{:?}", result.err())))
    }
}

/// A Python module implemented in Rust. The name of this function must match
/// the `lib.name` setting in the `Cargo.toml`, else Python will not be able to
/// import the module.
#[pymodule]
fn simularity_core_server(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(init, m)?)?;
    m.add_function(wrap_pyfunction!(model_load, m)?)?;
    m.add_function(wrap_pyfunction!(gpt_create, m)?)?;
    m.add_function(wrap_pyfunction!(gpt_touch, m)?)?;
    m.add_function(wrap_pyfunction!(gpt_token_length, m)?)?;
    m.add_class::<Dynatemp>()?;
    m.add_class::<Penalty>()?;
    m.add_class::<Mirostat>()?;
    m.add_class::<InferenceOptions>()?;
    m.add_function(wrap_pyfunction!(gpt_infer, m)?)?;
    Ok(())
}
