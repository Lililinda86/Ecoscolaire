const TARGET_PROJECT_ID = 'ecoscolaire-c5861';

if (TARGET_PROJECT_ID !== 'ecoscolaire-staging') {
  throw new Error(
    'Disabled legacy diagnostic: credential authentication is forbidden outside ecoscolaire-staging.',
  );
}
