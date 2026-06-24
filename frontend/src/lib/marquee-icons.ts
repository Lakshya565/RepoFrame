import {
  siPython,
  siClaude,
  siTypescript,
  siPerplexity,
  siRust,
  siGooglegemini,
  siGo,
  siHuggingface,
  siCplusplus,
  siMistralai,
  siJavascript,
  siPytorch,
  siOpenjdk,
  siTensorflow,
  siC,
  siNvidia,
  siSwift,
  siOllama,
  siKotlin,
  siJupyter,
  siRuby,
  siLangchain,
  siPhp,
  siReplicate,
  siScala,
  siKeras,
  siElixir,
  siHaskell,
  siJulia,
  type SimpleIcon,
} from "simple-icons";

// Single source of truth for the brand-logo marquee (brand-marquee.tsx). Each
// entry is a monochrome 24×24 SVG path plus the brand's official hex. Because the
// logos are single-path and single-color, phase 2 (recolor everything brand
// green) is just a color swap — no asset changes — via the flag in brand-marquee.
export type MarqueeIcon = {
  title: string;
  // 6-digit hex WITHOUT a leading '#', matching simple-icons' format.
  hex: string;
  // The `d` attribute of a single <path> drawn in a 0 0 24 24 viewBox.
  path: string;
};

// Adapts a simple-icons record to our minimal shape (drops the metadata we don't
// render — slug, source, license, guidelines).
const from = (icon: SimpleIcon): MarqueeIcon => ({
  title: icon.title,
  hex: icon.hex,
  path: icon.path,
});

// OpenAI / ChatGPT is hand-added: simple-icons removed it (and several other AI
// company marks) over trademark policy, but the user explicitly asked for it.
// Official 24×24 mark, drawn in OpenAI's signature green so it reads as an AI logo.
const OPENAI: MarqueeIcon = {
  title: "OpenAI",
  hex: "10A37F",
  path: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
};

// The full marquee pool: ~30 widely recognizable AI companies and programming
// languages, deliberately interleaved (AI, language, AI, language, …) so that
// splitting by index gives each rail a balanced mix of both categories.
export const MARQUEE_ICONS: MarqueeIcon[] = [
  OPENAI, // AI
  from(siPython), // language
  from(siClaude), // AI
  from(siTypescript), // language
  from(siPerplexity), // AI
  from(siRust), // language
  from(siGooglegemini), // AI
  from(siGo), // language
  from(siHuggingface), // AI
  from(siCplusplus), // language
  from(siMistralai), // AI
  from(siJavascript), // language
  from(siPytorch), // AI / ML
  from(siOpenjdk), // language (Java)
  from(siTensorflow), // AI / ML
  from(siC), // language
  from(siNvidia), // AI
  from(siSwift), // language
  from(siOllama), // AI
  from(siKotlin), // language
  from(siJupyter), // AI / ML
  from(siRuby), // language
  from(siLangchain), // AI
  from(siPhp), // language
  from(siReplicate), // AI
  from(siScala), // language
  from(siKeras), // AI / ML
  from(siElixir), // language
  from(siHaskell), // language
  from(siJulia), // language
];
