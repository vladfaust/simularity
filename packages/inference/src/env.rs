#[derive(serde::Deserialize)]
pub struct Env {
    pub host: String,
    pub port: usize,
    pub node_id: String,
    pub node_base_url: String,
    pub api_base_url: String,
    pub api_secret: String,
    pub api_heartbeat: usize,
    pub simularity_model_id: String,
    pub simularity_model_path: String,
    pub simularity_model_context_size: usize,
    pub simularity_gpt_session_ttl: usize,
    pub simularity_gpt_session_max: usize,
}

impl Env {
    pub fn from_dotenv() -> Self {
        envy::from_env::<Self>().expect("Failed to parse environment variables")
    }
}

lazy_static::lazy_static! {
    pub static ref ENV: Env = Env::from_dotenv();
}
