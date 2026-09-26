export const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

export const formatMs = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;

/** Keeps sub-cent costs readable, e.g. $0.00012. */
export const formatUsd = (usd: number) =>
  usd >= 0.01 ? `$${usd.toFixed(2)}` : `$${usd.toPrecision(2).replace(/0+$/, "")}`;

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export const formatTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : timeFormatter.format(date);
};

export const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
