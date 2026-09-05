import { expect, test, type Page } from "@playwright/test";
import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { loginAs } from "./helpers/auth";

const stagingRun = process.env.PEDAGOGY_STAGING_E2E === "true";
const projectId =
  process.env.PEDAGOGY_FIREBASE_PROJECT_ID || "demo-ecoscolaire";
if (stagingRun && projectId !== "ecoscolaire-staging") {
  throw new Error(
    "PRODUCTION_GUARD: staging E2E requires ecoscolaire-staging.",
  );
}
const fixture = {
  uid: "pedagogy-e2e-secretary",
  email: "pedagogy.secretary@emulator.test",
  password: "Pedagogy-E2E-2026!",
  schoolId: "pedagogy-e2e-school",
  otherSchoolId: "pedagogy-e2e-school-b",
  yearId: "pedagogy-e2e-year-2026",
  classId: "pedagogy-e2e-class-primary-1",
  periodId: "pedagogy-e2e-period-1",
  programId: "pedagogy-e2e-curriculum-v1",
  unitId: "pedagogy-e2e-curriculum-v1__primary-1__math__01",
  classProgramId: "pedagogy-e2e-class-program",
  revisionId: "pedagogy-e2e-class-program__v1",
  subjectId: "math",
  staffId: "pedagogy-e2e-teacher",
  assignmentId: "pedagogy-e2e-assignment",
};

const identities = [
  {
    uid: fixture.uid,
    email: fixture.email,
    password: fixture.password,
    name: "Secrétaire Pédagogie",
    role: "secretary",
  },
  ...(["director", "owner", "superAdmin"] as const).map((role) => ({
    uid: `pedagogy-e2e-${role}`,
    email: `pedagogy.${role.toLowerCase()}@emulator.test`,
    password: fixture.password,
    name: `E2E ${role}`,
    role,
  })),
];

const routeVercelPreview = async (page: Page, baseUrl: string) => {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!stagingRun || !bypass) return;
  await page.route(`${baseUrl}/**`, (route) =>
    route.continue({
      headers: {
        ...route.request().headers(),
        "x-vercel-protection-bypass": bypass,
        "x-vercel-set-bypass-cookie": "true",
      },
    }),
  );
};

