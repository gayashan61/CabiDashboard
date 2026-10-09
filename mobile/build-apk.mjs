// Builds the Android app (APK) ➜ mobile/dist/
//   node build-apk.mjs          the app opens the live site (https://kpidashboard-one.vercel.app)
//   node build-apk.mjs --test   the app opens http://localhost:8090 — a test server on this computer,
//                               reached from a USB-connected phone after:  adb reverse tcp:8090 tcp:8090
//   node build-apk.mjs --aab    the Google Play bundle (signed with the upload key, see android/keystore.properties)
//                               ➜ dist/TiljayCFPro-<version>.aab — always opens the live site
//   node build-apk.mjs --url http://localhost:8080   the app opens any other address (e.g. this folder served
//                               locally with the real database, to try changes before publishing them)
// Needs Android Studio (its bundled Java 21) and the Android SDK.
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const LIVE = "https://kpidashboard-one.vercel.app";
const aab = process.argv.includes("--aab");
const url = aab ? LIVE : arg("--url") || (process.argv.includes("--test") ? "http://localhost:8090" : LIVE);
if (aab && !fs.existsSync("android/keystore.properties")) throw new Error("android/keystore.properties is missing — the Google Play upload key isn't set up on this computer");
const test = url !== LIVE;
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
if (url.startsWith("http:")) cfg.server.cleartext = true; else delete cfg.server.cleartext;
fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
try {
  run("npx cap sync android");
  const task = aab ? "bundleRelease" : "assembleDebug";
  run(process.platform === "win32" ? `.\\gradlew.bat ${task}` : `./gradlew ${task}`, "android");
} finally {
  fs.writeFileSync(file, original);
}
fs.mkdirSync("dist", { recursive: true });
if (aab) {
  const version = fs.readFileSync("android/app/build.gradle", "utf8").match(/versionName "([^"]+)"/)[1];
  const bundle = path.join("dist", `TiljayCFPro-${version}.aab`);
  fs.copyFileSync("android/app/build/outputs/bundle/release/app-release.aab", bundle);
  console.log(`\nBuilt ${bundle} (for Google Play; opens ${url})`);
  process.exit(0);
}
const out = path.join("dist", test ? "TiljayCFPro-test.apk" : "TiljayCFPro.apk");
fs.copyFileSync("android/app/build/outputs/apk/debug/app-debug.apk", out);
console.log(`\nBuilt ${out} (opens ${url})`);
