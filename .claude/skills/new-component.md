# Skill: new-component

Create a new React component.

## When to use

User says: "tạo component", "new component", "thêm component"

## File Structure

```
apps/frontend/src/features/<feature>/
  components/
    <component-name>.tsx
    <component-name>.test.tsx (optional)
```

Or for shared components:
```
apps/frontend/src/components/
  ui/          shadcn/ui primitives
  layout/      Layout components
  <name>.tsx   Shared component
```

## Rules

- Only create shared component if used by 2+ features (Rule of Two)
- Component for 1 feature → keep in that feature folder
- Use shadcn/ui primitives when possible
- Props interface above component
- Export from feature's `index.ts` barrel

## Example

```tsx
interface <Component>Props {
  data: <EntityType>;
  onSelect?: (id: string) => void;
}

export function <ComponentName>({ data, onSelect }: <Component>Props) {
  return (
    <div onClick={() => onSelect?.(data.id)}>
      {/* Content */}
    </div>
  );
}
```

## Commit

`feat: add <component-name> component`
