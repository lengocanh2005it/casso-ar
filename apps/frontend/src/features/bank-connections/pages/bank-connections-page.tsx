import { Landmark } from 'lucide-react';
import { PageHeading } from '@/components/layout/page-heading';
import { SectionCard } from '@/components/layout/section-card';
import { usePollConnections } from '../api/use-bank-connections';
import { ConnectDialog } from '../components/connect-dialog';
import {
  ConnectionActions,
  ConnectionTable,
} from '../components/connection-table';

export function BankConnectionsPage() {
  const connectionsQuery = usePollConnections();

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="TÍCH HỢP"
        title="Kết nối ngân hàng"
        description={
          <>
            Kết nối <span className="text-primary">Casso Flow</span> để tự động
            đồng bộ giao dịch ngân hàng.
          </>
        }
        icon={Landmark}
        tone="info"
        actions={<ConnectDialog />}
      />
      <SectionCard
        icon={Landmark}
        title="Trạng thái kết nối"
        description="Theo dõi quyền truy cập và lần đồng bộ gần nhất."
        action={
          connectionsQuery.data ? (
            <ConnectionActions connections={connectionsQuery.data.items} />
          ) : null
        }
      >
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
      </SectionCard>
    </div>
  );
}
