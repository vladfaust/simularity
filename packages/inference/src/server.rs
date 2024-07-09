use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use log::info;
use std::sync::Arc;

use crate::env::ENV;

mod gpts;

pub struct AppState {
    gpt: gpts::GptState,
}

fn init_state() -> Arc<AppState> {
    Arc::new(AppState {
        gpt: gpts::GptState::new(),
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
    simularity_core::init(
        Some(ENV.simularity_gpt_session_ttl.try_into().unwrap()),
        Some(ENV.simularity_gpt_session_max.try_into().unwrap()),
    );

    let app = Router::new()
        .route("/", get(|| async { "OK" }))
        .merge(gpts::router())
        .with_state(init_state());

    let addr = format!("{}:{}", ENV.host, ENV.port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    info!("Listening on: http://{addr}");

    axum::serve(listener, app).await.unwrap();
}
