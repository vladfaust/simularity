import { t } from "@/server/trpc.js";

import loginWithCode from "./email/loginWithCode.js";
import sendCode from "./email/sendCode.js";

export default t.router({
  loginWithCode,
  sendCode,
});
