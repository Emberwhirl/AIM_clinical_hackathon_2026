import { useId, useState } from "react";
import {
  answerColumns,
  formatValue,
  isPercentage,
  isSuppressed,
  metricLabel,
  type AnswerRow,
} from "@/lib/answers";
import { useT } from "@/lib/i18n";

// Deliberately schematic boundaries, in geographic west-to-east positions.
const REGIONS = [
  {
    name: "Vorarlberg",
    path: "M18 163 L48 147 L69 177 L60 219 L36 208 Z",
    x: 44,
    y: 185,
    code: "V",
  },
  {
    name: "Tirol",
    path: "M69 177 L112 180 L145 160 L180 173 L218 153 L250 174 L244 205 L192 216 L150 207 L113 222 L60 219 Z M250 216 L275 210 L294 242 L268 249 Z",
    x: 151,
    y: 191,
    code: "T",
  },
  {
    name: "Salzburg",
    path: "M250 174 L265 131 L285 118 L308 147 L330 138 L343 167 L319 196 L294 242 L275 210 L244 205 Z",
    x: 288,
    y: 174,
    code: "S",
  },
  {
    name: "Oberösterreich",
    path: "M285 118 L309 80 L337 53 L370 66 L393 94 L386 143 L343 167 L330 138 L308 147 Z",
    x: 345,
    y: 112,
    code: "OÖ",
  },
  {
    name: "Niederösterreich",
    path: "M370 66 L405 40 L443 47 L464 25 L507 30 L531 56 L565 67 L578 103 L565 137 L539 158 L504 149 L474 166 L440 144 L386 143 L393 94 Z M535 100 L532 118 L549 123 L559 111 L550 99 Z",
    x: 470,
    y: 96,
    code: "NÖ",
  },
  {
    name: "Wien",
    path: "M535 100 L550 99 L559 111 L549 123 L532 118 Z",
    x: 545,
    y: 114,
    code: "W",
  },
  {
    name: "Burgenland",
    path: "M565 137 L581 144 L573 171 L592 193 L581 218 L584 249 L563 257 L551 225 L559 198 L547 179 L539 158 Z",
    x: 571,
    y: 202,
    code: "B",
  },
  {
    name: "Steiermark",
    path: "M386 143 L440 144 L474 166 L504 149 L539 158 L547 179 L559 198 L551 225 L563 257 L524 250 L493 265 L454 249 L418 241 L382 216 L344 227 L319 196 L343 167 Z",
    x: 441,
    y: 204,
    code: "St",
  },
  {
    name: "Kärnten",
    path: "M294 242 L319 196 L344 227 L382 216 L418 241 L454 249 L428 273 L388 280 L344 265 L308 273 L268 249 Z",
    x: 359,
    y: 252,
    code: "K",
  },
] as const;

