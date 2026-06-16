import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "./utils/cn";

// ── Types ──────────────────────────────────────────────────────────────────
interface ProxyEntry {
  server: string;
  port: string;
  secret: string;
  fullUrl: string;
  mode: "normal" | "secure" | "fake-tls";
}

interface SourceDef {
  name: string;
  url: string;
  parser: "line" | "json";
}

// ── Sources ─────────────────────────────────────────────────────────────────
const SOURCES: SourceDef[] = [
  {
    name: "SoliSpirit/mtproto",
    url: "https://raw.githubusercontent.com/SoliSpirit/mtproto/master/all_proxies.txt",
    parser: "line",
  },
  {
    name: "shablin/mtproto-proxy",
    url: "https://raw.githubusercontent.com/shablin/mtproto-proxy/main/data/valid_proxy.txt",
    parser: "line",
  },
];

// ── Parser helpers ──────────────────────────────────────────────────────────
function parseLineToProxy(raw: string): ProxyEntry | null {
  const m = raw.match(
    /(?:tg:\/\/proxy|https:\/\/t\.me\/proxy)\?server=([^&]+)&port=(\d+)&secret=([^&\s]+)/i,
  );
  if (!m) return null;
  const server = decodeURIComponent(m[1]);
  const port = m[2];
  const secretRaw = m[3];
  let mode: ProxyEntry["mode"] = "normal";
  if (secretRaw.startsWith("ee")) mode = "fake-tls";
  else if (secretRaw.startsWith("dd")) mode = "secure";
  const fullUrl = `tg://proxy?server=${encodeURIComponent(server)}&port=${port}&secret=${secretRaw}`;
  return { server, port, secret: secretRaw, fullUrl, mode };
}

