import fs from "fs";

const tauriConf = JSON.parse(fs.readFileSync("tauri.conf.json", "utf-8"));

tauriConf.bundle.resources.push(...["./cuda_12.6.2_windows_network.exe"]);

fs.writeFileSync(
  "tauri.conf.windows.local.json",
  JSON.stringify(tauriConf, null, 2),
);
