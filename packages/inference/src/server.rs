use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use log::info;
use std::sync::Arc;

mod gpts;

pub struct AppState {
    gpt: gpts::GptState,
}

fn init_state(model_path: &str) -> Arc<AppState> {
    Arc::new(AppState {
        gpt: gpts::GptState::new(model_path),
    })
}

// Make our own error that wraps `anyhow::Error`.
struct AppError(anyhow::Error);

// Tell axum how to convert `AppError` into a response.
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Something went wrong: {}", self.0),
        )
            .into_response()
    }
}

// This enables using `?` on functions that return `Result<_, anyhow::Error>` to turn them into
// `Result<_, AppError>`. That way you don't need to do that manually.
impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(err: E) -> Self {
        Self(err.into())
    }
}

pub async fn run_server() {
    let model_path =
        std::env::var("GPT_MODEL_PATH").expect("GPT_MODEL_PATH env variable is not set");

    let app = Router::new()
        .route("/", get(|| async { "OK" }))
        .merge(gpts::router())
        .with_state(init_state(model_path.as_str()));

    let host = std::env::var("HOST").expect("HOST env variable is not set");
    let port = std::env::var("PORT").expect("PORT env variable is not set");
    let addr = format!("{}:{}", host, port);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    info!("Listening on: http://{addr}");

    axum::serve(listener, app).await.unwrap();
}
