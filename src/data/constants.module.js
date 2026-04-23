// ES-module re-exports for background.js (service worker).
// Content scripts and popup use src/data/constants.js (window globals).

export const STORAGE_KEYS = {
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
  MODEL_THINKING_ENABLED: "modelThinkingEnabled",
  RENAME_CONV_ENABLED:    "renameConvEnabled",
  PROMPT_HISTORY_ENABLED: "promptHistoryEnabled",
};

export const ARENA_DOMAINS    = ["arena.ai", ".arena.ai", "www.arena.ai", ".www.arena.ai"];
export const ORIGIN_WHITELIST = ["https://arena.ai", "https://www.arena.ai"];