/**
 * Sticker and emoji constants for canvas blocks.
 * Matches the sticker catalog from the mindmap engine.
 */
export const STICKERS = [
  "💡", "🎯", "⭐", "🔥", "🚀", "📝", "📊", "🧠", "✨", "❤️",
  "👍", "👎", "❓", "❗", "📁", "💻", "🎨", "🏆", "💬", "🔔",
  "⚡", "🌟", "🎉", "✅", "❌", "⚠️", "🔑", "💎", "🌈", "🎵",
  "📌", "🔍", "💰", "📅", "🎓", "🤝", "⚙️", "🔒", "🌍", "👁️",
  "😀", "😍", "🤔", "😎", "🥳", "😢", "😡", "🤯", "🙌", "👀",
  "🍎", "🌸", "🦋", "🐉", "🦄", "🌊", "☀️", "🌙", "⛰️", "🏠",
] as const;

export type StickerEmoji = (typeof STICKERS)[number];
