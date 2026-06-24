import {
  siAngular,
  siDotnet,
  siCss,
  siDjango,
  siDocker,
  siElectron,
  siEslint,
  siExpress,
  siFastify,
  siFlask,
  siGithubactions,
  siGo,
  siHtml5,
  siOpenjdk,
  siJavascript,
  siJest,
  siKotlin,
  siNestjs,
  siNextdotjs,
  siNodedotjs,
  siNumpy,
  siOpencv,
  siPhp,
  siPandas,
  siPostcss,
  siPostgresql,
  siPrisma,
  siPydantic,
  siPytest,
  siPython,
  siReact,
  siRuby,
  siRust,
  siSqlalchemy,
  siSqlite,
  siSass,
  siSupabase,
  siSvelte,
  siSwift,
  siTailwindcss,
  siTypescript,
  siVite,
  siVitest,
  siVuedotjs,
} from "simple-icons";

// Maps the exact technology names emitted by the backend tech-stack detector
// (see backend/app/services/tech_stack_detector.py → TECH_CATEGORIES, the
// canonical superset) to a monochrome 24×24 SVG path from simple-icons. Keyed by
// the literal name strings so it stays a direct lookup as the detector evolves.
//
// Three deliberate substitutions, because simple-icons drops trademarked marks:
//   • "C#"   → .NET logo   (the literal C# mark was removed)
//   • "Java" → OpenJDK logo (Oracle's coffee-cup mark was removed)
// "React Native" reuses the React atom (no separate official mark).
// "SQL", "Requests", and "Uvicorn" have no recognizable logo, so they fall back
// to the generic code glyph below rather than borrowing a misleading one
// (e.g. the MySQL dolphin for generic SQL).
const TECH_ICON_PATHS: Record<string, string> = {
  Angular: siAngular.path,
  "C#": siDotnet.path,
  CSS: siCss.path,
  Django: siDjango.path,
  Docker: siDocker.path,
  Electron: siElectron.path,
  ESLint: siEslint.path,
  Express: siExpress.path,
  Fastify: siFastify.path,
  Flask: siFlask.path,
  "GitHub Actions": siGithubactions.path,
  Go: siGo.path,
  HTML: siHtml5.path,
  Java: siOpenjdk.path,
  JavaScript: siJavascript.path,
  Jest: siJest.path,
  Kotlin: siKotlin.path,
  NestJS: siNestjs.path,
  "Next.js": siNextdotjs.path,
  "Node.js": siNodedotjs.path,
  NumPy: siNumpy.path,
  OpenCV: siOpencv.path,
  PHP: siPhp.path,
  Pandas: siPandas.path,
  PostCSS: siPostcss.path,
  PostgreSQL: siPostgresql.path,
  Prisma: siPrisma.path,
  Pydantic: siPydantic.path,
  Pytest: siPytest.path,
  Python: siPython.path,
  React: siReact.path,
  "React Native": siReact.path,
  Ruby: siRuby.path,
  Rust: siRust.path,
  SQLAlchemy: siSqlalchemy.path,
  SQLite: siSqlite.path,
  Sass: siSass.path,
  Supabase: siSupabase.path,
  Svelte: siSvelte.path,
  Swift: siSwift.path,
  "Tailwind CSS": siTailwindcss.path,
  TypeScript: siTypescript.path,
  Vite: siVite.path,
  Vitest: siVitest.path,
  Vue: siVuedotjs.path,
};

// Generic "</>" code glyph (24×24). Used for any detected technology without a
// dedicated logo: the two libraries with no simple-icon (Requests, Uvicorn),
// bare "SQL", and — importantly — any open-ended GitHub primary-language string
// (e.g. "Jupyter Notebook", "Shell") that the detector passes through verbatim.
export const FALLBACK_ICON_PATH =
  "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z";

// Resolves a technology name to its logo path, falling back to the code glyph so
// every node in the icon cloud always renders something recognizable.
export function techIconPath(techName: string): string {
  return TECH_ICON_PATHS[techName] ?? FALLBACK_ICON_PATH;
}
