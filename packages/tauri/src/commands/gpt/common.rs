#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DecodeProgress {
    pub progress: f32,
}
