import { cn } from "@/lib/utils";

/**
 * The mark is the product's one shape: a module in the middle, four files
 * around it, each line an import that resolved. It stays monochrome so the
 * map keeps a monopoly on colour.
 */
export function AtlasMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("size-4 shrink-0", className)}
    >
      <g
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.45"
      >
        <path d="M10 10 4.2 4.2M10 10l5.8-4.9M10 10l-4.9 5.8M10 10l5 4.9" />
      </g>
      <rect
        x="7.7"
        y="7.7"
        width="4.6"
        height="4.6"
        rx="0.9"
        fill="currentColor"
      />
      <g fill="currentColor">
        <circle cx="4.2" cy="4.2" r="1.25" />
        <circle cx="15.8" cy="5.1" r="1.25" />
        <circle cx="5.1" cy="15.8" r="1.25" />
        <circle cx="15" cy="14.9" r="1.25" />
      </g>
    </svg>
  );
}
