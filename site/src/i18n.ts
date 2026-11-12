// Locale registry + dictionaries. To add a language:
//   1. create src/i18n/<code>.ts mirroring en.ts (path/flag/name/meta + all copy)
//   2. add it to LANGS below
//   3. add src/pages/<path>.astro → <Home lang="<code>" />
// Components take `lang` and read UI[lang] (falling back to en for anything missing).
import en from "./i18n/en.js";
import zh from "./i18n/zh.js";
import zhHant from "./i18n/zh-hant.js";
import ja from "./i18n/ja.js";

export const UI: Record<string, any> = { en, zh, "zh-hant": zhHant, ja };

export const LANGS: { code: string; flag: string; name: string; path: string; htmlLang: string }[] =
  ["en", "zh", "zh-hant", "ja"].map(code => ({
    code, flag: UI[code].flag, name: UI[code].name, path: UI[code].path, htmlLang: UI[code].htmlLang,
  }));

export const ui = (lang: string) => UI[lang] ?? UI.en;
