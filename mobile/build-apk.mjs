// Builds the Android app (APK) ➜ mobile/dist/
//   node build-apk.mjs          the app opens the live site (https://kpidashboard-one.vercel.app)
//   node build-apk.mjs --test   the app opens http://localhost:8090 — a test server on this computer,
//                               reached from a USB-connected phone after:  adb reverse tcp:8090 tcp:8090
// Needs Android Studio (its bundled Java 21) and the Android SDK.
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const test = process.argv.includes("--test");
const LIVE = "https://kpidashboard-one.vercel.app";
const url = test ? "http://localhost:8090" : LIVE;
const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
const jdk = process.env.JAVA_HOME_21 || "C:/Program Files/Android/Android Studio/jbr";
const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, JAVA_HOME: jdk };
const run = (cmd, cwd = ".") => { console.log(`> ${cmd}`); execSync(cmd, { cwd, env, stdio: "inherit" }); };

fs.writeFileSync("android/local.properties", `sdk.dir=${sdk.replace(/\\/g, "\\\\").replace(/:/g, "\\:")}\n`);

// point the app at the right site for this build, then put the config back
const file = "capacitor.config.json";
const original = fs.readFileSync(file, "utf8");
const cfg = JSON.parse(original);
cfg.server = { ...cfg.server, url };
if (test) cfg.server.cleartext = true; else delete cfg.server.cleartext;
fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
try {
  run("npx cap sync android");
  run(process.platform === "win32" ? ".\\gradlew.bat assembleDebug" : "./gradlew assembleDebug", "android");
} finally {
  fs.writeFileSync(file, original);
}
fs.mkdirSync("dist", { recursive: true });
const out = path.join("dist", test ? "TiljayCFPro-test.apk" : "TiljayCFPro.apk");
fs.copyFileSync("android/app/build/outputs/apk/debug/app-debug.apk", out);
console.log(`\nBuilt ${out} (opens ${url})`);
