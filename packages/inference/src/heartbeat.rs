use log::{debug, info};
use reqwest_middleware::ClientBuilder;
use reqwest_retry::{policies::ExponentialBackoff, RetryTransientMiddleware};
use std::collections::HashMap;

/// Send a heartbeat to the API server.
// TODO: When the heartbeat fails due to node deregistration, re-register the node.
pub async fn run_heartbeat() {
    // Retry up to 3 times with increasing intervals between attempts.
    let retry_policy = ExponentialBackoff::builder().build_with_max_retries(3);

    // 1. POST /inference-nodes {id, ... }
    // 2. (Loop) HEAD /inference-nodes/{id}/heartbeat
    //

    let api_base_url = std::env::var("API_BASE_URL").expect("API_BASE_URL env variable is not set");
    let api_secret = std::env::var("API_SECRET").expect("API_SECRET env variable is not set");
    let authorization_header = format!("Token {api_secret}");

    let node_id = std::env::var("NODE_ID").expect("NODE_ID env variable is not set");
    let client = ClientBuilder::new(reqwest::Client::new())
        .with(RetryTransientMiddleware::new_with_policy(retry_policy))
        .build();

    {
        let gpt_model =
            std::env::var("GPT_MODEL_NAME").expect("GPT_MODEL_NAME env variable is not set");
        let node_base_url =
            std::env::var("NODE_BASE_URL").expect("NODE_BASE_URL env variable is not set");

        let mut body = HashMap::new();
        body.insert("id", &node_id);
        body.insert("gptModel", &gpt_model);
        body.insert("baseUrl", &node_base_url);

        client
            .post(format!("{api_base_url}/inference-nodes"))
            .header("Authorization", &authorization_header)
            .json(&body)
            .send()
            .await
            .unwrap();

        info!("Registered node with the API server");
    }

    let heartbeat_interval =
        std::env::var("API_HEARTBEAT").expect("API_HEARTBEAT env variable is not set");
    let heartbeat_interval = std::time::Duration::from_secs(heartbeat_interval.parse().unwrap());
    let heartbeat_url = format!("{api_base_url}/inference-nodes/{node_id}/heartbeat");

    loop {
        client
            .head(&heartbeat_url)
            .header("Authorization", &authorization_header)
            .send()
            .await
            .unwrap();

        debug!("Sent heartbeat to the API server");
        tokio::time::sleep(heartbeat_interval).await;
    }
}
