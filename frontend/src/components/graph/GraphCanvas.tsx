import { useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import type { EntityType, GraphEdge, GraphNode } from "@/types";
import { entityColorVar } from "@/components/ui-kit";

const W = 156;
const H = 40;

export interface GraphHandle {
  fit: () => void;
  focus: (id: string) => void;
  zoom: (factor: number) => void;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId?: string | null | undefined;
  selectedEdgeId?: string | null | undefined;
  highlightNodeIds?: string[] | undefined;
  highlightEdgeIds?: string[] | undefined;
  onSelectNode?: (id: string | null) => void | undefined;
  onSelectEdge?: (id: string | null) => void | undefined;
  className?: string | undefined;
  ref?: Ref<GraphHandle> | undefined;
  ariaLabel?: string | undefined;
  /** Ordered node ids rendered with step-number badges */
  pathOrder?: string[] | undefined;
}

function boundsOf(nodes: GraphNode[]) {
  if (!nodes.length) return { x: 0, y: 0, w: 1000, h: 600 };
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const pad = 110;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad / 1.6;
  return { x, y, w: Math.max(...xs) - x + pad, h: Math.max(...ys) - y + pad / 1.6 };
}

function trim(sx: number, sy: number, tx: number, ty: number) {
  const dx = tx - sx;
  const dy = ty - sy;
  const scale = Math.min(W / 2 / Math.abs(dx || 1e-6), H / 2 / Math.abs(dy || 1e-6));
  return { x: tx - dx * scale - Math.sign(dx) * 2, y: ty - dy * scale - Math.sign(dy) * 2 };
}

function Marker({ type, color }: { type: EntityType; color: string }) {
  const cx = -W / 2 + 16;
  switch (type) {
    case "Incident":
      return <polygon points={`${cx},-7 ${cx + 7},0 ${cx},7 ${cx - 7},0`} fill={color} />;
    case "Person":
    case "Team":
      return <circle cx={cx} cy={0} r={type === "Team" ? 6 : 5} fill="none" stroke={color} strokeWidth={2.5} />;
    case "Dataset":
      return <rect x={cx - 6} y={-6} width={12} height={12} rx={6} fill={color} />;
    case "Fix":
    case "Verification Test":
      return <polygon points={`${cx - 6},5 ${cx},-6 ${cx + 6},5`} fill={color} />;
    case "Decision":
    case "Document":
      return <rect x={cx - 5} y={-6} width={10} height={12} rx={1} fill="none" stroke={color} strokeWidth={2} />;
    default:
      return <rect x={cx - 6} y={-6} width={12} height={12} rx={2} fill={color} />;
  }
}

export function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  highlightNodeIds,
  highlightEdgeIds,
  onSelectNode,
  onSelectEdge,
  className,
  ref,
  ariaLabel = "Dependency graph",
  pathOrder,
}: Props) {
  const initial = useMemo(() => boundsOf(nodes), [nodes]);
  const [vb, setVb] = useState(initial);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  useImperativeHandle(ref, () => ({
    fit: () => setVb(boundsOf(nodes)),
    zoom: (k) =>
      setVb((v) => {
        const w = Math.min(Math.max(v.w * k, 300), 3000);
        const h = (w * v.h) / v.w;
        return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
      }),
    focus: (id) => {
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      const w = 620;
      const h = (w * initial.h) / initial.w;
      setVb({ x: n.x - w / 2, y: n.y - h / 2, w, h });
    },
  }));

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const neighborIds = useMemo(() => {
    if (!selectedNodeId) return null;
    const s = new Set([selectedNodeId]);
    edges.forEach((e) => {
      if (e.source === selectedNodeId) s.add(e.target);
      if (e.target === selectedNodeId) s.add(e.source);
    });
    return s;
  }, [selectedNodeId, edges]);

  const hlNodes = highlightNodeIds?.length ? new Set(highlightNodeIds) : neighborIds;
  const hlEdges = highlightEdgeIds?.length ? new Set(highlightEdgeIds) : null;

  const edgeActive = (e: GraphEdge) =>
    hlEdges ? hlEdges.has(e.id) : selectedNodeId ? e.source === selectedNodeId || e.target === selectedNodeId : false;
  const anyFocus = !!hlNodes || !!hlEdges;

  const toSvg = (dx: number, dy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { dx: (dx * vb.w) / r.width, dy: (dy * vb.h) / r.height };
  };

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label={ariaLabel}
      className={`h-full w-full touch-none select-none ${className ?? ""}`}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, moved: false };
      }}
      onPointerMove={(e) => {
        if (!drag.current || e.buttons !== 1) return;
        const { dx, dy } = toSvg(e.clientX - drag.current.x, e.clientY - drag.current.y);
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true;
        drag.current.x = e.clientX;
        drag.current.y = e.clientY;
        setVb((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
      }}
      onPointerUp={(e) => {
        const wasClick = drag.current && !drag.current.moved;
        drag.current = null;
        if (wasClick && e.target === svgRef.current) {
          onSelectNode?.(null);
          onSelectEdge?.(null);
        }
      }}
      onWheel={(e) => {
        const k = e.deltaY > 0 ? 1.1 : 0.9;
        setVb((v) => {
          const w = Math.min(Math.max(v.w * k, 300), 3000);
          const h = (w * v.h) / v.w;
          return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
        });
      }}
    >
      <defs>
        {["edge", "primary"].map((k) => (
          <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={k === "edge" ? "var(--edge)" : "var(--primary)"} />
          </marker>
        ))}
      </defs>

      {edges.map((e) => {
        const s = byId.get(e.source);
        const t = byId.get(e.target);
        if (!s || !t) return null;
        const end = trim(s.x, s.y, t.x, t.y);
        const active = edgeActive(e) || selectedEdgeId === e.id;
        const dim = anyFocus && !active;
        const mx = (s.x + t.x) / 2;
        const my = (s.y + t.y) / 2;
        const lw = e.type.length * 6.2 + 12;
        return (
          <g
            key={e.id}
            className="cursor-pointer"
            opacity={dim ? 0.18 : 1}
            onPointerUp={(ev) => {
              ev.stopPropagation();
              drag.current = null;
              onSelectEdge?.(e.id);
            }}
          >
            <line x1={s.x} y1={s.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth={14} />
            <line
              x1={s.x}
              y1={s.y}
              x2={end.x}
              y2={end.y}
              stroke={active ? "var(--primary)" : "var(--edge)"}
              strokeWidth={active ? 2 : 1.3}
              strokeDasharray={e.type === "SIMILAR_TO" ? "5 4" : undefined}
              markerEnd={`url(#arrow-${active ? "primary" : "edge"})`}
            />
            {active && hlEdges && e.type !== "SIMILAR_TO" && (
              <line x1={s.x} y1={s.y} x2={end.x} y2={end.y} stroke="var(--primary)" strokeWidth={2} strokeDasharray="3 9" className="edge-flow" opacity={0.9} />
            )}
            <rect x={mx - lw / 2} y={my - 9} width={lw} height={18} rx={4} fill="var(--background)" stroke={selectedEdgeId === e.id ? "var(--primary)" : "var(--border)"} />
            <text x={mx} y={my + 3.5} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono)" fill={active ? "var(--primary)" : "var(--muted-foreground)"}>
              {e.type}
            </text>
          </g>
        );
      })}

      {nodes.map((n) => {
        const color = entityColorVar[n.type];
        const selected = selectedNodeId === n.id;
        const dim = anyFocus && !(hlNodes?.has(n.id) ?? false) && !selected;
        const label = n.label.length > 20 ? n.label.slice(0, 19) + "…" : n.label;
        return (
          <g
            key={n.id}
            transform={`translate(${n.x},${n.y})`}
            className="cursor-pointer"
            opacity={dim ? 0.3 : 1}
            tabIndex={0}
            role="button"
            aria-label={`${n.type}: ${n.label}`}
            aria-pressed={selected}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                onSelectNode?.(n.id);
              }
            }}
            onPointerUp={(ev) => {
              ev.stopPropagation();
              if (drag.current?.moved) return;
              drag.current = null;
              onSelectNode?.(n.id);
            }}
          >
            <title>{`${n.label} (${n.type})`}</title>
            {selected && <rect x={-W / 2 - 4} y={-H / 2 - 4} width={W + 8} height={H + 8} rx={10} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={2} />}
            <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={7} fill="var(--card)" stroke={selected ? color : "var(--border)"} strokeWidth={selected ? 1.5 : 1} />
            <Marker type={n.type} color={color} />
            {pathOrder?.includes(n.id) && (
              <g transform={`translate(${W / 2 - 2},${-H / 2 + 2})`}>
                <circle r={9} fill="var(--primary)" />
                <text y={3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--primary-foreground)">
                  {pathOrder.indexOf(n.id) + 1}
                </text>
              </g>
            )}
            <text x={-W / 2 + 30} y={-2} fontSize={11.5} fontWeight={500} fill="var(--foreground)">
              {label}
            </text>
            <text x={-W / 2 + 30} y={11} fontSize={9} fill="var(--muted-foreground)" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {n.type}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
