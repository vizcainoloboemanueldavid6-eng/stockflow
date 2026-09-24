'use client';

/** Last-resort boundary for errors thrown by the root layout itself. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'grid',
          placeItems: 'center',
          minHeight: '100dvh',
          margin: 0,
        }}
      >
        <div style={{ textAlign: 'center', padding: 16 }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ color: '#5a6577' }}>StockFlow could not load. Please try again.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#2563EB',
              color: '#fff',
              border: 0,
              borderRadius: 6,
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
