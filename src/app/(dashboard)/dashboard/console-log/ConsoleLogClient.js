"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

const LOG_LEVEL_COLORS = {
  LOG: "text-green-400",
  INFO: "text-blue-400",
  WARN: "text-yellow-400",
  ERROR: "text-red-400",
  DEBUG: "text-purple-400",
};

function colorLine(line) {
  const match = line.match(/\[(\w+)\]/g);
  const levelTag = match ? match[1]?.replace(/\[|\]/g, "") : null;
  const color = LOG_LEVEL_COLORS[levelTag] || "text-green-400";
  return <span className={color}>{line}</span>;
}

export default function ConsoleLogClient() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const logRef = useRef(null);

  const handleClear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  useEffect(() => {
    let es;
    fetch("/api/auth/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : {}))
      .then((status) => {
        if (status?.user?.id) {
          setForbidden(true);
          return;
        }
        es = new EventSource("/api/translator/console-logs/stream");

        es.onopen = () => setConnected(true);

        es.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.type === "init") {
            setLogs(msg.logs.slice(-CONSOLE_LOG_CONFIG.maxLines));
          } else if (msg.type === "line") {
            setLogs((prev) => {
              const next = [...prev, msg.line];
              return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
            });
          } else if (msg.type === "lines") {
            setLogs((prev) => {
              const next = [...prev, ...msg.lines];
              return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
            });
          } else if (msg.type === "clear") {
            setLogs([]);
          }
        };

        es.onerror = () => setConnected(false);
      })
      .catch(() => {});

    return () => { if (es) es.close(); };
  }, []);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  if (forbidden) {
    return (
      <div className="">
        <Card>
          <p className="text-sm text-text-muted p-4">Admin only — console log is restricted to the instance admin.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="">
      <Card>
        <div className="flex items-center justify-end px-4 pt-3 pb-2">
          <Button size="sm" variant="outline" icon="delete" onClick={handleClear}>
            Clear
          </Button>
        </div>
        <div
          ref={logRef}
          className="bg-black rounded-b-lg p-4 text-xs font-mono h-[calc(100vh-220px)] overflow-y-auto"
        >
          {logs.length === 0 ? (
            <span className="text-text-muted">No console logs yet.</span>
          ) : (
            <div className="space-y-0.5">
              {logs.map((line, i) => (
                <div key={i}>{colorLine(line)}</div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
