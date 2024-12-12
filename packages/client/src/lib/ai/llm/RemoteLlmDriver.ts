import * as api from "@/lib/api";
import type { Unsubscribable } from "@/lib/api/trpc";
import { d } from "@/lib/drizzle";
import { type LatestSession } from "@/lib/storage/llm";
import { jwtStorage } from "@/lib/storage/user";
import { Deferred } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { ref, type Ref } from "vue";
import {
  LlmGrammarLang,
  LlmStatus,
  type BaseLlmDriver,
  type CompletionOptions,
  type CompletionProgressEventPayload,
  type CompletionResult,
  type DecodeProgressEventPayload,
} from "./BaseLlmDriver";

export type RemoteLlmDriverConfig = {
  type: "remote";
  baseUrl: string;
  modelId: string;
  completionOptions?: Omit<CompletionOptions, "grammar" | "stopSequences">;
};

export class RemoteLlmDriver implements BaseLlmDriver {
  readonly busy = ref(false);
  readonly status = ref<LlmStatus | undefined>();

  /**
   * Create a new RemoteLlmDriver instance.
   */
  static async create(
    config: RemoteLlmDriverConfig,
    latestSession: Ref<LatestSession | null>,
  ) {
    let databaseSession;
    outer: if (latestSession.value) {
      if (latestSession.value.driver !== "remote") {
        console.warn(`Latest session driver mismatch`, { latestSession });
        break outer;
      }

      databaseSession = await d.db.query.llmRemoteSessions.findFirst({
        where: eq(d.llmRemoteSessions.id, latestSession.value.id),
      });

      if (!databaseSession) {
        console.warn(`Latest session not found in DB`, { latestSession });
        latestSession.value = null;
        break outer;
      }

      if (databaseSession.baseUrl !== config.baseUrl) {
        console.warn(`Config base URL mismatch`, {
          databaseSessionId: databaseSession.id,
          databaseSessionBaseUrl: databaseSession.baseUrl,
          configBaseUrl: config.baseUrl,
        });

        latestSession.value = null;
        databaseSession = null;

        break outer;
      }

      if (databaseSession.modelId !== config.modelId) {
        console.warn(`Config model ID mismatch`, {
          databaseSessionId: databaseSession.id,
          databaseSessionModelId: databaseSession.modelId,
          configModelId: config.modelId,
        });

        latestSession.value = null;
        databaseSession = null;

        break outer;
      }
    }

    const models = await api.trpc.commandsClient.models.indexLlmModels.query();
    const model = models.find((model) => model.id === config.modelId);
    if (!model) throw new Error(`Model ${config.modelId} not found`);

    return new RemoteLlmDriver(
      config,
      model.contextSize,
      latestSession,
      databaseSession?.externalId,
    );
  }

  readonly supportedGrammarLangs = new Set([
    LlmGrammarLang.Gnbf,
    LlmGrammarLang.LuaGnbf,
    LlmGrammarLang.Regex,
    LlmGrammarLang.JsonSchema,
    LlmGrammarLang.Lark,
  ]);

  readonly needsWarmup = false;
  readonly ready = ref(true);
  readonly progress = ref<number | undefined>();

  get modelId() {
    return this.config.modelId;
  }

  private constructor(
    readonly config: RemoteLlmDriverConfig,
    readonly contextSize: number,
    private _latestSession: Ref<LatestSession | null>,
    private _externalSessionId: string | undefined,
  ) {}

  compareConfig(other: RemoteLlmDriverConfig): boolean {
    return (
      other.modelId === this.config.modelId &&
      other.baseUrl === this.config.baseUrl
    );
  }

