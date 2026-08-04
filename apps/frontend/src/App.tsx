import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/app-layout';
import { appRoutes } from '@/routes';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          {appRoutes.map((route) =>
            route.index ? (
              <Route key="index" index element={route.element} />
            ) : (
              <Route
                key={route.path}
                path={route.path}
                element={route.element}
              />
            ),
          )}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
