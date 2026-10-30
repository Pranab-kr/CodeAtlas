const KINDS = {
  red: "var(--kind-1)",
  orange: "var(--kind-2)",
  green: "var(--kind-5)",
  teal: "var(--kind-7)",
  blue: "var(--kind-9)",
  violet: "var(--kind-11)",
} as const;

function Markers({ prefix }: { prefix: string }) {
  const markers = [
    ["edge", "var(--edge)"],
    ["incoming", "var(--incoming)"],
    ["outgoing", "var(--outgoing)"],
  ] as const;

  return (
    <defs>
      {markers.map(([name, color]) => (
        <marker
          key={name}
          id={`${prefix}-${name}`}
          viewBox="0 0 7 7"
          refX="6"
          refY="3.5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M 0 0 L 7 3.5 L 0 7 z" fill={color} />
        </marker>
      ))}
    </defs>
  );
}

function FoldedNode({
  x,
  y,
  width,
  height,
  kind,
  bars,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: string;
  bars: readonly number[];
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="var(--card)"
        stroke="var(--border)"
      />
      <rect x={x} y={y} width={width} height={22} fill="var(--muted)" />
      <rect
        x={x + 10}
        y={y + 8}
        width={44}
        height={5}
        fill="var(--foreground)"
        opacity={0.42}
      />
      <rect
        x={x + width - 27}
        y={y + 8}
        width={17}
        height={5}
        fill="var(--muted-foreground)"
        opacity={0.32}
      />
      {bars.map((bar, index) => {
        const rowY = y + 34 + index * 16;
        if (rowY + 4 > y + height) {
          return null;
        }
        return (
          <g key={index}>
            <circle
              cx={x + 12}
              cy={rowY + 2}
              r={2.2}
              fill={kind}
              opacity={0.85}
            />
            <rect
              x={x + 21}
              y={rowY}
              width={bar}
              height={4}
              fill="var(--muted-foreground)"
              opacity={0.4}
            />
          </g>
        );
      })}
    </g>
  );
}

function OpenPanel({
  x,
  y,
  width,
  bars,
  selected,
  kinds,
}: {
  x: number;
  y: number;
  width: number;
  bars: readonly number[];
  selected: number;
  kinds: readonly string[];
}) {
  const header = 26;
  const rowHeight = 27;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={header + bars.length * rowHeight}
        fill="var(--card)"
        stroke="var(--border)"
      />
      <rect x={x} y={y} width={width} height={header} fill="var(--muted)" />
      <circle cx={x + 14} cy={y + 13} r={2.8} fill={kinds[selected]} />
      <rect
        x={x + 24}
        y={y + 10}
        width={62}
        height={5}
        fill="var(--foreground)"
        opacity={0.5}
      />
      <rect
        x={x + width - 38}
        y={y + 10}
        width={26}
        height={5}
        fill="var(--muted-foreground)"
        opacity={0.32}
      />
      {bars.map((bar, index) => {
        const rowY = y + header + index * rowHeight;
        const isSelected = index === selected;
        return (
          <g key={index} opacity={isSelected ? 1 : 0.5}>
            {isSelected ? (
              <>
                <rect
                  x={x + 1}
                  y={rowY}
                  width={width - 2}
                  height={rowHeight}
                  fill="var(--selection)"
                  opacity={0.09}
                />
                <rect
                  x={x + 1}
                  y={rowY}
                  width={2}
                  height={rowHeight}
                  fill="var(--selection)"
                />
              </>
            ) : null}
            <circle
              cx={x + 14}
              cy={rowY + rowHeight / 2}
              r={2.5}
              fill={kinds[index] ?? kinds[0]}
            />
            <rect
              x={x + 23}
              y={rowY + rowHeight / 2 - 2}
              width={bar}
              height={4}
              fill={
                isSelected ? "var(--foreground)" : "var(--muted-foreground)"
              }
              opacity={isSelected ? 0.68 : 0.42}
            />
            <rect
              x={x + width - 30}
              y={rowY + rowHeight / 2 - 2}
              width={14}
              height={4}
              fill="var(--muted-foreground)"
              opacity={0.22}
            />
          </g>
        );
      })}
    </g>
  );
}