  // FIXME: When failed and output is not empty,
  // shall restart inference in UI.
  async createCompletion(
    prompt: string,
    nEval: number,
    inferenceOptions: CompletionOptions,
    _decodeCallback?: (event: DecodeProgressEventPayload) => void,
    completionCallback?: (event: CompletionProgressEventPayload) => void,
    abortSignal?: AbortSignal,
  ): Promise<CompletionResult> {
    if (!jwtStorage.value) {
      throw new api.UnauthorizedError();
    }

    let subscription: Unsubscribable | undefined;

    abortSignal?.addEventListener("abort", () => {
      console.log("Aborting inference");
      subscription?.unsubscribe();
    });

    const startedAt = Date.now();

    try {
      this.busy.value = true;
      this.status.value = LlmStatus.Queued;
      this.progress.value = undefined;

      let output = "";
      let remoteSessionId: string | undefined;
      let remoteCompletionId: string | undefined;
      let usage:
        | {
            promptTokens: number;
            completionTokens: number;
            delayTime: number;
            executionTime: number;
          }
        | undefined;

      const subscriptionDone = new Deferred<void>();
      subscription =
        api.trpc.subscriptionsClient.text2Text.createCompletion.subscribe(
          {
            modelId: this.config.modelId,
            prompt,
            jwt: jwtStorage.value,
            sessionId: this._externalSessionId,
            nEval,
            options: {
              ...this.config.completionOptions,
              ...inferenceOptions,
            },
          },
          {
            onData: (data) => {
              switch (data.kind) {
                case "prologue": {
                  remoteSessionId = data.sessionId;
                  break;
                }

                case "decoding": {
                  this.status.value = LlmStatus.Decoding;
                  this.progress.value = data.progress;
                  break;
                }

                case "inference": {
                  this.status.value = LlmStatus.Inferring;
                  this.progress.value = undefined;

                  output += data.tokens.join("");

                  completionCallback?.({
                    content: data.tokens.join(""),
                  });

                  break;
                }

                case "epilogue": {
                  remoteCompletionId = data.completionId;

                  usage = {
                    promptTokens: data.inputTokens,
                    completionTokens: data.outputTokens,
                    delayTime: 0,
                    executionTime: 0,
                  };

                  break;
                }
              }
            },
            onComplete: () => {
              console.debug("onComplete");
              subscriptionDone.resolve();
            },
            onStopped: () => {
              console.debug("onStopped");
              subscriptionDone.resolve();
            },
            onError: (err) => {
              subscriptionDone.reject(err);
            },
          },
        );

      await subscriptionDone.promise;
      console.debug({ remoteSessionId, remoteCompletionId, usage });

      // If the response contains a new session ID, store it in the database.
      // The old session seems to be invalidated after a while.
      if (remoteSessionId && remoteSessionId !== this._externalSessionId) {
        this._latestSession.value = {
          driver: "remote",
          id: (
            await d.db
              .insert(d.llmRemoteSessions)
              .values({
                externalId: remoteSessionId,
                baseUrl: this.config.baseUrl,
                modelId: this.config.modelId,
                contextSize: this.contextSize,
              })
              .returning({
                id: d.llmRemoteSessions.id,
              })
          )[0].id,
        };
      }

      this._externalSessionId = remoteSessionId;
      if (!(this._latestSession.value?.driver === "remote")) {
        throw new Error("[BUG] Latest session value is not set");
      }

      const completion = (
        await d.db
          .insert(d.llmCompletions)
          .values({
            remoteSessionId: this._latestSession.value.id,
            options: inferenceOptions,
            input: prompt,
            inputLength: usage?.promptTokens,
            output,
            outputLength: usage?.completionTokens,
            error: abortSignal?.aborted ? "Aborted" : undefined,
            delayTime: usage?.delayTime,
            executionTime: usage?.executionTime,
            realTime: Date.now() - startedAt,
          })
          .returning()
      )[0];

      return {
        completion,
        aborted: abortSignal?.aborted ?? false,
      };
    } catch (e: any) {
      if (this._latestSession.value?.driver === "remote") {
        await d.db.insert(d.llmCompletions).values({
          remoteSessionId: this._latestSession.value.id,
          options: inferenceOptions,
          input: prompt,
          error: e.message,
          realTime: Date.now() - startedAt,
        });
      } else {
        console.warn(
          `Latest session is not remote, can't save errornous completion`,
          { latestSession: this._latestSession.value },
        );
      }

      throw e;
    } finally {
      this.status.value = undefined;
      this.busy.value = false;
    }
  }

  async destroy(): Promise<void> {
    // Do nothing.
  }
}
