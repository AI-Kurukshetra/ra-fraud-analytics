"use client";

type DataStateProps = {
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  children: React.ReactNode;
};

export function DataState({
  loading,
  error,
  isEmpty,
  emptyTitle,
  emptyDescription,
  children,
}: DataStateProps) {
  if (loading) {
    return (
      <div className="state-card" role="status" aria-live="polite">
        <p className="state-title">Loading data</p>
        <p className="state-text">Fetching latest tenant metrics and workflow items.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="state-card error" role="alert">
        <p className="state-title">Request failed</p>
        <p className="state-text">{error}</p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="state-card" role="status" aria-live="polite">
        <p className="state-title">{emptyTitle}</p>
        <p className="state-text">{emptyDescription}</p>
      </div>
    );
  }

  return <>{children}</>;
}