export function ResultsChart({
  rows,
  columns = answerColumns(rows, true),
}: {
  rows: AnswerRow[];
  columns?: string[];
}) {
  const t = useT();
  const id = useId().replace(/:/g, "");
  const [picked, setPicked] = useState<string>();
  const [tooltip, setTooltip] = useState<string>();
  const preferred = columns.find(
    (c) =>
      isPercentage(
        c,
        rows.map((r) => r.metrics[c]),
      ) || /mean|average/i.test(c),
  );
  const metric = picked && columns.includes(picked) ? picked : (preferred ?? columns[0]);
  if (!rows.length || !metric) return null;
  const percentage = isPercentage(
    metric,
    rows.map((r) => r.metrics[metric]),
  );
  const points = rows.map((row) => {
    const raw = row.metrics[metric];
    // Only disclosed finite numbers participate in scales. Never parse suppression strings.
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
            const label = `${row.groups.join(" / ") || t("chart.total")} (${formatValue(raw, percentage)})`;
    return { row, value, label, suppressed: isSuppressed(raw) };
  });
  const numbers = points.flatMap((p) => (p.value === undefined ? [] : [p.value]));
  const low = Math.min(0, ...numbers);
  const high = Math.max(0, ...numbers);
  const span = high - low || 1;
  const zero = (-low / span) * 100;
  const min = numbers.length ? Math.min(...numbers) : undefined;
  const max = numbers.length ? Math.max(...numbers) : undefined;
  const map =
    rows.length === 9 &&
    REGIONS.every((region) =>
      rows.some((row) => row.groups.length === 1 && row.groups[0] === region.name),
    );
  const summary = `${metricLabel(metric)}. ${t("chart.tableFallback")}`;
  const interactions = (label: string) => ({
    tabIndex: 0,
    onFocus: () => setTooltip(label),
    onBlur: () => setTooltip(undefined),
    onMouseEnter: () => setTooltip(label),
    onMouseLeave: () => setTooltip(undefined),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape") setTooltip(undefined);
    },
    "aria-label": label,
    "aria-describedby": tooltip === label ? `${id}-tooltip` : undefined,
    className:
      "outline-none focus:outline focus:outline-[3px] focus:outline-offset-2 focus:outline-current",
  });
  return (
    <section
      className="mb-6 min-w-0 space-y-4 rounded-md border border-border bg-card p-5"
      aria-label={t("chart.title")}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        {columns.length > 1 && (
          <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {t("chart.metric")}
            <select
              className="min-w-0 max-w-full rounded border border-input bg-card px-3 py-1.5 text-sm font-normal"
              value={metric}
              onChange={(event) => {
                setPicked(event.target.value);
                setTooltip(undefined);
              }}
            >
              {columns.map((column) => (
                <option key={column} value={column}>
                  {metricLabel(column)}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="text-sm text-muted-foreground">{t("chart.tableFallback")}</p>
      </div>
      <div className={map ? "grid min-w-0 gap-8 lg:grid-cols-2" : "min-w-0"}>
        <div>
          <p className="mb-3 text-sm font-semibold">
            {t("chart.bars")}, {metricLabel(metric)}
          </p>
          <div role="img" aria-label={`${t("chart.bars")}, ${summary}`} className="space-y-2.5">
            {points.map((point, index) => {
              const x =
                point.value === undefined ? 0 : ((Math.min(0, point.value) - low) / span) * 100;
              const width =
                point.value === undefined ? undefined : (Math.abs(point.value) / span) * 100;
              return (
                <div key={index} role="img" {...interactions(point.label)}>
                  <p className="mb-1 break-words text-xs font-medium">{point.label}</p>
                  <svg
                    aria-hidden="true"
                    className="h-5 w-full"
                    viewBox="0 0 100 20"
                    preserveAspectRatio="none"
                  >
                    <rect width="100" height="20" fill="transparent" />
                    {point.value === undefined ? (
                      <rect
                        x="0.5"
                        y="0.5"
                        width="99"
                        height="19"
                        data-suppressed={point.suppressed ? "true" : undefined}
                        fill={point.suppressed ? "#f1f5f9" : "#e2e8f0"}
                        stroke="#94a3b8"
                        strokeWidth="1"
                      />
                    ) : (
                      <>
                        <line x1={zero} x2={zero} y2="20" stroke="#475569" strokeWidth="0.4" />
                        <rect x={x} width={width} height="20" fill="#075985" />
                      </>
                    )}
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
        {map && (
          <div className="min-w-0">
            <p className="mb-3 text-sm font-semibold">{t("chart.map")}</p>
            <svg
              role="img"
              aria-label={`${t("chart.map")}, ${summary}`}
              viewBox="0 0 610 300"
              className="w-full rounded border border-border bg-white text-slate-950"
            >
              {REGIONS.map((region) => {
                const point = points.find((p) => p.row.groups[0] === region.name)!;
                const lightness =
                  point.value === undefined
                    ? undefined
                    : 36 - 18 * (max === min ? 0.5 : (point.value - min!) / (max! - min!));
                return (
                  <g
                    key={region.name}
                    role="img"
                    {...interactions(point.label)}
                    data-region={region.name}
                  >
                    <title>{point.label}</title>
                    <path
                      d={region.path}
                      fillRule="evenodd"
                      stroke={point.suppressed ? "#64748b" : "#0f172a"}
                      strokeWidth="1.5"
                      data-suppressed={point.suppressed ? "true" : undefined}
                      fill={
                        point.suppressed
                          ? "#f1f5f9"
                          : lightness === undefined
                            ? "#e2e8f0"
                            : `hsl(202 90% ${lightness}%)`
                      }
                    />
                    <text
                      x={region.x}
                      y={region.y}
                      textAnchor="middle"
                      fontSize="13"
                      fontWeight="bold"
                      fill={point.value === undefined ? "#334155" : "white"}
                      stroke="none"
                      aria-hidden="true"
                    >
                      {region.code}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="mt-2 text-xs text-muted-foreground">{t("chart.schematic")}</p>
            <div className="mt-4 space-y-1.5 text-xs" aria-label={t("chart.legend")}>
              <span className="font-medium text-foreground">
                {t("chart.legend")}, {metricLabel(metric)}
              </span>
              {min !== undefined && max !== undefined ? (
                <>
                  <div className="grid h-2.5 grid-cols-5 overflow-hidden rounded-xs border border-slate-700">
                    <span style={{ backgroundColor: "hsl(202 90% 36%)" }} />
                    <span style={{ backgroundColor: "hsl(202 90% 31.5%)" }} />
                    <span style={{ backgroundColor: "hsl(202 90% 27%)" }} />
                    <span style={{ backgroundColor: "hsl(202 90% 22.5%)" }} />
                    <span style={{ backgroundColor: "hsl(202 90% 18%)" }} />
                  </div>
                  <div className="flex justify-between font-mono text-muted-foreground">
                    <span>{formatValue(min, percentage)}</span>
                    <span>{formatValue(max, percentage)}</span>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">{t("chart.noValues")}</p>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2.5 border-t border-border pt-3 text-xs text-muted-foreground">
        <svg width="20" height="14" className="shrink-0" aria-hidden="true">
          <rect
            x="0.5"
            y="0.5"
            width="19"
            height="13"
            fill="#f1f5f9"
            stroke="#94a3b8"
            strokeWidth="1"
            data-suppressed="true"
          />
        </svg>
        <span>{t("chart.suppressed")}</span>
      </div>
      <div className="min-h-5 break-words text-xs font-mono text-muted-foreground" aria-live="polite">
        {tooltip && (
          <span id={`${id}-tooltip`} role="tooltip">
            {tooltip}
          </span>
        )}
      </div>
    </section>
  );
}
