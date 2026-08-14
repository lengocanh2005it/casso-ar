export function successResponseSchema() {
  return {
    type: 'object' as const,
    properties: {
      success: { type: 'boolean' as const, example: true },
    },
  };
}
