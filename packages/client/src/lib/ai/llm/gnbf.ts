import { SchemaConverter } from "@/lib/ai/llm/gnbf/schemaConverter.mjs";

/**
 * Convert a JSON schema to a GNBF grammar.
 */
export function jsonSchemaToGnbf(jsonSchema: any) {
  const schemaConverter = new SchemaConverter();
  const resolvedSchema = schemaConverter.resolveRefs(jsonSchema);
  schemaConverter.visit(resolvedSchema);
  return schemaConverter.formatGrammar();
}
