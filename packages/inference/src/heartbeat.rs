use log::{debug, info};
use reqwest_middleware::{ClientBuilder, ClientWithMiddleware};
use reqwest_retry::{policies::ExponentialBackoff, RetryTransientMiddleware};
use std::collections::HashMap;

use crate::env::ENV;

/// Send a heartbeat to the API server.
// TODO: When the heartbeat fails due to node deregistration, re-register the node.
pub async fn run_heartbeat() {
    // Retry up to 3 times with increasing intervals between attempts.
    let retry_policy = ExponentialBackoff::builder().build_with_max_retries(10);

    // 1. POST /inference-nodes {id, ... }
    // 2. (Loop) HEAD /inference-nodes/{id}/heartbeat
    //

    let authorization_header = format!("Token {}", ENV.api_secret);

    let client = ClientBuilder::new(reqwest::Client::new())
        .with(RetryTransientMiddleware::new_with_policy(retry_policy))
        .build();

    register_node(
        &client,
        &ENV.api_base_url,
        &ENV.node_id,
        &authorization_header,
    )
    .await;

    let heartbeat_interval = std::time::Duration::from_secs(ENV.api_heartbeat as u64);
    let heartbeat_url = format!(
        "{}/inference-nodes/{}/heartbeat",
        ENV.api_base_url, ENV.node_id
    );

    loop {
        let result = client
            .head(&heartbeat_url)
            .header("Authorization", &authorization_header)
            .send()
            .await
            .unwrap();

        // If status is 404, the node has been deregistered.
        // Re-register the node and continue sending heartbeats.
        if result.status() == reqwest::StatusCode::NOT_FOUND {
            info!("Node has been deregistered. Re-registering node with the API server");
            register_node(
                &client,
                &ENV.api_base_url,
                &ENV.node_id,
                &authorization_header,
            )
            .await;
            continue;
        }

        debug!("Sent heartbeat to the API server");
        tokio::time::sleep(heartbeat_interval).await;
    }
}

async fn register_node(
    client: &ClientWithMiddleware,
    api_base_url: &str,
    node_id: &str,
    authorization_header: &str,
) {
    let mut body = HashMap::new();

    body.insert("id", node_id);
    body.insert("gptModel", &ENV.simularity_model_id);
    body.insert("baseUrl", &ENV.node_base_url);

    client
        .post(format!("{api_base_url}/inference-nodes"))
        .header("Authorization", authorization_header)
        .json(&body)
        .send()
        .await
        .unwrap();

    info!("Registered node with the API server");
}
