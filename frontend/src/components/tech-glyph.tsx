import { techIconPath } from "@/lib/tech-icons";

type TechGlyphProps = {
  // Exact technology name from the detector (DetectedTechnology.name).
  name: string;
  // Rendered size in px (square).
  size?: number;
  className?: string;
  // When true, hidden from assistive tech (an adjacent text label names it).
  // When false, the glyph announces the technology name itself.
  decorative?: boolean;
};

// A single detected-technology logo as an inline SVG in brand green. Used by the
// tech-stack list rows and the reduced-motion fallback for the icon cloud. Being
// real DOM SVG (unlike the canvas-based cloud), it reads the --brand CSS variable
// directly, so it stays theme-aware with no JS color resolution.
export function TechGlyph({
  name,
  size = 20,
  className,
  decorative = false,
}: TechGlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={{ fill: "var(--brand)" }}
      role="img"
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : name}
    >
      <path d={techIconPath(name)} />
    </svg>
  );
}
