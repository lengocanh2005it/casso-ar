export function TruncatedCopyId({ id }: { id: string }) {
  return (
    <button
      type="button"
      className="rounded-sm font-mono text-xs underline decoration-dotted underline-offset-2 transition-colors duration-150 ease-out motion-reduce:transition-none pointer-hover:hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      title={id}
      translate="no"
      onClick={() => navigator.clipboard.writeText(id)}
    >
      {id.slice(0, 8)}…
    </button>
  );
}
