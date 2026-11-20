'use client';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        padding: '2rem',
        fontFamily: '"Times New Roman", Times, serif',
        color: '#000',
      }}
    >
      <h2>Something went wrong</h2>
      <p>{error.message || 'An unexpected error occurred. Please try again.'}</p>
      <button onClick={reset} style={{ cursor: 'pointer', marginTop: '1rem' }}>
        Try again
      </button>
    </div>
  );
}
