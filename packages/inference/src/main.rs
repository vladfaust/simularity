#![feature(let_chains)]

mod env;
mod heartbeat;
mod server;

#[tokio::main(flavor = "multi_thread", worker_threads = 2)]
async fn main() {
    if let Some(err) = dotenvy::dotenv().err() {
        eprintln!("Failed to load .env file: {}", err);
    }

    // Set default log level to info if not set.
    if std::env::var("RUST_LOG").is_err() {
        unsafe { std::env::set_var("RUST_LOG", "debug,hyper_util::client::legacy=info") }
    }

    env_logger::builder()
        .format_timestamp(None)
        .format_module_path(true)
        .format_target(false)
        .init();

    let server = tokio::spawn(server::run_server());
    let heartbeat = tokio::spawn(heartbeat::run_heartbeat());

    tokio::try_join!(server, heartbeat).unwrap();
}
