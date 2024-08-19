import { EndpointCompletedOutput, EndpointInputPayload } from "runpod-sdk";

/**
 * LocalRunpodEndpoint is a RunpodEndpoint that runs on the local machine.
 */
export class LocalRunpodEndpoint {
  constructor(readonly baseUrl: string) {}
  async runSync(
    input: EndpointInputPayload,
    timeout?: number,
  ): Promise<EndpointCompletedOutput> {
    const startedAt = Date.now();
    const response = await fetch(`${this.baseUrl}/runsync?wait=${timeout}`, {
      method: "POST",
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to run endpoint: ${response.status} ${await response.text()}`,
      );
    }

    const json = await response.json();

    return {
      ...json,
      delayTime: 0,
      executionTime: Date.now() - startedAt,
    };
  }
}
