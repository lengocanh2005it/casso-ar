# Skill: new-page

Create a new page with route, layout, and placeholder content.

## When to use

User says: "create a new page", "new page", "add route"

## File Structure

```
apps/frontend/src/features/<feature>/
  pages/
    <page-name>.tsx        # Main page component
    <page-name>.test.tsx   # Page test (optional)
  index.ts                 # Barrel export
```

## Steps

1. Create page component:
```tsx
import { useQuery } from '@tanstack/react-query';
import { fetcher } from '@/lib/api-client';

export function <PageName>() {
  const { data, isLoading } = useQuery({
    queryKey: ['<entity>'],
    queryFn: () => fetcher('/api/v1/<endpoint>'),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1><Page Title></h1>
      {/* Content */}
    </div>
  );
}
```

2. Add route in `routes/index.tsx`:
```tsx
{
  path: '/<page-name>',
  element: <<PageName />,
}
```

3. Add nav item in sidebar (if new top-level page)

4. Create API hook if needed:
```tsx
// features/<feature>/hooks/use-<entity>.ts
export function use<Entity>() {
  return useQuery({
    queryKey: ['<entity>'],
    queryFn: () => fetcher('/api/v1/<endpoint>'),
  });
}
```

5. Commit: `feat: add <page-name> page`
