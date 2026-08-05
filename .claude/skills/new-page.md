# Skill: new-page

Create a new page with route, layout, and placeholder content.

## When to use

User says: "tạo trang mới", "new page", "thêm route"

## File Structure

```
apps/frontend/src/features/<feature>/
  pages/
    <page-name>.tsx        # Main page component
    <page-name>.test.tsx   # Page test (optional)
  index.ts                 # Barrel export
```

## Steps

1. Use `frontend-design` to establish the page's visual behavior. Write a focused test first for any interactive or data-dependent behavior and verify RED.

2. Create the smallest page component that makes the test pass:
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

3. Add route in `routes/index.tsx`:
```tsx
{
  path: '/<page-name>',
  element: <<PageName />,
}
```

4. Add nav item in sidebar (if new top-level page)

5. Create API hook if needed:
```tsx
// features/<feature>/hooks/use-<entity>.ts
export function use<Entity>() {
  return useQuery({
    queryKey: ['<entity>'],
    queryFn: () => fetcher('/api/v1/<endpoint>'),
  });
}
```

6. Refactor only after green, run frontend tests/type-check, then use `verification-before-completion` before committing: `feat: add <page-name> page`
