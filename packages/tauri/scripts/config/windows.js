import fs from "fs";

const tauriConf = JSON.parse(fs.readFileSync("tauri.conf.json", "utf-8"));

tauriConf.build.distDir = "..\\client\\dist";
tauriConf.tauri.bundle.resources = ["..\\client\\resources"];

fs.writeFileSync("tauri.conf.local.json", JSON.stringify(tauriConf, null, 2));
