import { activeFeeClass } from '../../../functions/src/feeTargeting';
import { useAppContext } from '../../context/AppContext';
import { formatCurrency } from '../../utils/paymentReceipt';
import { sortClasses } from '../../utils/sortClasses';
import { getClassOptionLabel } from '../../utils/classCatalog';
import { SchoolFeeCatalog } from './SchoolFeeCatalog';

const deadlineLabel = (value?: string) => value || 'Non configurée';

export function FinancialSettingsReadOnly() {
  const { db } = useAppContext();
  const school = db.school;
  const activeYear = (db.academicYears || []).find(year =>
    year.id === school?.activeAcademicYearId && year.schoolId === school?.id
  );
  if (!school) return null;
  const periods = school.transportPolicy?.billingPeriods || [];
  const rates = school.transportPolicy?.pkRates;
  return <div className="page-container financial-settings-page financial-settings-readonly">
    <div className="page-header"><div>
      <h1>Paramètres financiers</h1>
      <p>Consultation des tarifs officiels nécessaires à l’encaissement. Les autres réglages sensibles restent réservés à la direction.</p>
    </div></div>
    <section className="card" aria-labelledby="readonly-deadlines-title">
      <h2 id="readonly-deadlines-title">Scolarité et échéances</h2>
      <p>Année scolaire : <strong>{activeYear?.name || school.academicYear}</strong></p>
      <dl className="financial-readonly-grid">
        <div><dt>Échéance T1</dt><dd>{deadlineLabel(activeYear?.tuitionPaymentDeadlines?.T1)}</dd></div>
        <div><dt>Échéance T2</dt><dd>{deadlineLabel(activeYear?.tuitionPaymentDeadlines?.T2)}</dd></div>
        <div><dt>Échéance T3</dt><dd>{deadlineLabel(activeYear?.tuitionPaymentDeadlines?.T3)}</dd></div>
      </dl>
    </section>
    <section className="card" aria-labelledby="readonly-class-fees-title">
      <h2 id="readonly-class-fees-title">Tarifs scolaires par classe</h2>
      <div className="financial-readonly-table-wrap"><table className="financial-readonly-table">
        <thead><tr><th>Classe</th><th>Inscription</th><th>T1</th><th>T2</th><th>T3</th></tr></thead>
        <tbody>{sortClasses(db.classes.filter(item => activeFeeClass(item, school.id, school.activeAcademicYearId))).map(item => {
          const fees = school.classFees?.[item.name];
          return <tr key={item.id}><th>{getClassOptionLabel(item, db.classes)}</th><td>{formatCurrency(fees?.registration)}</td><td>{formatCurrency(fees?.t1)}</td><td>{formatCurrency(fees?.t2)}</td><td>{formatCurrency(fees?.t3)}</td></tr>;
        })}</tbody>
      </table></div>
    </section>
    <section className="card" aria-labelledby="readonly-transport-title">
      <h2 id="readonly-transport-title">Transport</h2>
      <p>Maternelle et primaire : transport payant selon le point PK. Secondaire : gratuit, sans dette transport.</p>
      <dl className="financial-readonly-grid">
        <div><dt>PK14 à PK33</dt><dd>{formatCurrency(rates?.pk14To33)} / mois</dd></div>
        <div><dt>PK34 à PK42</dt><dd>{formatCurrency(rates?.pk34To42)} / mois</dd></div>
        <div><dt>Mois facturables</dt><dd>{periods.length ? periods.join(', ') : 'Aucun mois configuré'}</dd></div>
      </dl>
    </section>
    <SchoolFeeCatalog />
  </div>;
}
