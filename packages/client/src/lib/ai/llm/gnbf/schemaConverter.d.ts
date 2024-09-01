declare module "@/lib/ai/llm/gnbf/schemaConverter.mjs" {
  export class SchemaConverter {
    constructor(
      options: {
        prop_order?: Record<string, number>;
        allow_fetch?: boolean;
        dotall?: boolean;
      } = {},
    ) {}

    resolveRefs(schema: any, url?: string): Object;
    visit(schema: any, name?: string): void;
    formatGrammar(): string;
  }
}