// ── Fetch with CORS fallbacks ───────────────────────────────────────────────
const CORS_FALLBACKS = [
  (u: string) => u,
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

async function fetchWithFallbacks(url: string): Promise<string> {
  let lastErr: unknown = null;
  for (const wrap of CORS_FALLBACKS) {
    try {
      const resp = await fetch(wrap(url), { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.text();
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All fetch attempts failed");
}

async function fetchSource(source: SourceDef): Promise<ProxyEntry[]> {
  const text = await fetchWithFallbacks(source.url);
  if (source.parser === "json") {
    try {
      const data = JSON.parse(text);
      const proxies = Array.isArray(data) ? data : data.proxies || [];
      return proxies
        .map(
          (p: {
            host?: string;
            server?: string;
            port?: number | string;
            secret?: string;
          }): ProxyEntry | null => {
            const full = `tg://proxy?server=${encodeURIComponent(p.host || p.server || "")}&port=${p.port || 443}&secret=${p.secret || ""}`;
            return parseLineToProxy(full);
          },
        )
        .filter((x: ProxyEntry | null): x is ProxyEntry => x !== null);
    } catch {
      // fall through
    }
  }
  const lines = text.split(/\r?\n/);
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map(parseLineToProxy)
    .filter((x: ProxyEntry | null): x is ProxyEntry => x !== null);
}

// ── Sub-components ──────────────────────────────────────────────────────────
function Toast({ msg, show }: { msg: string; show: boolean }) {
  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-zinc-800 px-6 py-3 text-sm font-medium text-white shadow-2xl transition-all duration-300",
        show
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0 pointer-events-none",
      )}
    >
      {msg}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ── Bulk Open Modal ─────────────────────────────────────────────────────────
function BulkOpenModal({
  proxies,
  onClose,
}: {
  proxies: ProxyEntry[];
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);
  const total = proxies.length;

  const start = useCallback(async () => {
    setRunning(true);
    setDone(false);
    cancelRef.current = false;

    for (let i = 0; i < total; i++) {
      if (cancelRef.current) break;
      setCurrent(i + 1);

      // Use an iframe to trigger tg:// links without popup-blocker issues.
      // Each link is a protocol handler open — the browser hands it to Telegram
      // without creating a new tab.
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = proxies[i].fullUrl;
      document.body.appendChild(iframe);

      // Small delay so Telegram can register each one before the next arrives
      await new Promise((r) => setTimeout(r, 350));

      // Clean up
      document.body.removeChild(iframe);
    }

    setRunning(false);
    setDone(true);
  }, [proxies, total]);

  const stop = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
            <svg className="h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.24-.213-.054-.334-.373-.12l-6.87 4.326-2.96-.924c-.643-.2-.657-.643.136-.953l11.564-4.458c.538-.196 1.006.128.835.938z" />
            </svg>
            Bulk Import to Telegram
          </h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Before start */}
          {!running && !done && (
            <>
              <div className="rounded-xl bg-amber-50 border border-amber-200/60 px-4 py-3">
                <p className="text-xs text-amber-800 leading-relaxed">
                  <strong>How it works:</strong> Each proxy link will be sent to
                  Telegram one by one. Your Telegram app will receive them as proxy
                  add requests. Keep Telegram open during this process.
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-zinc-600 mb-1">
                  Ready to open <strong className="text-zinc-900">{total}</strong> proxies
                </p>
                <p className="text-[11px] text-zinc-400">
                  ~{Math.ceil((total * 0.35))}s estimated time
                </p>
              </div>
            </>
          )}

          {/* Running */}
          {running && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>Opening proxies...</span>
                  <span className="font-mono font-semibold text-zinc-800">
                    {current} / {total}
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-400 transition-all duration-300 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              {current > 0 && current <= total && (
                <p className="text-xs font-mono text-zinc-400 truncate">
                  {proxies[current - 1]?.server}:{proxies[current - 1]?.port}
                </p>
              )}
            </>
          )}

          {/* Done */}
          {done && (
            <div className="text-center py-2">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 mb-3">
                <svg className="h-6 w-6 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-zinc-800">
                {cancelRef.current
                  ? `Stopped after ${current} of ${total} proxies`
                  : `All ${total} proxies sent to Telegram!`}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Check your Telegram app to confirm the proxies were added.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-100 px-6 py-4">
          {!running && !done && (
            <>
              <button
                onClick={onClose}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={start}
                className="rounded-xl bg-gradient-to-r from-blue-500 to-sky-500 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-blue-200 hover:from-blue-600 hover:to-sky-600 transition-all cursor-pointer flex items-center gap-2"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.24-.213-.054-.334-.373-.12l-6.87 4.326-2.96-.924c-.643-.2-.657-.643.136-.953l11.564-4.458c.538-.196 1.006.128.835.938z" />
                </svg>
                Open All {total} Proxies
              </button>
            </>
          )}
          {running && (
            <button
              onClick={stop}
              className="rounded-xl bg-red-500 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-red-200 hover:bg-red-600 transition-all cursor-pointer flex items-center gap-2"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop
            </button>
          )}
          {done && (
            <button
              onClick={onClose}
              className="rounded-xl bg-gradient-to-r from-blue-500 to-sky-500 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-blue-200 hover:from-blue-600 hover:to-sky-600 transition-all cursor-pointer"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProxyRow({
  proxy,
  index,
  onCopy,
}: {
  proxy: ProxyEntry;
  index: number;
  onCopy: (url: string) => void;
}) {
  const modeBadge = {
    normal: "bg-zinc-100 text-zinc-600",
    secure: "bg-amber-50 text-amber-700",
    "fake-tls": "bg-blue-50 text-blue-700",
  }[proxy.mode];

  const modeDot = {
    normal: "bg-zinc-400",
    secure: "bg-amber-500",
    "fake-tls": "bg-blue-500",
  }[proxy.mode];

  const modeLabel = {
    normal: "Normal",
    secure: "dd",
    "fake-tls": "ee",
  }[proxy.mode];

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-zinc-200/70 bg-white/80 px-4 py-3 hover:border-blue-200/60 hover:shadow-sm transition-all duration-200">
      <span className="w-7 text-xs font-mono text-zinc-400 tabular-nums text-right shrink-0">
        {index}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-800 truncate">
            {proxy.server}
          </span>
          <span className="text-xs font-mono text-zinc-400 shrink-0">:{proxy.port}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0",
              modeBadge,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", modeDot)} />
            {modeLabel}
          </span>
        </div>
        <p className="text-[11px] font-mono text-zinc-400 truncate mt-0.5">
          {proxy.secret.length > 40 ? proxy.secret.slice(0, 40) + "..." : proxy.secret}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <a
          href={proxy.fullUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-500 hover:bg-sky-100 hover:text-sky-600 transition-colors"
          title="Open in Telegram"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.24-.213-.054-.334-.373-.12l-6.87 4.326-2.96-.924c-.643-.2-.657-.643.136-.953l11.564-4.458c.538-.196 1.006.128.835.938z" />
          </svg>
        </a>
        <button
          onClick={() => onCopy(proxy.fullUrl)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-blue-100 hover:text-blue-600 transition-all duration-200 cursor-pointer"
          title="Copy link"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [proxies, setProxies] = useState<ProxyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "normal" | "secure" | "fake-tls">("all");
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<number>(0);
  const [bulkOpen, setBulkOpen] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastVisible(false), 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const fetchProxies = useCallback(
    async (source: SourceDef) => {
      setLoading(true);
      setError("");
      setActiveSource(source.name);
      try {
        const result = await fetchSource(source);
        setProxies(result);
        showToast(`Loaded ${result.length} proxies from ${source.name}`);
      } catch (e) {
        setError(`Failed to fetch from ${source.name}: ${(e as Error).message}`);
        setProxies([]);
      } finally {
        setLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    fetchProxies(SOURCES[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast("Copied to clipboard!");
      } catch {
        showToast("Failed to copy");
      }
    },
    [showToast],
  );

  const filtered = proxies.filter((p) => {
    if (filterMode !== "all" && p.mode !== filterMode) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        p.server.toLowerCase().includes(q) ||
        p.port.includes(q) ||
        p.secret.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCopyAll = useCallback(async () => {
    const allLinks = filtered.map((p) => p.fullUrl).join("\n");
    try {
      await navigator.clipboard.writeText(allLinks);
      showToast(`Copied ${filtered.length} links to clipboard!`);
    } catch {
      showToast("Failed to copy");
    }
  }, [filtered, showToast]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-blue-50/30">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="relative overflow-hidden border-b border-zinc-200/60 bg-white/60 backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-sky-400/5" />
        <div className="relative mx-auto max-w-5xl px-6 py-8 sm:py-10">
          <div className="flex items-center gap-4 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 shadow-lg shadow-blue-200/50">
              <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.24-.213-.054-.334-.373-.12l-6.87 4.326-2.96-.924c-.643-.2-.657-.643.136-.953l11.564-4.458c.538-.196 1.006.128.835.938z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
                MTProto Proxy List
              </h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                Live working Telegram proxy links — fetch &amp; bulk import
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        {/* ── Source selector ─────────────────────────────────────── */}
        <section>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Source:
            </span>
            {SOURCES.map((src) => (
              <button
                key={src.name}
                onClick={() => fetchProxies(src)}
                disabled={loading}
                className={cn(
                  "rounded-xl border px-4 py-2 text-xs font-semibold transition-all duration-200 cursor-pointer disabled:opacity-50",
                  activeSource === src.name
                    ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
                )}
              >
                {src.name}
                {activeSource === src.name && loading && (
                  <span className="ml-2 inline-block">
                    <Spinner />
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={() =>
                fetchProxies(SOURCES.find((s) => s.name === activeSource) || SOURCES[0])
              }
              disabled={loading}
              className="ml-auto rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <svg
                className={cn("h-3.5 w-3.5", loading && "animate-spin")}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path d="M1 4v6h6M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
              </svg>
              Refresh
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">
              {error}
            </div>
          )}

          {/* Stats + Filter + Bulk actions bar */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              {loading ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Fetching...
                </span>
              ) : (
                <span>
                  <strong className="text-zinc-800">{proxies.length}</strong> total
                  {filtered.length !== proxies.length && (
                    <>
                      , <strong className="text-zinc-800">{filtered.length}</strong> shown
                    </>
                  )}
                </span>
              )}
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search server, port, or secret..."
              className="flex-1 min-w-[180px] rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />

            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as typeof filterMode)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all cursor-pointer"
            >
              <option value="all">All modes</option>
              <option value="normal">Normal</option>
              <option value="secure">Secure (dd)</option>
              <option value="fake-tls">Fake-TLS (ee)</option>
            </select>
          </div>

          {/* ── Bulk action buttons ───────────────────────────────── */}
          {filtered.length > 0 && !loading && (
            <div className="flex flex-wrap items-center gap-3 mb-4 rounded-xl border border-blue-200/60 bg-blue-50/40 px-4 py-3">
              <span className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Bulk Actions
              </span>

              <button
                onClick={() => setBulkOpen(true)}
                className="rounded-lg bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-blue-600 hover:to-sky-600 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.24-.213-.054-.334-.373-.12l-6.87 4.326-2.96-.924c-.643-.2-.657-.643.136-.953l11.564-4.458c.538-.196 1.006.128.835.938z" />
                </svg>
                Open All {filtered.length} in Telegram
              </button>

              <button
                onClick={handleCopyAll}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                Copy All Links
              </button>

              <span className="text-[11px] text-zinc-400 ml-auto hidden sm:block">
                Opens each proxy in Telegram one-by-one for import
              </span>
            </div>
          )}

          {/* Proxy list */}
          {loading && proxies.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-zinc-400">
              <Spinner />
              <span className="ml-3 text-sm">Loading proxies...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
              <svg
                className="h-10 w-10 mb-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <p className="text-sm">No proxies match your filters</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filtered.map((proxy, i) => (
                <ProxyRow
                  key={`${proxy.server}:${proxy.port}-${i}`}
                  proxy={proxy}
                  index={i + 1}
                  onCopy={handleCopy}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── How to use ────────────────────────────────────────── */}
        <section className="border-t border-zinc-200/60 pt-8">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
            <svg className="h-5 w-5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            How to Use
          </h2>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              {
                step: "1",
                title: "Pick a proxy",
                desc: "Click the Telegram icon next to any proxy to add it individually.",
              },
              {
                step: "2",
                title: "Or bulk import",
                desc: "Click \"Open All in Telegram\" to send every proxy to Telegram at once.",
              },
              {
                step: "3",
                title: "Accept in Telegram",
                desc: "Your Telegram app will show each proxy as an add-proxy prompt. Accept them.",
              },
              {
                step: "4",
                title: "Pick the fastest",
                desc: "Go to Settings → Data & Storage → Proxy. Telegram shows ping for each — pick the lowest.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-5"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600 mb-3">
                  {item.step}
                </span>
                <h3 className="text-sm font-bold text-zinc-700 mb-1.5">{item.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Legend ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
            <svg className="h-5 w-5 text-purple-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Protocol Modes
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: "Normal",
                color: "zinc",
                desc: "No prefix. No padding. Fastest, but easily detected by DPI.",
              },
              {
                label: "Secure (dd)",
                color: "amber",
                desc: "dd prefix. Random packet sizes help evade basic DPI detection.",
              },
              {
                label: "Fake-TLS (ee)",
                color: "blue",
                desc: "ee prefix. Traffic looks like HTTPS/TLS 1.3. Strongest DPI evasion.",
              },
            ].map((item) => (
              <div
                key={item.label}
                className={cn(
                  "rounded-xl border px-4 py-3",
                  item.color === "zinc" && "border-zinc-200/80 bg-zinc-50/50",
                  item.color === "amber" && "border-amber-200/80 bg-amber-50/30",
                  item.color === "blue" && "border-blue-200/80 bg-blue-50/30",
                )}
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold mb-1.5",
                    item.color === "zinc" && "bg-zinc-200 text-zinc-600",
                    item.color === "amber" && "bg-amber-100 text-amber-700",
                    item.color === "blue" && "bg-blue-100 text-blue-700",
                  )}
                >
                  {item.label}
                </span>
                <p className="text-[11px] text-zinc-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Sources ───────────────────────────────────────────── */}
        <section className="border-t border-zinc-200/60 pt-8">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Open Source Data Sources</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                name: "SoliSpirit/mtproto",
                desc: "199+ proxies, auto-updated every 12 hours, verified",
                url: "https://github.com/SoliSpirit/mtproto",
              },
              {
                name: "shablin/mtproto-proxy",
                desc: "~96 alive proxies, latency-tested, updated every 2 hours",
                url: "https://github.com/shablin/mtproto-proxy",
              },
              {
                name: "FreeFolksOn/abc-configs",
                desc: "Curated VPN/proxy configs including MTProto, updated every 10 min",
                url: "https://github.com/FreeFolksOn/abc-configs-free-vpn-proxy-list",
              },
              {
                name: "Grim1313/mtproto-for-telegram",
                desc: "Clickable Markdown mirror of SoliSpirit proxies",
                url: "https://github.com/Grim1313/mtproto-for-telegram",
              },
            ].map((r) => (
              <a
                key={r.name}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-zinc-200/80 bg-white/80 p-4 hover:border-blue-200/60 hover:shadow-sm transition-all duration-300 group"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 group-hover:bg-blue-50 transition-colors shrink-0">
                  <svg
                    className="h-5 w-5 text-zinc-500 group-hover:text-blue-500"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-800 group-hover:text-blue-600 transition-colors">
                    {r.name}
                  </p>
                  <p className="text-xs text-zinc-500">{r.desc}</p>
                </div>
                <svg
                  className="ml-auto h-4 w-4 text-zinc-300 group-hover:text-blue-400 transition-colors shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path d="M7 17L17 7M17 7H7M17 7v10" />
                </svg>
              </a>
            ))}
          </div>
        </section>

        {/* ── Footer ────────────────────────────────────────────── */}
        <footer className="border-t border-zinc-200/60 pt-6 pb-10 text-center">
          <p className="text-xs text-zinc-400">
            Proxies fetched from public open-source repositories. Not affiliated with Telegram.{" "}
            <a
              href="https://core.telegram.org/proxy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              Telegram Proxy Docs
            </a>
          </p>
        </footer>
      </main>

      {/* ── Bulk Open Modal ──────────────────────────────────────── */}
      {bulkOpen && (
        <BulkOpenModal proxies={filtered} onClose={() => setBulkOpen(false)} />
      )}

      <Toast msg={toastMsg} show={toastVisible} />
    </div>
  );
}
