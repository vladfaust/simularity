import fs from "fs";

const tauriConf = JSON.parse(fs.readFileSync("tauri.conf.json", "utf-8"));

tauriConf.tauri.bundle.resources.push(
  ...["./cublas64_12.dll", "./cudart64_12.dll"],
);

fs.writeFileSync(
  "tauri.conf.windows.local.json",
  JSON.stringify(tauriConf, null, 2),
);
