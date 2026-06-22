'use client';

export default function PrintCardButton() {
  return (
    <button onClick={() => window.print()} className="btn-primary btn-sm">
      Print Card
    </button>
  );
}
