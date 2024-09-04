import { ResponseOkError } from "../errors.js";
import { konsole } from "../konsole.js";
import { v } from "../valibot.js";
import { UserV2Schema } from "./schema.js";

const ResponseSchema = v.object({
  data: UserV2Schema,
});

export async function getIdentity(
  baseUrl: string,
  tokenType: string,
  accessToken: string,
  userFields: (keyof typeof UserV2Schema.entries.attributes.entries)[],
) {
  const url = new URL(`${baseUrl}/v2/identity`);
  url.searchParams.set("fields[user]", userFields.join(","));

  const response = await fetch(url, {
    headers: {
      Authorization: `${tokenType} ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw await ResponseOkError.from(response);
  }

  const json = await response.json();
  konsole.debug("getIdentity response", json);

  return v.parse(ResponseSchema, json);
}
