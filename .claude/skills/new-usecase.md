# Skill: new-usecase

Create a new use case with unit test.

## When to use

User says: "create a use case", "new use case for X", "add feature Y"

## File naming

- Use case: `<action>.usecase.ts`
- Test: `<action>.usecase.spec.ts`

## Steps

1. Define input interface:
```typescript
export interface <Action>Input {
  <entityId>: string;
  // other params
}
```

2. Create use case class:
```typescript
@Injectable()
export class <Action>UseCase {
  constructor(
    @Inject(<ENTITY>_REPOSITORY) private readonly repo: I<Entity>Repository,
    // other deps
  ) {}

  async execute(input: <Action>Input): Promise<void> {
    const entity = await this.repo.findById(input.<entityId>);
    if (!entity) throw new Error('<Entity> not found');
    // domain logic — wrap in transaction if money/status changes
    await this.repo.save(updated);
  }
}
```

3. Create unit test with mocked repositories:
```typescript
describe('<Action>UseCase', () => {
  it('does X', async () => {
    const repo = { findById: jest.fn().mockResolvedValue(entity), save: jest.fn() };
    const useCase = new <Action>UseCase(repo as any);
    await useCase.execute({ entityId: '1' });
    expect(repo.save).toHaveBeenCalled();
  });
});
```

4. Register in module providers

5. Run test: `npx jest --testPathPattern <usecase-name>`

6. Commit: `feat: add <Action>UseCase`
