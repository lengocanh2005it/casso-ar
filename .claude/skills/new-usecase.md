# Skill: new-usecase

Create a new use case with unit test.

## When to use

User says: "create a use case", "new use case for X", "add feature Y"

## File naming

- Use case: `<action>.usecase.ts`
- Test: `<action>.usecase.spec.ts`

## Steps

1. Define the first desired behavior and write its unit test. Run it and verify that it fails for the expected reason.

2. Define input interface:
```typescript
export interface <Action>Input {
  <entityId>: string;
  // other params
}
```

3. Create the smallest use case implementation that makes the test pass:
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

4. Add the next behavior with one test at a time. Use mocked repositories only at the use-case boundary:
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

5. Register in module providers

6. Run focused tests after each RED and GREEN step: `npx jest --testPathPattern <usecase-name>`

7. Refactor only after green, then commit: `feat: add <Action>UseCase`
