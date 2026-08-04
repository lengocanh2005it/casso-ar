import { Outlet } from 'react-router-dom';

export function AppLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
