import { roundValue } from "../../lib/replayAnalysisUi";

export type TrendMetricKey =
  | "l_cancel_rate"
  | "tech_miss_rate"
  | "neutral_win_rate"
  | "damage_per_opening"
  | "actions_per_minute"
  | "stocks_remaining";

export type TrendChartMatch = {
  replayId: string;
  filename: string;
  startedAt?: string;
  stats: {
    l_cancel_rate: number;
    tech_attempts: number;
    missed_techs: number;
    neutral_win_rate: number;
    damage_per_opening: number;
    actions_per_minute: number;
  };
  trackedPlayerStocksLeft: number | null;
};

function formatMetricValue(value: number, suffix = "") {
  return `${roundValue(value)}${suffix}`;
}

function getTrendMetricValue(match: TrendChartMatch, metricKey: TrendMetricKey) {
  if (metricKey === "tech_miss_rate") {
    if (!match.stats.tech_attempts) {
      return 0;
    }

    const successfulTechs = Math.max(
      0,
      match.stats.tech_attempts - match.stats.missed_techs,
    );
    return roundValue((successfulTechs / match.stats.tech_attempts) * 100);
  }

  if (metricKey === "stocks_remaining") {
    return match.trackedPlayerStocksLeft ?? 0;
  }

  return match.stats[metricKey];
}

function formatReplayTime(startedAt?: string) {
  if (!startedAt) {
    return null;
  }

  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TrendLineChart({
  matches,
  sessionIndices,
  metricKey,
  label,
  description,
  color,
  suffix = "",
}: {
  matches: TrendChartMatch[];
  sessionIndices: number[];
  metricKey: TrendMetricKey;
  label: string;
  description: string;
  color: string;
  suffix?: string;
}) {
  if (matches.length === 0) {
    return null;
  }

  const width = 320;
  const height = 160;
  const paddingX = 24;
  const paddingY = 20;
  const values = matches.map((match) => getTrendMetricValue(match, metricKey));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;
  const yAxisTicks = [maxValue, minValue + valueRange / 2, minValue];
  const dividerXs = sessionIndices
    .map((_, index) => ({ index }))
    .filter(
      ({ index }) =>
        index > 0 && sessionIndices[index - 1] !== sessionIndices[index],
    )
    .map(({ index }) =>
      matches.length === 1
        ? width / 2
        : paddingX + (index / (matches.length - 1)) * (width - paddingX * 2),
    );

  const points = values
    .map((value, index) => {
      const x =
        matches.length === 1
          ? width / 2
          : paddingX + (index / (matches.length - 1)) * (width - paddingX * 2);
      const y =
        height -
        paddingY -
        ((value - minValue) / valueRange) * (height - paddingY * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="mt-1 text-xs text-slate-400">{description}</p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p>High {formatMetricValue(maxValue, suffix)}</p>
          <p>Low {formatMetricValue(minValue, suffix)}</p>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
        {dividerXs.map((x, index) => (
          <line
            key={`${label}-session-${index}`}
            x1={x}
            y1={paddingY}
            x2={x}
            y2={height - paddingY}
            stroke="#64748b"
            strokeDasharray="4 4"
            strokeWidth="1"
            opacity="0.8"
          />
        ))}
        <line
          x1={paddingX}
          y1={height - paddingY}
          x2={width - paddingX}
          y2={height - paddingY}
          stroke="#475569"
          strokeWidth="1"
        />
        <line
          x1={paddingX}
          y1={paddingY}
          x2={paddingX}
          y2={height - paddingY}
          stroke="#475569"
          strokeWidth="1"
        />
        {yAxisTicks.map((tickValue) => {
          const y =
            height -
            paddingY -
            ((tickValue - minValue) / valueRange) * (height - paddingY * 2);

          return (
            <g key={`${label}-tick-${tickValue}`}>
              <line
                x1={paddingX - 4}
                y1={y}
                x2={paddingX}
                y2={y}
                stroke="#64748b"
                strokeWidth="1"
              />
              <text
                x={paddingX - 8}
                y={y + 3}
                fill="#94a3b8"
                fontSize="9"
                textAnchor="end"
              >
                {formatMetricValue(tickValue, suffix)}
              </text>
            </g>
          );
        })}
        <text
          x={width / 2}
          y={height - 4}
          fill="#94a3b8"
          fontSize="10"
          textAnchor="middle"
        >
          Games in chronological order
        </text>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        {values.map((value, index) => {
          const x =
            matches.length === 1
              ? width / 2
              : paddingX +
                (index / (matches.length - 1)) * (width - paddingX * 2);
          const y =
            height -
            paddingY -
            ((value - minValue) / valueRange) * (height - paddingY * 2);

          return (
            <g key={`${label}-${matches[index].replayId}`}>
              <circle cx={x} cy={y} r="4" fill={color} />
              <title>
                {`${matches[index].filename}: ${formatMetricValue(
                  value,
                  suffix,
                )}${
                  matches[index].startedAt
                    ? ` • ${formatReplayTime(matches[index].startedAt)}`
                    : ""
                }`}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