export function HeroFigure({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 620 500"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <Markers prefix="hero" />

      <g strokeLinecap="round">
        <path
          d="M 520 132 C 552 236 552 300 520 366"
          stroke="var(--edge)"
          strokeWidth={1}
          opacity={0.4}
          markerEnd="url(#hero-edge)"
        />
        <path
          d="M 162 412 C 270 452 350 452 438 420"
          stroke="var(--edge)"
          strokeWidth={1}
          opacity={0.4}
          markerEnd="url(#hero-edge)"
        />
        <path
          d="M 180 138 C 204 160 196 240 214 271.5"
          stroke="var(--incoming)"
          strokeWidth={1.4}
          opacity={0.9}
          markerEnd="url(#hero-incoming)"
        />
        <path
          d="M 438 412 C 426 400 424 340 418 298.5"
          stroke="var(--incoming)"
          strokeWidth={1.4}
          opacity={0.9}
          markerEnd="url(#hero-incoming)"
        />
        <path
          d="M 418 271.5 C 462 248 414 124 430 86"
          stroke="var(--outgoing)"
          strokeWidth={1.4}
          opacity={0.9}
          markerEnd="url(#hero-outgoing)"
        />
        <path
          d="M 214 325.5 C 184 340 132 348 86 366"
          stroke="var(--outgoing)"
          strokeWidth={1.4}
          opacity={0.9}
          markerEnd="url(#hero-outgoing)"
        />
      </g>

      <FoldedNode
        x={24}
        y={92}
        width={156}
        height={92}
        kind={KINDS.blue}
        bars={[74, 52, 64]}
      />
      <FoldedNode
        x={430}
        y={36}
        width={166}
        height={96}
        kind={KINDS.green}
        bars={[82, 58, 72]}
      />
      <FoldedNode
        x={16}
        y={366}
        width={146}
        height={88}
        kind={KINDS.orange}
        bars={[68, 50, 60]}
      />
      <FoldedNode
        x={438}
        y={366}
        width={158}
        height={92}
        kind={KINDS.violet}
        bars={[76, 54, 66]}
      />
      <OpenPanel
        x={214}
        y={178}
        width={204}
        bars={[88, 56, 112, 72, 96]}
        selected={2}
        kinds={[
          KINDS.orange,
          KINDS.teal,
          KINDS.blue,
          KINDS.green,
          KINDS.violet,
        ]}
      />
    </svg>
  );
}

export function FolderFigure({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 470"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <Markers prefix="folder" />

      <g strokeLinecap="round">
        <path
          d="M 80 144 C 52 216 56 292 72 352"
          stroke="var(--edge)"
          strokeWidth={1}
          opacity={0.4}
          markerEnd="url(#folder-edge)"
        />
        <path
          d="M 530 164 C 566 226 566 292 552 346"
          stroke="var(--edge)"
          strokeWidth={1}
          opacity={0.4}
          markerEnd="url(#folder-edge)"
        />
        <path
          d="M 152 101 C 174 128 172 176 196 203.5"
          stroke="var(--incoming)"
          strokeWidth={1.4}
          opacity={0.9}
          markerEnd="url(#folder-incoming)"
        />
        <path
          d="M 80 352 C 118 330 160 306 196 284.5"
          stroke="var(--incoming)"
          strokeWidth={1.4}
          opacity={0.9}
          markerEnd="url(#folder-incoming)"
        />
        <path
          d="M 440 203.5 C 458 188 452 142 470 122"
          stroke="var(--outgoing)"
          strokeWidth={1.4}
          opacity={0.9}
          markerEnd="url(#folder-outgoing)"
        />
        <path
          d="M 440 257.5 C 470 282 468 316 500 346"
          stroke="var(--outgoing)"
          strokeWidth={1.4}
          opacity={0.9}
          markerEnd="url(#folder-outgoing)"
        />
      </g>

      <FoldedNode
        x={14}
        y={58}
        width={138}
        height={86}
        kind={KINDS.blue}
        bars={[66, 48]}
      />
      <FoldedNode
        x={470}
        y={76}
        width={118}
        height={88}
        kind={KINDS.green}
        bars={[58, 44]}
      />
      <FoldedNode
        x={452}
        y={346}
        width={132}
        height={90}
        kind={KINDS.violet}
        bars={[62, 46]}
      />
      <FoldedNode
        x={18}
        y={352}
        width={124}
        height={80}
        kind={KINDS.orange}
        bars={[56, 42]}
      />
      <OpenPanel
        x={196}
        y={110}
        width={244}
        bars={[92, 60, 120, 78, 104, 66]}
        selected={2}
        kinds={[
          KINDS.orange,
          KINDS.teal,
          KINDS.blue,
          KINDS.green,
          KINDS.violet,
          KINDS.red,
        ]}
      />
    </svg>
  );
}
