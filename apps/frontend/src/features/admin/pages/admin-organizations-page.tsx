import { useCallback, useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  listOrganizations,
  lockOrganization,
  type OrganizationListItem,
  unlockOrganization,
} from '../api/admin-api';
import { BreakerSwitch } from '../components/breaker-switch';

export function AdminOrganizationsPage() {
  const [items, setItems] = useState<OrganizationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    const result = await listOrganizations(1, 100);
    setItems(result.items);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleToggle(org: OrganizationListItem) {
    if (org.status === 'ACTIVE') {
      await lockOrganization(org.id);
    } else {
      await unlockOrganization(org.id);
    }
    await reload();
  }

  if (isLoading) return <p>Đang tải...</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tên tổ chức</TableHead>
          <TableHead className="font-mono">ID</TableHead>
          <TableHead>Ngày tạo</TableHead>
          <TableHead>Trạng thái</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((org) => (
          <TableRow key={org.id}>
            <TableCell>{org.name}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {org.id}
            </TableCell>
            <TableCell>
              {new Date(org.createdAt).toLocaleDateString('vi-VN')}
            </TableCell>
            <TableCell>
              <BreakerSwitch
                checked={org.status === 'LOCKED'}
                onCheckedChange={() => handleToggle(org)}
                label={
                  org.status === 'ACTIVE'
                    ? `Lock ${org.name}`
                    : `Unlock ${org.name}`
                }
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
