export function TruncatedCopyId({ id }: { id: string }) {
  return (
    <button
      type="button"
      className="font-mono text-xs underline decoration-dotted underline-offset-2"
      title={id}
      translate="no"
      onClick={() => navigator.clipboard.writeText(id)}
    >
      {id.slice(0, 8)}…
    </button>
  );
}
