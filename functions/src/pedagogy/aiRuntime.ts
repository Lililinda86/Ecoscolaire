/** Deployment capability only; never a budget or privacy approval. Disabled by default. */
export function pedagogyAiRuntimeEnabled(environment: Record<string, string | undefined> = process.env) {
  return environment.GCLOUD_PROJECT === 'ecoscolaire-staging' &&
    environment.FUNCTIONS_EMULATOR !== 'true' &&
    environment.PEDAGOGY_AI_SECRET_BINDING_ENABLED === 'true';
}
export function pedagogyAiRuntimeSecrets(environment: Record<string, string | undefined> = process.env): string[] {
  // CLI discovery strips custom process variables and loads dotenv afterwards.
  // Declare the binding there without enabling provider requests at runtime.
  const stagingDiscovery = environment.GCLOUD_PROJECT === 'ecoscolaire-staging' &&
    environment.FUNCTIONS_CONTROL_API === 'true' && environment.FUNCTIONS_EMULATOR !== 'true';
  return stagingDiscovery || pedagogyAiRuntimeEnabled(environment) ? ['PEDAGOGY_OPENAI_API_KEY'] : [];
}
