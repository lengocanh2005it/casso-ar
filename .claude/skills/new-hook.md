# Skill: new-hook

Create a new React hook for data fetching or business logic.

## When to use

User says: "create hook", "new hook", "add hook"

## File Structure

```
apps/frontend/src/features/<feature>/hooks/
  use-<name>.ts
```

## Patterns

### Data Fetching Hook (TanStack Query)

```tsx
import { useQuery } from '@tanstack/react-query';
import { fetcher } from '@/lib/api-client';

export function use<Entity>List(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['<entities>', params],
    queryFn: () => fetcher(`/api/v1/<endpoint>`, { params }),
  });
}
```

### Mutation Hook

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetcher } from '@/lib/api-client';

export function useCreate<Entity>() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Create<Entity>Dto) =>
      fetcher('/api/v1/<endpoint>', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['<entities>'] });
    },
  });
}
```

### Business Logic Hook

```tsx
import { useMemo } from 'react';

export function use<Logic>(data: <EntityType>[]) {
  return useMemo(() => {
    // Computed values
    return { filtered, grouped, summary };
  }, [data]);
}
```

## Rules

- Hook name starts with `use`
- Place in feature's `hooks/` folder
- Export from feature's `index.ts` barrel
- Query key convention: `['<entity>', params]`

## Commit

`feat: add use-<name> hook`
