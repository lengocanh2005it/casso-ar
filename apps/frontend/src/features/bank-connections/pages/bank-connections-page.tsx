import { usePollConnections } from '../api/use-bank-connections';
import { ConnectDialog } from '../components/connect-dialog';
import { ConnectionTable } from '../components/connection-table';

export function BankConnectionsPage() {
  const connectionsQuery = usePollConnections();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">TÍCH HỢP</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Kết nối ngân hàng
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kết nối <span className="text-primary">Casso Flow</span> để tự động
            đồng bộ giao dịch ngân hàng.
          </p>
        </div>
        <ConnectDialog />
      </div>
      {connectionsQuery.isPending && (
        <p role="status" aria-live="polite">
          Đang tải kết nối ngân hàng…
        </p>
      )}
      {connectionsQuery.isError && (
        <p role="alert" aria-live="polite" className="text-destructive">
          Không thể tải kết nối ngân hàng.
        </p>
      )}
      {connectionsQuery.data && (
        <ConnectionTable connections={connectionsQuery.data.items} />
      )}
    </div>
  );
}
