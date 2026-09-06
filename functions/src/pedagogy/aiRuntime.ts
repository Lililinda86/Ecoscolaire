/** Deployment capability only; never a budget or privacy approval. Disabled by default. */
export function pedagogyAiRuntimeEnabled(environment: Record<string, string | undefined> = process.env) {
  return environment.PEDAGOGY_AI_SECRET_BINDING_ENABLED === 'true';
}
export function pedagogyAiRuntimeSecrets(environment: Record<string, string | undefined> = process.env): string[] {
  return pedagogyAiRuntimeEnabled(environment) ? ['PEDAGOGY_OPENAI_API_KEY'] : [];
}
