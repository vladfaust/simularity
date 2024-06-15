/**
 * A `fetch` error (e.g. network issues).
 */
export class FetchError extends Error {}

/**
 * A `fetch` response error, e.g. unexpected status code.
 */
export class ResponseOkError extends Error {
  static async from(response: Response): Promise<ResponseOkError> {
    const text = await response.text();
    return new ResponseOkError(response, text);
  }

  private constructor(
    readonly response: Response,
    message?: string,
  ) {
    super(
      `${response.url} returned ${response.status} ${
        message || response.statusText
      }`,
    );
  }
}
