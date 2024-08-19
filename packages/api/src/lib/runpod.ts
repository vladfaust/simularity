import runpodSdk from "runpod-sdk";

export type RunpodSdk = ReturnType<typeof runpodSdk>;
export type RunpodEndpoint = NonNullable<ReturnType<RunpodSdk["endpoint"]>>;
