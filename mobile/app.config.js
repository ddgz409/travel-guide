const fs = require("fs");
const path = require("path");

/** 从 mobile/.env 读取，保证 app.extra 也能拿到 Key（避免仅靠 Metro 内联失败） */
function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const fileEnv = loadDotEnv();

// 生产服务器地址：环境变量缺失时的安全兜底。
// 真机 APK 若未注入 EXPO_PUBLIC_API_BASE，会回退到 127.0.0.1/10.0.2.2，
// 导致手机连不上后端、所有联网功能（搜索/推荐/生成）全部失效。
const DEFAULT_API_BASE = "http://81.71.159.218:8000/api/v1";
const DEFAULT_AMAP_JS_KEY = "e2d15f867f9e7c13777ca47de260999b";

const amapJsKey =
  process.env.EXPO_PUBLIC_AMAP_JS_KEY ||
  fileEnv.EXPO_PUBLIC_AMAP_JS_KEY ||
  DEFAULT_AMAP_JS_KEY;
const apiBase =
  process.env.EXPO_PUBLIC_API_BASE || fileEnv.EXPO_PUBLIC_API_BASE || DEFAULT_API_BASE;

const appJson = require("./app.json");

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra || {}),
      eas: {
        ...((appJson.expo.extra && appJson.expo.extra.eas) || {}),
      },
      amapJsKey,
      apiBase,
    },
  },
};
