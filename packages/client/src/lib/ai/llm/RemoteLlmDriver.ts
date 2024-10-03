import * as api from "@/lib/api";
import { d } from "@/lib/drizzle";
import { type LatestSession } from "@/lib/storage/llm";
import { Bug, Deferred, unreachable } from "@/lib/utils";
import { type Text2TextCompletionEpilogue } from "@simularity/api/lib/schema";
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

    const models = await api.trpc.commandsClient.models.index.query();
    const model = models.find(
      (model) => model.type === "llm" && model.id === config.modelId,
    );
    if (!model) throw new Error(`Model ${config.modelId} not found`);
    if (model.type !== "llm") throw new Bug("Model is not LLM");

    return new RemoteLlmDriver(
      config,
      model.contextSize,
      latestSession,
      databaseSession?.externalId,
    );
  }

  readonly supportedGrammarLangs = new Set([
    LlmGrammarLang.Regex,
    LlmGrammarLang.JsonSchema,
  ]);

  readonly needsWarmup = false;
  readonly ready = ref(true);
  readonly progress = ref<number | undefined>();

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

  async createCompletion(
    prompt: string,
    nEval: number,
    inferenceOptions: CompletionOptions,
    _decodeCallback?: (event: DecodeProgressEventPayload) => void,
    completionCallback?: (event: CompletionProgressEventPayload) => void,
    abortSignal?: AbortSignal,
  ): Promise<CompletionResult> {
    const startedAt = Date.now();

    try {
      this.busy.value = true;
      this.status.value = LlmStatus.Inferring;

      let deferred = new Deferred<void>();
      let output = "";
      let epilogue: Text2TextCompletionEpilogue | undefined;

      const subscription =
        api.trpc.subscriptionsClient.text2Text.createCompletion.subscribe(
          {
            model: this.config.modelId,
            prompt: prompt,
            sessionId: this._externalSessionId,
            temperature: inferenceOptions.temp,

            guided_regex:
              inferenceOptions.grammar?.lang === LlmGrammarLang.Regex
                ? inferenceOptions.grammar?.content
                : undefined,

            guided_json:
              inferenceOptions.grammar?.lang === LlmGrammarLang.JsonSchema
                ? inferenceOptions.grammar?.content
                : undefined,

            max_tokens: nEval,
            min_p: inferenceOptions.minP,
            presence_penalty: inferenceOptions.penalty?.present,
            repetition_penalty: inferenceOptions.penalty?.repeat,
            stop: inferenceOptions.stopSequences,
            top_k: inferenceOptions.topK,
            top_p: inferenceOptions.topP,
          },
          {
            onData: (data) => {
              console.debug("Subscription data", data);

              switch (data.type) {
                case "inference":
                  output += data.tokens.join("");

                  completionCallback?.({
                    content: data.tokens.join(""),
                  });

                  break;

                case "epilogue":
                  epilogue = data;
                  break;

                default:
                  throw unreachable(data);
              }
            },

            onError: (e) => {
              console.error("Subscription error", e);
              deferred.reject(e);
            },

            onComplete: () => {
              console.debug("Subscription completed");
              deferred.resolve();
            },

            onStarted: () => {
              console.debug("Subscription started");
            },

            onStopped: () => {
              console.debug("Subscription stopped");
              deferred.resolve();
            },
          },
        );

      abortSignal?.addEventListener("abort", () => {
        console.debug("Aborting inference");
        subscription.unsubscribe();
      });

      await deferred.promise;

      if (!epilogue) {
        throw new Error("Epilogue not received");
      }

      console.debug("Epilogue", epilogue);

      // If the response contains a new session ID, store it in the database.
      // The old session seems to be invalidated after a while.
      if (epilogue.sessionId !== this._externalSessionId) {
        this._latestSession.value = {
          driver: "remote",
          id: (
            await d.db
              .insert(d.llmRemoteSessions)
              .values({
                externalId: epilogue.sessionId,
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

      this._externalSessionId = epilogue.sessionId;
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
            inputLength: epilogue.usage.promptTokens,
            output,
            outputLength: epilogue.usage.completionTokens,
            error: abortSignal?.aborted ? "Aborted" : undefined,
            delayTime: epilogue.usage.delayTime,
            executionTime: epilogue.usage.executionTime,
            realTime: Date.now() - startedAt,
            creditCost: epilogue.usage.creditCost
              ? Math.round(parseFloat(epilogue.usage.creditCost) * 100)
              : undefined,
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
