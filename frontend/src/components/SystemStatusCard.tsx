'use client';

import { useEffect, useState } from 'react';

type SystemStatus = {
  health: { database: string; dbLatencyMs: number };
  counts: {
    activeUsers: number;
    activeDevices: number;
    recentLoginFailures: number;
    pendingUnblocks: number;
  };
  metrics: {
    instanceStartedAt: string;
    totalRequests: number;
    totalErrors: number;
    totalRateLimitHits: number;
    latency: { p50: number; p95: number; p99: number; samples: number };
    loginSuccesses: number;
    loginFailures: number;
  };
  timestamp: string;
};

export default function SystemStatusCard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/system-status');
        if (!res.ok) return; // non-admin — silently hide
        const data = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        // silently hide on error
      }
    }
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  if (!status) return null;

  const dbOk = status.health.database === 'ok';

  return (
    <section style={{
      marginBottom: '1.5rem',
      padding: '1rem 1.25rem',
      border: '1px solid #e0e0e0',
      borderRadius: 8,
      fontFamily: 'Times New Roman, serif',
      background: '#fafafa',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#17a2b8' }}>System Status</h3>
        <span style={{ fontSize: '0.75rem', color: '#888' }}>
          Updated {new Date(status.timestamp).toLocaleTimeString()}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
        <StatusItem
          label="Database"
          value={dbOk ? 'Healthy' : 'Unavailable'}
          detail={`${status.health.dbLatencyMs}ms`}
          ok={dbOk}
        />
        <StatusItem
          label="Active Users"
          value={String(status.counts.activeUsers)}
        />
        <StatusItem
          label="Active Devices"
          value={String(status.counts.activeDevices)}
        />
        <StatusItem
          label="Login Failures (1h)"
          value={String(status.counts.recentLoginFailures)}
          ok={status.counts.recentLoginFailures < 20}
        />
        <StatusItem
          label="Pending Unblocks"
          value={String(status.counts.pendingUnblocks)}
          ok={status.counts.pendingUnblocks < 10}
        />
        <StatusItem
          label="API Requests"
          value={String(status.metrics.totalRequests)}
          detail={`${status.metrics.totalErrors} errors`}
          ok={status.metrics.totalErrors === 0 || status.metrics.totalErrors / Math.max(1, status.metrics.totalRequests) < 0.01}
        />
        <StatusItem
          label="Latency (p95)"
          value={status.metrics.latency.samples > 0 ? `${status.metrics.latency.p95}ms` : 'N/A'}
          ok={status.metrics.latency.p95 < 300 || status.metrics.latency.samples === 0}
        />
        <StatusItem
          label="Rate Limit Hits"
          value={String(status.metrics.totalRateLimitHits)}
        />
      </div>
    </section>
  );
}

function StatusItem({ label, value, detail, ok }: { label: string; value: string; detail?: string; ok?: boolean }) {
  const color = ok === undefined ? '#333' : ok ? '#2e7d32' : '#c62828';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{value}</div>
      {detail && <div style={{ fontSize: '0.7rem', color: '#888' }}>{detail}</div>}
    </div>
  );
}
