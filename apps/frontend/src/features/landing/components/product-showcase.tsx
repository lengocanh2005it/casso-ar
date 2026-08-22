export function ProductShowcase() {
  return (
    <section className="hidden pb-14 sm:block sm:pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-2 shadow-xl shadow-primary/5 sm:p-3">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
          <img
            src="/dashboard-preview.png"
            alt="Giao diện Casso Ledger — Trang chủ tổng quan công nợ"
            className="relative w-full rounded-xl"
          />
        </div>
      </div>
    </section>
  );
}
