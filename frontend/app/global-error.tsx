'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: '"Times New Roman", Times, serif',
          color: '#000',
          backgroundColor: '#fff',
          padding: '2rem',
        }}
      >
        <h2>Something went wrong</h2>
        <p>{error.message || 'An unexpected error occurred. Please try again.'}</p>
        <button onClick={reset} style={{ cursor: 'pointer', marginTop: '1rem' }}>
          Try again
        </button>
      </body>
    </html>
  );
}
