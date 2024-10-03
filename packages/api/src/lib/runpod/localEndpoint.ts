import { EndpointCompletedOutput, EndpointInputPayload } from "runpod-sdk";

/**
 * LocalRunpodEndpoint is a RunpodEndpoint that runs on the local machine.
 */
export class LocalRunpodEndpoint {
  constructor(readonly baseUrl: string) {}

  /**
   * @see https://docs.runpod.io/serverless/endpoints/job-operations#asynchronous-endpoints.
   */
  async run(
    input: EndpointInputPayload,
    timeout?: number,
  ): Promise<EndpointCompletedOutput> {
    return this._runImpl(false, input, timeout);
  }

  /**
   * @see https://docs.runpod.io/serverless/endpoints/job-operations#synchronous-endpoints.
   */
  async runSync(
    input: EndpointInputPayload,
    timeout?: number,
  ): Promise<EndpointCompletedOutput> {
    return this._runImpl(true, input, timeout);
  }

  /**
   * @see https://docs.runpod.io/serverless/endpoints/job-operations#check-job-status.
   */
  async status(requestId: string) {
    const response = await fetch(`${this.baseUrl}/status/${requestId}`, {
      method: "POST",
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

    return response.json();
  }

  /**
   * Continuously aggregates the output of a processing job,
   * returning the full output once the job is complete.
   *
   * This endpoint is especially useful for jobs where the complete output
   * needs to be accessed at once. It provides a consolidated view
   * of the results post-completion, ensuring that users can retrieve
   * the entire output without the need to poll multiple times
   * or manage partial results.
   *
   * @param requestId The unique identifier of the job for which output
   * is being requested. This ID is used to track the job's progress
   * and aggregate its output.
   *
   * @see https://docs.runpod.io/serverless/endpoints/job-operations#stream-results.
   */
  async *stream(requestId: string) {
    const response = await fetch(`${this.baseUrl}/stream/${requestId}`, {
      method: "POST",
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

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get response body reader");
    }

    let done = false;
    let buffer = "";

    while (!done) {
      const { value, done: _done } = await reader.read();
      done = _done;

      if (value) {
        buffer += new TextDecoder().decode(value);
      }
    }

    const json = JSON.parse(buffer);

    for (const item of json.stream) {
      yield item;
    }
  }

  private async _runImpl(
    sync: boolean,
    input: EndpointInputPayload,
    timeout?: number,
  ): Promise<EndpointCompletedOutput> {
    const startedAt = Date.now();

    const response = await fetch(
      `${this.baseUrl}/run${sync ? "sync" : ""}?wait=${timeout}`,
      {
        method: "POST",
        body: JSON.stringify(input),
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
      },
    );

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
