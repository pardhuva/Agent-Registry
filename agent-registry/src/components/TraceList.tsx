import { useState } from "react";
import { ExternalLink, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { Trace } from "../types";

function StatusBadge({ status }: { status: Trace["status"] }) {
  if (status === "success")
    return (
      <span className="flex items-center gap-1 text-green-700 text-xs font-medium">
        <CheckCircle2 size={13} /> Success
      </span>
    );
  if (status === "error")
    return (
      <span className="flex items-center gap-1 text-red-600 text-xs font-medium">
        <XCircle size={13} /> Error
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-blue-600 text-xs font-medium">
      <Loader2 size={13} className="animate-spin" /> Running
    </span>
  );
}

function TraceRow({ trace }: { trace: Trace }) {
  const [open, setOpen] = useState(false);

  const ts = new Date(trace.timestamp).toLocaleString();
  const dur = trace.duration != null
    ? trace.duration >= 1000
      ? `${(trace.duration / 1000).toFixed(2)}s`
      : `${trace.duration}ms`
    : null;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-2">
      <div
        className="flex items-center gap-3 px-4 py-3 bg-white cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <StatusBadge status={trace.status} />
        <span className="flex-1 text-sm font-medium text-gray-900 truncate">{trace.name}</span>
        {trace.model && (
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{trace.model}</span>
        )}
        {trace.tokens != null && (
          <span className="text-xs text-gray-500">{trace.tokens.toLocaleString()} tokens</span>
        )}
        {dur && <span className="text-xs text-gray-500">{dur}</span>}
        <span className="text-xs text-gray-400">{ts}</span>
        {trace.url && (
          <a
            href={trace.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-gray-400 hover:text-blue-600 transition-colors"
          >
            <ExternalLink size={14} />
          </a>
        )}
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </div>

      {open && (
        <div className="border-t border-gray-200 bg-gray-50 p-4 grid grid-cols-2 gap-4">
          {trace.input && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Input</p>
              <pre className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
                {tryPretty(trace.input)}
              </pre>
            </div>
          )}
          {trace.output && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Output</p>
              <pre className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
                {tryPretty(trace.output)}
              </pre>
            </div>
          )}
          {!trace.input && !trace.output && (
            <p className="text-xs text-gray-500 col-span-2">No input/output data available.</p>
          )}
        </div>
      )}
    </div>
  );
}

function tryPretty(str: string) {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

interface Props {
  traces: Trace[];
  loading: boolean;
  error: string | null;
  emptyMsg?: string;
}

export function TraceList({ traces, loading, error, emptyMsg }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-gray-500">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading traces…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <strong>Error fetching traces:</strong> {error}
      </div>
    );
  }

  if (!traces.length) {
    return (
      <div className="text-center py-12 text-sm text-gray-500">
        {emptyMsg ?? "No traces found for this agent."}
      </div>
    );
  }

  return (
    <div>
      {traces.map((t) => (
        <TraceRow key={t.id} trace={t} />
      ))}
    </div>
  );
}
