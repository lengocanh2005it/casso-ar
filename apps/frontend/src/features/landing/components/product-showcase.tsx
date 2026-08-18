export function ProductShowcase() {
  return (
    <section className="hidden pb-16 sm:block">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-md">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
          <img
            src="/dashboard-preview.png"
            alt="Giao diện Casso Ledger — Trang chủ tổng quan công nợ"
            className="relative w-full"
          />
        </div>
      </div>
    </section>
  );
}