test.describe("Lot A — parcours secrétaire sécurisé", () => {
  const emulatorRun =
    Boolean(process.env.FIRESTORE_EMULATOR_HOST) &&
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  test.skip(
    !emulatorRun && !stagingRun,
    "Émulateurs ou exécution Staging explicite obligatoires.",
  );
  test.setTimeout(stagingRun ? 180_000 : 30_000);

  test("persiste, reste idempotent et ne modifie aucune collection métier externe", async ({
    page,
    browser,
  }, testInfo) => {
    const app =
      getApps().find((candidate) => candidate.name === "pedagogy-e2e") ||
      initializeApp({ projectId }, "pedagogy-e2e");
    const firestore = getFirestore(app);
    const auth = getAuth(app);
    const protectedCollections = [
      "students",
      "payments",
      "expenses",
      "buses",
      "transportPaymentAllocations",
      "inventory",
      "grades",
      "evaluations",
    ];
    const countProtected = async () =>
      Promise.all(
        protectedCollections.map(
          async (name) =>
            (await firestore.collection(name).count().get()).data().count,
        ),
      );

    const cleanup = async () => {
      for (const collectionName of [
        "teachingPlanItems",
        "teachingPlans",
        "teachingWeeks",
        "schoolCurriculumAdoptions",
        "audit_logs",
      ]) {
        const snapshot = await firestore
          .collection(collectionName)
          .where("schoolId", "==", fixture.schoolId)
          .get();
        const batch = firestore.batch();
        snapshot.docs.forEach((document) => batch.delete(document.ref));
        if (!snapshot.empty) await batch.commit();
      }
      const exact = [
        ["teacherAssignments", fixture.assignmentId],
        ["staff", fixture.staffId],
        ["classSubjects", `${fixture.revisionId}__${fixture.subjectId}`],
        ["teachingPlans", "pedagogy-e2e-cross-school-sentinel"],
        ["classPrograms", fixture.classProgramId],
        ["periods", fixture.periodId],
        ["classes", fixture.classId],
        ["academicYears", fixture.yearId],
        ["schools", fixture.schoolId],
        ["schools", fixture.otherSchoolId],
        ...identities.map(({ uid }) => ["users", uid]),
        ["curriculumUnits", fixture.unitId],
        ["curriculumPrograms", fixture.programId],
      ];
      const batch = firestore.batch();
      exact.forEach(([collectionName, id]) =>
        batch.delete(firestore.collection(collectionName).doc(id)),
      );
      await batch.commit();
      for (const { uid } of identities) {
        try {
          await auth.deleteUser(uid);
        } catch (error) {
          if ((error as { code?: string }).code !== "auth/user-not-found")
            throw error;
        }
      }
    };

    const verifyCleanup = async () => {
      const scopedCollections = [
        "teachingPlanItems",
        "teachingPlans",
        "teachingWeeks",
        "schoolCurriculumAdoptions",
        "audit_logs",
      ];
      const scopedResiduals = await Promise.all(
        scopedCollections.map(async (collectionName) =>
          firestore
            .collection(collectionName)
            .where("schoolId", "==", fixture.schoolId)
            .get()
            .then((snapshot) => snapshot.size),
        ),
      );
      const exactResiduals = await Promise.all(
        [
          ["teacherAssignments", fixture.assignmentId],
          ["staff", fixture.staffId],
          ["classSubjects", `${fixture.revisionId}__${fixture.subjectId}`],
          ["teachingPlans", "pedagogy-e2e-cross-school-sentinel"],
          ["classPrograms", fixture.classProgramId],
          ["periods", fixture.periodId],
          ["classes", fixture.classId],
          ["academicYears", fixture.yearId],
          ["schools", fixture.schoolId],
          ["schools", fixture.otherSchoolId],
          ...identities.map(({ uid }) => ["users", uid]),
          ["curriculumUnits", fixture.unitId],
          ["curriculumPrograms", fixture.programId],
        ].map(([collectionName, id]) =>
          firestore
            .collection(collectionName)
            .doc(id)
            .get()
            .then((document) => (document.exists ? 1 : 0)),
        ),
      );
      let authResiduals = 0;
      for (const { uid } of identities) {
        try {
          await auth.getUser(uid);
          authResiduals += 1;
        } catch (error) {
          if ((error as { code?: string }).code !== "auth/user-not-found")
            throw error;
        }
      }
      const residuals = [...scopedResiduals, ...exactResiduals].reduce(
        (sum, count) => sum + count,
        authResiduals,
      );
      console.log(
        `PEDAGOGY_CLEANUP residuals=${residuals} orphans=${authResiduals}`,
      );
      expect(residuals).toBe(0);
    };

    await cleanup();
    try {
      await Promise.all(
        identities.map(({ uid, email, password, name }) =>
          auth.createUser({ uid, email, password, displayName: name }),
        ),
      );
      const batch = firestore.batch();
      const set = (
        collectionName: string,
        id: string,
        data: Record<string, unknown>,
      ) =>
        batch.set(firestore.collection(collectionName).doc(id), {
          id,
          ...data,
        });
      identities.forEach(({ uid, email, name, role }) =>
        set("users", uid, {
          email,
          name,
          role,
          schoolId: fixture.schoolId,
          isActive: true,
        }),
      );
      set("schools", fixture.schoolId, {
        name: "École E2E Pédagogie",
        activeAcademicYearId: fixture.yearId,
        academicYear: "2026-2027",
        subscriptionStatus: "active",
        isActive: true,
      });
      set("schools", fixture.otherSchoolId, {
        name: "École B interdite",
        subscriptionStatus: "active",
        isActive: true,
      });
      set("academicYears", fixture.yearId, {
        schoolId: fixture.schoolId,
        name: "2026-2027",
        startDate: "2026-09-01",
        endDate: "2027-06-30",
        status: "active",
        createdAt: "2026-09-01",
        createdBy: fixture.uid,
        updatedAt: "2026-09-01",
        updatedBy: fixture.uid,
      });
      set("periods", fixture.periodId, {
        schoolId: fixture.schoolId,
        academicYearId: fixture.yearId,
        name: "Trimestre 1",
        type: "term",
        order: 1,
        startDate: "2026-09-01",
        endDate: "2026-12-18",
        status: "open",
      });
      set("classes", fixture.classId, {
        schoolId: fixture.schoolId,
        name: "SIL E2E",
        type: "francophone",
        section: "francophone",
        cycle: "primary",
        catalogLevelId: "primary-1",
        isActive: true,
      });
      set("classPrograms", fixture.classProgramId, {
        schoolId: fixture.schoolId,
        academicYearId: fixture.yearId,
        classId: fixture.classId,
        status: "published",
        publishedRevisionId: fixture.revisionId,
        publishedRevisionNumber: 1,
        draftRevisionId: fixture.revisionId,
        draftRevisionNumber: 1,
        hasUnpublishedChanges: false,
      });
      set("classSubjects", `${fixture.revisionId}__${fixture.subjectId}`, {
        programId: fixture.classProgramId,
        schoolId: fixture.schoolId,
        academicYearId: fixture.yearId,
        classId: fixture.classId,
        subjectId: fixture.subjectId,
        revisionId: fixture.revisionId,
        revisionNumber: 1,
        subjectNameSnapshot: "Mathématiques",
        weeklyHours: 2,
        isRequired: true,
        displayOrder: 1,
        isActive: true,
      });
      set("staff", fixture.staffId, {
        schoolId: fixture.schoolId,
        name: "Mme Enseignante E2E",
        role: "teacher",
        status: "active",
        isActive: true,
      });
      set("teacherAssignments", fixture.assignmentId, {
        schoolId: fixture.schoolId,
        academicYearId: fixture.yearId,
        classId: fixture.classId,
        subjectId: fixture.subjectId,
        teacherStaffId: fixture.staffId,
        status: "active",
        isActive: true,
        version: 1,
      });
      set("curriculumPrograms", fixture.programId, {
        title: "Programme mock E2E",
        countryCode: "CM",
        section: "francophone",
        cycle: "primary",
        version: "e2e-v1",
        status: "published",
        sourceType: "mock",
        checksum: "e2e-only",
      });
      set("curriculumUnits", fixture.unitId, {
        programId: fixture.programId,
        catalogLevelId: "primary-1",
        subjectId: fixture.subjectId,
        title: "Numération E2E",
        objective: "Comparer des nombres",
        sequence: 1,
        status: "published",
        sourceType: "mock",
      });
      set(
        "schoolCurriculumAdoptions",
        `${fixture.schoolId}__${fixture.yearId}__primary-1`,
        {
          schoolId: fixture.schoolId,
          academicYearId: fixture.yearId,
          catalogLevelId: "primary-1",
          curriculumProgramId: fixture.programId,
          status: "active",
        },
      );
      set("teachingPlans", "pedagogy-e2e-cross-school-sentinel", {
        schoolId: fixture.otherSchoolId,
        academicYearId: fixture.yearId,
        classId: "forbidden",
        weekStartDate: "2026-09-07",
        status: "proposed",
      });
      await batch.commit();

      for (const identity of identities) {
        if (stagingRun) {
          const roleContext = await browser.newContext({
            baseURL: testInfo.project.use.baseURL as string,
          });
          const rolePage = await roleContext.newPage();
          await routeVercelPreview(
            rolePage,
            testInfo.project.use.baseURL as string,
          );
          await loginAs(rolePage, identity.email, identity.password);
          await rolePage.goto("/#/pedagogy");
          await expect(rolePage.getByTestId("nav-pedagogy")).toBeVisible({
            timeout: 15_000,
          });
          await expect(
            rolePage.getByRole("heading", { name: "Pilotage pédagogique" }),
          ).toBeVisible();
          await roleContext.close();
        }
      }

      const before = await countProtected();
      await routeVercelPreview(page, testInfo.project.use.baseURL as string);
      if (stagingRun) {
        await page.goto("/#/diagnostic");
        await expect(
          page.getByTestId("diagnostic-firebase-project"),
        ).toHaveText("ecoscolaire-staging");
      }
      await loginAs(page, fixture.email, fixture.password);
      await page.goto("/#/pedagogy");
      await expect(
        page.getByRole("heading", { name: "Pilotage pédagogique" }),
      ).toBeVisible();
      await expect(page.getByText("forbidden")).toHaveCount(0);
      await page
        .getByRole("link", { name: "Planification", exact: true })
        .click();
      await expect(
        page.getByText(/Progression planifiée uniquement/),
      ).toBeVisible();
      await expect(page.getByText(/^Progression réalisée$/)).toHaveCount(0);
      await page.getByLabel("Classe").selectOption(fixture.classId);
      await page
        .getByRole("button", { name: "Initialiser les semaines" })
        .click();
      await expect(page.getByText("Semaines prêtes.")).toBeVisible();
      await page.getByLabel("Semaine").selectOption({ index: 1 });
      await page.getByRole("button", { name: "Créer la proposition" }).click();
      await expect(page.getByText("Proposition générée.")).toBeVisible();
      const planSnapshot = await firestore
        .collection("teachingPlans")
        .where("schoolId", "==", fixture.schoolId)
        .get();
      expect(planSnapshot.size).toBe(1);
      const planId = planSnapshot.docs[0].id;
      const firstItemCount = (
        await firestore
          .collection("teachingPlanItems")
          .where("planId", "==", planId)
          .count()
          .get()
      ).data().count;
      await page
        .getByRole("button", { name: "Regénérer la proposition" })
        .click();
      await expect(page.getByText("Proposition générée.")).toBeVisible();
      expect(
        (
          await firestore
            .collection("teachingPlanItems")
            .where("planId", "==", planId)
            .count()
            .get()
        ).data().count,
      ).toBe(firstItemCount);
      const lesson = page.getByLabel(/^Leçon /).first();
      await lesson.fill(`${await lesson.inputValue()} — ajusté`);
      await page
        .getByRole("button", { name: "Enregistrer les ajustements" })
        .click();
      await expect(page.getByText("Ajustements enregistrés.")).toBeVisible();
      await page
        .getByLabel("Enseignant ayant validé")
        .selectOption(fixture.staffId);
      await page
        .getByRole("button", { name: "Consigner sa validation" })
        .click();
      await expect(
        page.getByText(
          "Validation de l’enseignant enregistrée par la secrétaire",
        ),
      ).toBeVisible();
      await page.getByRole("link", { name: "Historique" }).click();
      await expect(
        page.getByText("Validé par l’enseignant").first(),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByText("Validé par l’enseignant").first(),
      ).toBeVisible();
      expect(
        (
          await firestore
            .collection("audit_logs")
            .where("schoolId", "==", fixture.schoolId)
            .where("targetId", "==", planId)
            .get()
        ).size,
      ).toBeGreaterThanOrEqual(4);
      expect(await countProtected()).toEqual(before);
      expect(
        (
          await firestore
            .collection("teachingPlans")
            .where("schoolId", "==", fixture.schoolId)
            .get()
        ).size,
      ).toBe(1);
      expect(
        (await firestore.collection("teachingPlans").doc(planId).get()).data()
          ?.status,
      ).toBe("teacher_validated");
      await page.getByRole("button", { name: "Archiver" }).click();
      await expect(page.getByText("Planification archivée.")).toBeVisible();
      expect(
        (await firestore.collection("teachingPlans").doc(planId).get()).data()
          ?.status,
      ).toBe("archived");
      await firestore.collection("audit_logs").add({
        schoolId: fixture.schoolId,
        action: "PEDAGOGY_E2E_COMPLETED",
        targetId: planId,
        createdAt: FieldValue.serverTimestamp(),
      });
    } finally {
      await cleanup();
      await verifyCleanup();
      await deleteApp(app);
    }
  });
});
