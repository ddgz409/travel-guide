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
const amapJsKey =
  process.env.EXPO_PUBLIC_AMAP_JS_KEY || fileEnv.EXPO_PUBLIC_AMAP_JS_KEY || "";
const apiBase =
  process.env.EXPO_PUBLIC_API_BASE || fileEnv.EXPO_PUBLIC_API_BASE || "";

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
