import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Required suites for this release. Existing generic CI and its gates are unchanged.
    include: ['tests/unit/{FeeTargeting,OptionalFeeAssignment,SchoolFeeCatalog,TuitionDeadlineSettings,StudentsTransportPersistence,Payments*,Transport*,StudentAccount*,Financial*,AccountFeeGroups,Advantage*,studentAccountReceipt,studentPrivacy*,studentTransport*,payment*,transport*,financial*,classCatalog*,sortClasses*,academicCalendarNavigation}*.spec.{ts,tsx}'],
    pool: 'threads',
    watch: false,
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
