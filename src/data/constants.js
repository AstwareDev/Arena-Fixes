// ── Storage keys ──────────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  BOTTOM_COPY_ENABLED:    "bottomCopyEnabled",
  OLD_THEME_ENABLED:      "oldThemeEnabled",
  AUTO_SCROLL_DISABLED:   "autoScrollDisabled",
  PROFILE_PIC_ENABLED:    "profilePicEnabled",
  PROFILE_PIC_URL:        "profilePicUrl",
  ENHANCE_PROMPT_ENABLED: "enhancePromptEnabled",
  REASONING_EFFORT:       "reasoningEffort",
  ASK_QUESTIONS_ENABLED:  "askQuestionsEnabled",
  RAW_MARKDOWN_ENABLED:   "rawMarkdownEnabled",
  CAPTURED_GOOGLE_PIC:    "capturedGooglePic",
  ENABLE_STARRING:        "enableStarringEnabled",
  STARRED_MODELS:         "starredModels",
};

// ── Message types ─────────────────────────────────────────────────────────────
const MSG = {
  GET_LATEST_USER_MESSAGE:  "GET_LATEST_USER_MESSAGE",
  COPY_LATEST_USER_MESSAGE: "COPY_LATEST_USER_MESSAGE",
  REFRESH_COPY_BUTTONS:     "REFRESH_COPY_BUTTONS",
  REFRESH_OLD_THEME:        "REFRESH_OLD_THEME",
  REFRESH_AUTO_SCROLL:      "REFRESH_AUTO_SCROLL",
  REFRESH_PROFILE_PIC:      "REFRESH_PROFILE_PIC",
  REFRESH_ENHANCE_PROMPT:   "REFRESH_ENHANCE_PROMPT",
  REFRESH_RAW_MARKDOWN:     "REFRESH_RAW_MARKDOWN",
  REFRESH_MODEL_STARRING:   "REFRESH_MODEL_STARRING",
  NUKE_ARENA_FULL:          "NUKE_ARENA_FULL",
  CHECK_ARENA_COOKIES:      "CHECK_ARENA_COOKIES",
};

// ── Style / element IDs ───────────────────────────────────────────────────────
const IDS = {
  LMARENA_THEME:  "arena-fixes-lmarena-theme",
  LMARENA_LOGO:   "arena-fixes-lmarena-logo",
  AUTO_SCROLL:    "arena-fixes-auto-scroll-disable",
  COPY_STYLE:     "arena-fixes-copy-style",
  ENHANCE_STYLE:  "arena-fixes-enhance-style",
  LIGHT_OVERRIDE: "arena-fixes-light-override",
  CINZEL_FONT:    "arena-fixes-cinzel-font",
  FAVICON:        "arena-fixes-favicon",
  MODEL_STARRING: "arena-fixes-model-starring-style",
};

// ── Data attributes ───────────────────────────────────────────────────────────
const ATTR = {
  PFP:           "data-arena-fixes-pfp",
  ORIGINAL_SRC:  "data-arena-fixes-original-src",
  BOTTOM_COPY:   "data-arena-fixes-bottom-copy-wrap",
  ROUNDED:       "data-arena-fixes-rounded",
  INPUT_BAR:     "data-arena-fixes-input-bar",
  ICON:          "data-arena-fixes-icon",
  MODALITY_ICON: "data-arena-fixes-modality-icon",
  SIDEBAR_IMG:   "data-arena-fixes-sidebar-img",
  HIDDEN:        "data-arena-fixes-hidden",
  HIDDEN_CTA:    "data-arena-fixes-hidden-cta",
  RAW_APPLIED:   "data-arena-fixes-raw-applied",
  RAW_PRE:       "data-arena-fixes-raw-pre",
  LOGO:          "data-arena-fixes-logo",
  ORIG_COPY:     "data-arena-fixes-original-copy-hidden",
  SCROLL_DISABLED: "data-arena-fixes-scroll-disabled",
  STARRED_CLONE: "data-af-starred-clone",
  STARRED_SECTION: "data-af-starred-section",
  AF_MODEL:      "data-af-model",
};

// ── Misc ──────────────────────────────────────────────────────────────────────
const COMPANION_PORT    = 48372;
const ARENA_DOMAINS     = ["arena.ai", ".arena.ai", "www.arena.ai", ".www.arena.ai"];
const ORIGIN_WHITELIST  = ["https://arena.ai", "https://www.arena.ai"];
const CAPTCHA_PATTERNS  = ["recaptcha", "hcaptcha", "g-recaptcha", "h-captcha", "captcha", "turnstile", "cf-turnstile", "cf-challenge", "challenge-form", "challenge-container"];

// ── Export strategy ───────────────────────────────────────────────────────────
// • Content scripts and popup scripts are plain (non-module) — expose via window.
// • background.js is an ES module — it imports directly from constants.js via
//   named exports at the bottom of this file.
// This file must NOT use `export` at the top level because content scripts
// are loaded as classic scripts and would throw a syntax error.

window.STORAGE_KEYS     = STORAGE_KEYS;
window.MSG              = MSG;
window.IDS              = IDS;
window.ATTR             = ATTR;
window.COMPANION_PORT   = COMPANION_PORT;
window.ARENA_DOMAINS    = ARENA_DOMAINS;
window.ORIGIN_WHITELIST = ORIGIN_WHITELIST;
window.CAPTCHA_PATTERNS = CAPTCHA_PATTERNS;