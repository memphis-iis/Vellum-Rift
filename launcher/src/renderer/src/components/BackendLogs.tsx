import { useState, useEffect, useRef } from 'react';

interface BackendLogsProps {
  backendUrl: string;
}

export function BackendLogs(_props: BackendLogsProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load existing logs
    window.launcherAPI.getBackendLogs().then(setLogs);

    // Listen for new logs
    window.launcherAPI.onBackendLog((log: string) => {
      setLogs(prev => [...prev.slice(-99), log]);
    });
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleClearLogs = async () => {
    await window.launcherAPI.clearBackendLogs();
    setLogs([]);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>Backend Logs</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={handleClearLogs} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
            Clear
          </button>
          <button className="btn btn-secondary" onClick={() => setIsExpanded(!isExpanded)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>
      
      <div 
        ref={logContainerRef}
        className="log-container"
        style={{ 
          maxHeight: isExpanded ? '400px' : '150px',
          overflowY: 'auto',
          background: 'var(--bg-primary)',
          borderRadius: '0.25rem',
          padding: '0.5rem',
          fontFamily: 'monospace',
          fontSize: '0.75rem',
          lineHeight: '1.4'
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>
            No logs yet. Start the backend to see logs.
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} style={{ 
              color: log.includes('ERROR') ? 'var(--error)' : 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}>
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}