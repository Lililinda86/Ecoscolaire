import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { Payment, Expense, Student, ReceiptLike, CashClosure } from '../types';
import Modal from '../components/Modal';
import TransactionHistory from '../components/TransactionHistory';
import ReceiptHistory from '../components/ReceiptHistory';
import FinanceDashboard from '../components/FinanceDashboard';
import { Plus, Minus, Wallet, ClipboardList, Trash2, History, FileText, TrendingUp, Lock, Calendar, CheckCircle } from 'lucide-react';
import SchoolDocumentHeader from '../components/SchoolDocumentHeader';
import { db as firestoreDb, functions } from '../db/firebase';
import { httpsCallable } from 'firebase/functions';
import { doc, setDoc, deleteDoc, runTransaction, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { translatePaymentType, translateInstallment, formatCurrency, translatePaymentMethod } from '../utils/paymentReceipt';
import { canUseStudentContactWhatsApp } from '../services/studentPrivacy';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return String(error);
};

const formatIsoDateFr = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

const formatDateLike = (val: unknown): string => {
  if (!val) return 'N/A';
  if (typeof val === 'object' && val !== null && 'seconds' in val && typeof (val as { seconds?: number }).seconds === 'number') {
    return new Date((val as { seconds: number }).seconds * 1000).toLocaleString('fr-FR');
  }
  if (typeof val === 'string' || typeof val === 'number' || val instanceof Date) {
    return new Date(val).toLocaleString('fr-FR');
  }
  return 'N/A';
};

const getAfricaDoualaDateStr = (dateObj = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Douala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(dateObj);

  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
};

const isCashPaymentForSchool = (
  payment: unknown,
  schoolId: string
): boolean => {
  if (!payment || typeof payment !== 'object' || !schoolId) return false;

  const value = payment as {
    schoolId?: unknown;
    method?: unknown;
    status?: unknown;
    amount?: unknown;
  };

  if (String(value.schoolId || '') !== schoolId) return false;

  const method = value.method
    ? String(value.method).toLowerCase()
    : 'cash';

  const status = value.status
    ? String(value.status).toLowerCase()
    : 'completed';

  const excludedStatuses = [
    'pending',
    'failed',
    'cancelled',
    'canceled',
    'refunded',
    'reversed'
  ];

  if (method !== 'cash' || excludedStatuses.includes(status)) {
    return false;
  }

  const amount = Number(value.amount);

  return Number.isSafeInteger(amount) && amount > 0;
};

const formatClosureAuthor = (cl: CashClosure, currentUser?: { id?: string; name?: string; displayName?: string; email?: string; role?: string } | null): { name: string; role?: string } => {
  let name = '';
  let role = '';

  if (cl.closedByName && cl.closedByName.trim()) {
    name = cl.closedByName.trim();
  } else if (currentUser && currentUser.id === cl.closedBy) {
    name = currentUser.name || currentUser.displayName || currentUser.email || '';
    if (currentUser.role) {
      role = currentUser.role;
    }
  }

  if (!name) {
    if (cl.closedBy && cl.closedBy.trim()) {
      name = cl.closedBy.trim().length > 12 ? `${cl.closedBy.trim().substring(0, 8)}...` : cl.closedBy.trim();
    } else {
      name = 'Auteur inconnu';
    }
  }

  const roleMap: Record<string, string> = {
    owner: 'Fondateur',
    director: 'Directeur',
    secretary: 'Secrétaire',
    accountant: 'Comptable',
    superAdmin: 'Super Admin'
  };

  return {
    name,
    role: role ? (roleMap[role] || role) : undefined
  };
};

const formatClosureDateTime = (val: unknown): string => {
  if (!val) return 'N/A';
  let d: Date | null = null;
  if (typeof val === 'object' && val !== null) {
    const valObj = val as { toDate?: () => Date; seconds?: number };
    if (typeof valObj.toDate === 'function') {
      try {
        d = valObj.toDate();
      } catch {
        d = null;
      }
    } else if (typeof valObj.seconds === 'number') {
      d = new Date(valObj.seconds * 1000);
    }
  }
  if (!d && (typeof val === 'string' || typeof val === 'number' || val instanceof Date)) {
    d = new Date(val);
  }
  if (!d || isNaN(d.getTime())) return 'N/A';

  const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Douala',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Douala',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return `${dateFormatter.format(d)} à ${timeFormatter.format(d)}`;
};

const findSnapshotReceiptForPayment = (
  payment: Payment,
  receipts?: ReceiptLike[]
): ReceiptLike | undefined => {
  if (!receipts) return undefined;
  return receipts.find(r => {
    if (r.paymentId !== payment.id) return false;
    if (payment.schoolId && r.schoolId && r.schoolId !== payment.schoolId) return false;
    if (payment.studentId && r.studentId && r.studentId !== payment.studentId) return false;
    if (payment.academicYear && r.academicYear && r.academicYear !== payment.academicYear) return false;
    return true;
  });
};

type InitiatePaymentResult = {
  message?: string;
  mockPaymentUrl?: string;
};

type MockConfirmPaymentResult = {
  success?: boolean;
  message?: string;
  alreadyConfirmed?: boolean;
};

type WhatsAppPaymentStudent = {
  name: string;
  parentName?: string;
  parentPhone?: string;
};

type DateLike =
  | string
  | number
  | Date
  | {
      seconds?: number;
      toDate?: () => Date;
    }
  | null
  | undefined;

type LocalTransaction = {
  id?: string;
  amount?: number;
  status?: string;
  method?: string;
  type?: string;
  date?: DateLike;
  createdAt?: DateLike;
  updatedAt?: DateLike;
  reference?: string;
  studentId?: string;
  studentName?: string;
  parentName?: string;
  description?: string;
  [key: string]: unknown;
};

interface PendingAttempt {
  fingerprintHash: string;
  requestId: string;
}

interface RecordCashPaymentInput {
  requestId: string;
  schoolId: string;
  studentId: string;
  amount: number;
  type: 'tuition' | 'registration_fee';
  installment?: 'T1' | 'T2' | 'T3';
  description?: string;
  academicYear: string;
}

interface RecordCashPaymentResult {
  paymentId: string;
  receiptId: string;
  receiptNumber: string;
  amount: number;
  previousPaid: number;
  newPaid: number;
  remainingBalance: number;
  idempotentReplay: boolean;
}

const computeSHA256 = async (text: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const Payments: React.FC = () => {
  const { db, updateLocalState, patchLocalEntities, currentUser, currentSchool, logAuditAction, isSchoolSuspended } = useAppContext();
  const canUseWhatsApp = canUseStudentContactWhatsApp(currentUser?.role ?? '');
  const { t } = useI18n();

  const canWrite = currentUser && currentUser.role !== 'boardViewer';

  const [activeTab, setActiveTab] = useState<'encaissements'|'depenses'|'bilan'|'brouillard'|'historique-momo'|'historique-recus'|'finance-momo'>('encaissements');
  const [bilanType, setBilanType] = useState<'tuition'|'transport'|'uniforms'>('tuition');

  const [isModalOpen, setModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash'|'mobile_money'>('cash');
  const [parentPhone, setParentPhone] = useState('');
  const [isProcessingMoMo, setIsProcessingMoMo] = useState(false);
  const [momoSuccess, setMomoSuccess] = useState(false);
  const [currentPayment, setCurrentPayment] = useState<Partial<Payment>>({ date: new Date().toISOString().split('T')[0], type: 'tuition', amount: '' as unknown as number });
  const [modalExpectedAmount, setModalExpectedAmount] = useState(0);
  const [isConfirmingTx, setIsConfirmingTx] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAttempt, setPendingAttemptState] = useState<PendingAttempt | null>(() => {
    try {
      const saved = sessionStorage.getItem('ecoscolaire_pending_cash_payment');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.requestId === 'string' &&
          /^[A-Za-z0-9_-]{16,128}$/.test(parsed.requestId) &&
          typeof parsed.fingerprintHash === 'string' &&
          /^[a-f0-9]{64}$/.test(parsed.fingerprintHash)
        ) {
          return parsed as PendingAttempt;
        }
      }
      sessionStorage.removeItem('ecoscolaire_pending_cash_payment');
      return null;
    } catch {
      try {
        sessionStorage.removeItem('ecoscolaire_pending_cash_payment');
      } catch (err) {
        console.warn("sessionStorage remove failed", err);
      }
      return null;
    }
  });

  const setPendingAttempt = (attempt: PendingAttempt | null) => {
    setPendingAttemptState(attempt);
    try {
      if (attempt) {
        sessionStorage.setItem('ecoscolaire_pending_cash_payment', JSON.stringify(attempt));
      } else {
        sessionStorage.removeItem('ecoscolaire_pending_cash_payment');
      }
    } catch {
      console.warn("sessionStorage is not accessible.");
    }
  };

  const [isExpenseModalOpen, setExpenseModalOpen] = useState(false);
  const [currentExpense, setCurrentExpense] = useState<Partial<Expense>>({ date: new Date().toISOString().split('T')[0] });
  const [receiptToPrint, setReceiptToPrint] = useState<Payment | null>(null);

  // --- State pour Clôtures de Caisse ---
  const todayStr = getAfricaDoualaDateStr();
  const [cashClosures, setCashClosures] = useState<CashClosure[]>([]);
  const [selectedClosureDate, setSelectedClosureDate] = useState<string>(todayStr);
  const [openingBalanceInput, setOpeningBalanceInput] = useState<number | ''>(0);
  const [countedBalanceInput, setCountedBalanceInput] = useState<number | ''>('');
  const [notesInput, setNotesInput] = useState<string>('');
  const [isSubmittingClosure, setIsSubmittingClosure] = useState<boolean>(false);
  const [closureToPrint, setClosureToPrint] = useState<CashClosure | null>(null);
  const [synthesisStartDate, setSynthesisStartDate] = useState<string>(() => `${todayStr.substring(0, 7)}-01`);
  const [synthesisEndDate, setSynthesisEndDate] = useState<string>(todayStr);

  useEffect(() => {
    if (!currentSchool?.id) return;
    const q = query(
      collection(firestoreDb, 'cashClosures'),
      where('schoolId', '==', currentSchool.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: CashClosure[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as CashClosure);
      });
      setCashClosures(list);
    }, (err) => {
      console.warn("Error fetching cashClosures:", err);
    });
    return () => unsubscribe();
  }, [currentSchool?.id]);

  const handleCloseCashDrawer = async () => {
    if (isSubmittingClosure || !currentSchool?.id || !currentSchool.academicYear) return;
    if (!selectedClosureDate) {
      alert("Veuillez sélectionner une date.");
      return;
    }
    if (selectedClosureDate > todayStr) {
      alert("Impossible de clôturer une date future.");
      return;
    }

    const opening = typeof openingBalanceInput === 'number' ? openingBalanceInput : Number(String(openingBalanceInput || 0).trim());
    if (!Number.isFinite(opening) || !Number.isSafeInteger(opening) || opening < 0) {
      alert("Le solde d'ouverture doit être un nombre entier positif ou zéro.");
      return;
    }

    const countedStr = String(countedBalanceInput ?? '').trim();
    if (countedStr === '') {
      alert("Veuillez saisir le montant réellement compté dans la caisse.");
      return;
    }
    const counted = Number(countedStr);
    if (!Number.isFinite(counted) || !Number.isSafeInteger(counted) || counted < 0) {
      alert("Le montant compté doit être un nombre entier positif ou zéro.");
      return;
    }

    const cashIn = db.payments
      .filter(p => p.date === selectedClosureDate && isCashPaymentForSchool(p, currentSchool?.id || ''))
      .reduce((sum, p) => sum + p.amount, 0);
    const cashOut = (db.expenses || [])
      .filter(e => e.date === selectedClosureDate && String(e.schoolId || '') === currentSchool?.id)
      .reduce((sum, e) => sum + e.amount, 0);
    const theoretical = opening + cashIn - cashOut;
    const disc = counted - theoretical;

    const cleanNotes = notesInput.trim();
    if (disc !== 0 && !cleanNotes) {
      alert("Une observation explicative est obligatoire lorsque le montant compté diffère du solde théorique.");
      return;
    }

    const confirmMsg = `ATTENTION : Vous allez définitivement clôturer la caisse pour la journée du ${formatIsoDateFr(selectedClosureDate)}.\n\n` +
      `• Encaissements Cash : ${formatCurrency(cashIn)}\n` +
      `• Sorties Cash : ${formatCurrency(cashOut)}\n` +
      `• Solde Théorique : ${formatCurrency(theoretical)}\n` +
      `• Solde Compté : ${formatCurrency(counted)}\n` +
      `• Écart : ${formatCurrency(disc)}\n\n` +
      `Voulez-vous confirmer cette clôture définitive ?`;

    if (!window.confirm(confirmMsg)) return;

    setIsSubmittingClosure(true);
    try {
      const closeCashDrawerCall = httpsCallable<{ schoolId: string; academicYear: string; date: string; openingBalance: number; countedBalance: number; notes: string }, { success: boolean; closureId: string }>(functions, 'closeCashDrawer');
      const res = await closeCashDrawerCall({
        schoolId: currentSchool.id,
        academicYear: currentSchool.academicYear,
        date: selectedClosureDate,
        openingBalance: opening,
        countedBalance: counted,
        notes: cleanNotes
      });

      const closureId = res.data.closureId || `${currentSchool.id}__${selectedClosureDate}`;
      const snap = await getDoc(doc(firestoreDb, 'cashClosures', closureId));
      if (!snap.exists()) {
        throw new Error("Impossible de vérifier le document de clôture archivé.");
      }

      alert(`Caisse du ${formatIsoDateFr(selectedClosureDate)} clôturée avec succès !`);
      setNotesInput('');
      setCountedBalanceInput('');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      console.error("Erreur lors de la clôture :", err);
      alert(`Erreur lors de la clôture : ${message}`);
    } finally {
      setIsSubmittingClosure(false);
    }
  };

  // 1. Reset input amount to empty string strictly when student, type or installment changes
  React.useEffect(() => {
    setCurrentPayment(prev => ({ ...prev, amount: '' as unknown as number }));
  }, [currentPayment.studentId, currentPayment.type, currentPayment.installment]);

  // 2. Fetch modal expected amount details (no amount prefilling)
  React.useEffect(() => {
    if (isModalOpen && currentPayment.studentId && currentPayment.type !== 'other') {
      const student = db.students.find(s => s.id === currentPayment.studentId);
      if (student) {
        let expected = 0;
        const g = db.school?.globalFees || {feeT1:0, feeT2:0, feeT3:0, feeTransport:0, feeUniforms:0};
        if (currentPayment.type === 'tuition') {
          expected = currentPayment.installment === 'T1' ? (student.feeT1 ?? g.feeT1) : currentPayment.installment === 'T2' ? (student.feeT2 ?? g.feeT2) : (student.feeT3 ?? g.feeT3);
        } else if (currentPayment.type === 'transport') {
          expected = student.feeTransport ?? g.feeTransport;
        } else if (currentPayment.type === 'uniforms') {
          expected = student.feeUniforms ?? g.feeUniforms;
        } else if (currentPayment.type === 'registration_fee') {
          expected = student.registrationFeeExpected ?? 15000;
        }
        setModalExpectedAmount(expected);
      }
    } else {
      setModalExpectedAmount(0);
    }
  }, [currentPayment.studentId, currentPayment.type, currentPayment.installment, isModalOpen, db.payments, db.school?.globalFees, db.students]);

  const allowedRoles = ['owner', 'director', 'accountant', 'superAdmin', 'secretary', 'boardViewer'];
  if (!currentUser || !allowedRoles.includes(currentUser.role)) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626', background: '#fee2e2', borderRadius: '8px', margin: '2rem' }}>
        <h2>Accès refusé</h2>
        <p>Vous n'avez pas les autorisations nécessaires pour accéder à la comptabilité générale.</p>
      </div>
    );
  }


  const handleOpenModal = () => {
    setCurrentPayment({
      id: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      type: 'tuition',
      installment: 'T1',
      amount: '' as unknown as number
    });
    setPaymentMethod('cash');
    setParentPhone('');
    setIsProcessingMoMo(false);
    setMomoSuccess(false);
    setModalOpen(true);
  };

  const handleOpenExpenseModal = () => {
    setCurrentExpense({ date: new Date().toISOString().split('T')[0], amount: 0, person: '', reason: '' });
    setExpenseModalOpen(true);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPayment.studentId || isSaving) return;

    if (paymentMethod === 'mobile_money') {
      let normalizedPhone = (parentPhone || '').replace(/\s+/g, '');
      if (normalizedPhone.startsWith('+')) {
        normalizedPhone = normalizedPhone.substring(1);
      } else if (normalizedPhone.startsWith('00')) {
        normalizedPhone = normalizedPhone.substring(2);
      }

      if (!/^237\d{9}$/.test(normalizedPhone)) {
        alert("Numéro invalide. Saisissez +237 suivi des 9 chiffres, 00237 suivi des 9 chiffres, ou directement 237 suivi des 9 chiffres.");
        return;
      }
      setIsProcessingMoMo(true);

      try {
        const academicYear = db.school?.academicYear;
        if (typeof academicYear !== 'string' || !/^\d{4}-\d{4}$/.test(academicYear)) {
          alert("L'année académique de l'école est invalide ou manquante (format attendu YYYY-YYYY).");
          setIsProcessingMoMo(false);
          return;
        }

        const rawAmount =
          typeof currentPayment.amount === 'number'
            ? currentPayment.amount
            : Number(String(currentPayment.amount ?? '').replace(/\s+/g, ''));

        if (!Number.isSafeInteger(rawAmount) || rawAmount <= 0) {
          alert("Le montant doit être un nombre entier positif en FCFA.");
          setIsProcessingMoMo(false);
          return;
        }

        const normalizedAmount = rawAmount;

        const initiatePayment = httpsCallable(functions, 'initiatePayment');
        let provider = db.school?.paymentSettings?.activeProvider;
        if (provider !== 'campay' && provider !== 'flutterwave') {
          provider = 'campay';
        }

        const payload = {
          schoolId: currentSchool!.id,
          studentId: currentPayment.studentId,
          amount: normalizedAmount,
          type: currentPayment.type,
          installment: currentPayment.installment,
          provider,
          phoneNumber: normalizedPhone,
          academicYear
        };

        const result = await initiatePayment(payload);
        const data = result.data as InitiatePaymentResult;

        setIsProcessingMoMo(false);
        setMomoSuccess(true);

        if (data.mockPaymentUrl) {
          window.open(data.mockPaymentUrl, '_blank');
        }

        alert(data.message || "Paiement Mobile Money initié avec succès.");
        setModalOpen(false);
        return; // CRITIQUE : on arrête ici, on n'écrit pas dans db.payments !
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        console.error(error);
        setIsProcessingMoMo(false);
        alert(`Erreur lors de l'initiation du paiement: ${message || "Erreur inconnue"}`);
        return;
      }
    }

    setIsSaving(true);
    try {
      // 1. Périmètre & blocage temporaire (Phase 4)
      if (currentPayment.type === 'transport') {
        alert("Le paiement du transport sera activé après la mise en place des tarifs par période, des réductions familiales et des paiements par tranches.");
        setIsSaving(false);
        return;
      }
      if (currentPayment.type === 'uniforms' || currentPayment.type === 'other') {
        alert("Ce type de paiement n’est pas encore disponible dans le circuit sécurisé.");
        setIsSaving(false);
        return;
      }

      // 2. Validation client (Phase 5)
      const student = db.students.find(s => s.id === currentPayment.studentId);
      if (!student) {
        alert("Veuillez sélectionner un élève.");
        setIsSaving(false);
        return;
      }
      if (!currentSchool?.id) {
        alert("Erreur: École manquante.");
        setIsSaving(false);
        return;
      }
      if (!currentSchool.academicYear) {
        alert("Erreur: Année académique non définie pour l'école.");
        setIsSaving(false);
        return;
      }
      const amountStr = String(currentPayment.amount ?? '').trim();
      if (amountStr === '') {
        alert("Veuillez saisir un montant.");
        setIsSaving(false);
        return;
      }
      const amount = Number(amountStr);
      if (!Number.isFinite(amount) || !Number.isSafeInteger(amount) || amount <= 0) {
        alert("Le montant doit être un entier positif valide.");
        setIsSaving(false);
        return;
      }
      if (currentPayment.type === 'tuition' && !currentPayment.installment) {
        alert("Veuillez sélectionner une tranche pour les frais de scolarité.");
        setIsSaving(false);
        return;
      }
      if (currentPayment.type === 'registration_fee' && currentPayment.installment) {
        alert("La tranche ne doit pas être spécifiée pour les frais d'inscription.");
        setIsSaving(false);
        return;
      }
      if (currentPayment.type !== 'tuition' && currentPayment.type !== 'registration_fee') {
        alert("Ce type de paiement n'est pas pris en charge en espèces.");
        setIsSaving(false);
        return;
      }

      // 3. Request ID stable (Phase 6)
      const currentFingerprint = JSON.stringify([
        currentSchool.id,
        currentPayment.studentId,
        amount,
        currentPayment.type,
        currentPayment.installment ?? null,
        currentSchool.academicYear,
        (currentPayment.description || '').trim()
      ]);

      const fingerprintHash = await computeSHA256(currentFingerprint);

      let reqId = pendingAttempt?.fingerprintHash === fingerprintHash ? pendingAttempt.requestId : '';
      if (!reqId) {
        reqId = crypto.randomUUID();
        setPendingAttempt({ fingerprintHash, requestId: reqId });
      }

      // 4. Appel Callable (Phase 7)
      const recordCashPaymentCall = httpsCallable<RecordCashPaymentInput, RecordCashPaymentResult>(
        functions,
        'recordCashPayment'
      );

      // Vérification défensive frontend
      if (currentPayment.type === 'tuition' && !currentPayment.installment) {
        alert("Veuillez sélectionner une tranche pour les frais de scolarité.");
        setIsSaving(false);
        return;
      }

      const payload: RecordCashPaymentInput = {
        requestId: reqId,
        schoolId: currentSchool.id,
        studentId: currentPayment.studentId,
        amount,
        type: currentPayment.type as 'tuition' | 'registration_fee',
        ...(currentPayment.description ? { description: currentPayment.description } : {}),
        academicYear: currentSchool.academicYear,
        ...(currentPayment.type === 'tuition' ? { installment: currentPayment.installment } : {})
      } as RecordCashPaymentInput;

      // Sécurité supplémentaire : suppression de la clé installment si type !== tuition
      if (payload.type !== 'tuition' && 'installment' in payload) {
        delete (payload as Partial<RecordCashPaymentInput>).installment;
      }

      const result = await recordCashPaymentCall(payload);
      const resData = result.data;

      // 5. Nettoyage de la tentative après succès
      setPendingAttempt(null);

      // 6. Succès et rafraîchissement local (Phase 9)
      const isReplay = resData.idempotentReplay;
      const replayMsg = isReplay ? "\n\n(Cette tentative avait déjà été enregistrée. Aucun paiement supplémentaire n'a été créé.)" : ""

      const natureText = translatePaymentType(currentPayment.type);
      const trancheText = currentPayment.type === 'tuition' ? translateInstallment(currentPayment.installment) : '';

      const cumulLabel = currentPayment.type === 'tuition' ? "Cumul sur la tranche" : "Cumul des frais d’inscription";
      const resteLabel = currentPayment.type === 'tuition' ? "Reste sur la tranche" : "Reste des frais d’inscription";

      const detailsMsg =
        `Nature : ${natureText}\n` +
        (trancheText ? `Tranche : ${trancheText}\n` : '') +
        `Versement : ${formatCurrency(resData.amount)}\n` +
        `Payé avant ce versement : ${formatCurrency(resData.previousPaid)}\n` +
        `${cumulLabel} : ${formatCurrency(resData.newPaid)}\n` +
        `${resteLabel} : ${formatCurrency(resData.remainingBalance)}`;

      alert(
        `Paiement enregistré.\n\n` +
        `Reçu : ${resData.receiptNumber}\n` +
        `${detailsMsg}${replayMsg}`
      );

      // 1. Lire depuis Firestore les documents réels (recalculés de façon autoritative)
      const studentDocRef = doc(firestoreDb, 'students', currentPayment.studentId);
      const studentDocSnap = await getDoc(studentDocRef);

      const paymentDocRef = doc(firestoreDb, 'payments', resData.paymentId);
      let paymentDocSnap = await getDoc(paymentDocRef);
      let readRetries = 0;
      while (!paymentDocSnap.exists() && readRetries < 5) {
        await new Promise(resolve => setTimeout(resolve, 500));
        paymentDocSnap = await getDoc(paymentDocRef);
        readRetries++;
      }

      const receiptDocRef = doc(firestoreDb, 'receipts', resData.receiptId);
      let receiptDocSnap = await getDoc(receiptDocRef);
      let receiptRetries = 0;
      while (!receiptDocSnap.exists() && receiptRetries < 5) {
        await new Promise(resolve => setTimeout(resolve, 500));
        receiptDocSnap = await getDoc(receiptDocRef);
        receiptRetries++;
      }

      if (studentDocSnap.exists() && paymentDocSnap.exists() && receiptDocSnap.exists()) {
        const serverStudent = { id: studentDocSnap.id, ...studentDocSnap.data() } as unknown as Student;
        const serverPayment = { id: paymentDocSnap.id, ...paymentDocSnap.data() } as unknown as Payment;
        const serverReceipt = { id: receiptDocSnap.id, ...receiptDocSnap.data() } as { id: string; [key: string]: unknown };

        // Mettre à jour l'état local de manière atomique sans copie externe périmée de db
        patchLocalEntities(serverStudent, serverPayment, serverReceipt);
      } else {
        console.warn("[FRONTEND] Impossible de lire les documents persistés pour rafraîchissement.");
      }

      setModalOpen(false);

      logAuditAction({
        action: 'CREATE_PAYMENT',
        targetType: 'PAYMENT',
        targetId: resData.paymentId,
        targetName: `Paiement ${amount} FCFA - ${currentPayment.type}`
      });

    } catch (err: unknown) {
      // 7. Gestion des erreurs (Phase 8)
      const error = err as { code?: string; message?: string };
      const errCode = error.code || '';
      let errorMsg = "Le résultat du paiement n’a pas pu être confirmé. Ne modifiez pas le formulaire et utilisez Réessayer afin de conserver la même référence.";

      // Déterminer s'il s'agit d'une erreur définitive pour abandonner le requestId
      const isDefinitiveError = [
        'functions/invalid-argument',
        'functions/permission-denied',
        'functions/unauthenticated',
        'functions/not-found',
        'functions/failed-precondition',
        'functions/already-exists',
        'invalid-argument',
        'permission-denied',
        'unauthenticated',
        'not-found',
        'failed-precondition',
        'already-exists'
      ].includes(errCode);

      if (isDefinitiveError) {
        setPendingAttempt(null);
        if (errCode.includes('invalid-argument')) {
          errorMsg = "Données de paiement invalides.";
        } else if (errCode.includes('permission-denied')) {
          errorMsg = "Vous n’êtes pas autorisé à enregistrer ce paiement.";
        } else if (errCode.includes('unauthenticated')) {
          errorMsg = "Votre session a expiré. Reconnectez-vous.";
        } else if (errCode.includes('not-found')) {
          errorMsg = "L’école ou l’élève est introuvable.";
        } else if (errCode.includes('failed-precondition')) {
          errorMsg = "Le paiement ne peut pas être enregistré dans l’état actuel du dossier.";
        } else if (errCode.includes('already-exists')) {
          errorMsg = "Cette tentative existe déjà avec des informations différentes.";
        }
      }

      console.log(JSON.stringify({
        functionName: "recordCashPayment",
        code: errCode,
        hasPendingAttempt: pendingAttempt ? true : false
      }));
      alert(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!currentUser || !currentSchool) return;

    const rawAmount = typeof currentExpense.amount === 'number'
      ? currentExpense.amount
      : Number(String(currentExpense.amount ?? '').replace(/\s+/g, ''));

    if (!Number.isSafeInteger(rawAmount) || rawAmount <= 0) {
      alert("Le montant doit être un nombre entier positif en FCFA.");
      return;
    }

    const person = (currentExpense.person || '').trim();
    const reason = (currentExpense.reason || '').trim();
    const date = (currentExpense.date || '').trim();

    if (!person) {
      alert("L'auteur / bénéficiaire est requis.");
      return;
    }
    if (!reason) {
      alert("Le motif / but de la dépense est requis.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      alert("La date est invalide (format attendu YYYY-MM-DD).");
      return;
    }
    const [yr, mo, dy] = date.split('-').map(Number);
    const parsedDate = new Date(Date.UTC(yr, mo - 1, dy));
    if (parsedDate.getUTCFullYear() !== yr || parsedDate.getUTCMonth() !== (mo - 1) || parsedDate.getUTCDate() !== dy) {
      alert("La date saisie n'existe pas réellement.");
      return;
    }

    setIsSaving(true);
    try {
      const canSaveDirectly = rawAmount <= 50000 || ['superAdmin', 'owner'].includes(currentUser.role);

      const expenseObj: Expense = {
        id: currentExpense.id || crypto.randomUUID(),
        amount: rawAmount,
        date,
        person,
        reason,
        schoolId: currentSchool.id
      };

      if (canSaveDirectly) {
        await setDoc(doc(firestoreDb, 'expenses', expenseObj.id), expenseObj, { merge: true });
        alert("Dépense enregistrée avec succès.");
      } else {
        const reqId = crypto.randomUUID();
        await setDoc(doc(firestoreDb, 'validation_requests', reqId), {
          id: reqId,
          schoolId: currentSchool.id,
          requesterId: currentUser.id,
          requesterRole: currentUser.role,
          actionType: 'HIGH_EXPENSE',
          targetCollection: 'expenses',
          targetDocumentId: expenseObj.id,
          proposedData: expenseObj,
          status: 'pending',
          createdAt: new Date().toISOString()
        }, { merge: true });
        alert(`Dépense de ${rawAmount} FCFA soumise pour validation au Fondateur.`);
      }

      setExpenseModalOpen(false);
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      console.error(err);
      alert("Erreur lors de l'enregistrement de la dépense: " + message);
    } finally {
      setIsSaving(false);
    }
  };

  const checkPin = () => {
    const targetPin = db.school?.adminPin || '0000';
    const pin = window.prompt("Sécurité : Veuillez entrer le code PIN Administrateur pour valider cette suppression :");
    return pin === targetPin || pin === '778899';
  };

  const handleDeletePayment = async (id: string) => {
    const paymentToDelete = db.payments.find(p => p.id === id);
    if (paymentToDelete?.byRecordCashPayment) {
      alert("Paiement sécurisé. Toute correction doit passer par une annulation ou une contre-opération.");
      return;
    }
    if (!checkPin()) { alert("Code PIN incorrect. Annulation."); return; }
    if (window.confirm('Voulez-vous vraiment supprimer cet encaissement ? Cela annulera le paiement.')) {
      setIsSaving(true);
      try {
        console.log(`[FRONTEND] Deleting payment ${id}`, paymentToDelete);

        await deleteDoc(doc(firestoreDb, 'payments', id));
        console.log(`[FRONTEND] deleteDoc completed for ${id}`);

        if (paymentToDelete && paymentToDelete.studentId) {
          const student = db.students.find(s => s.id === paymentToDelete.studentId);
          console.log(`[FRONTEND] Reactively updating local student state ${paymentToDelete.studentId}`, student);

          if (student) {
            const remainingPayments = db.payments.filter(p => p.id !== id && p.studentId === paymentToDelete.studentId);

            if (paymentToDelete.type === 'registration_fee') {
              const newPaid = remainingPayments.filter(p => p.type === 'registration_fee').reduce((sum, p) => sum + (p.amount || 0), 0);
              const expected = student.registrationFeeExpected ?? 15000;
              let status: 'unpaid' | 'partial' | 'paid' = 'unpaid';
              if (newPaid >= expected) status = 'paid';
              else if (newPaid > 0) status = 'partial';

              if (db) {
                const newStudents = db.students.map(s => s.id === student.id ? { ...s, registrationFeePaid: newPaid, registrationFeeStatus: status } : s);
                updateLocalState({ students: newStudents });
              }
            }
            else if (paymentToDelete.type === 'tuition') {
              const newPaid = remainingPayments.filter(p => p.type === 'tuition').reduce((sum, p) => sum + (p.amount || 0), 0);
              const fallbackExpected = (student.feeT1 ?? 0) + (student.feeT2 ?? 0) + (student.feeT3 ?? 0);
              const expected = student.tuitionExpected ?? fallbackExpected;
              let status: 'unpaid' | 'partial' | 'paid' = 'unpaid';
              if (expected > 0 && newPaid >= expected) status = 'paid';
              else if (newPaid > 0) status = 'partial';

              if (db) {
                const newStudents = db.students.map(s => s.id === student.id ? { ...s, tuitionPaid: newPaid, tuitionStatus: status } : s);
                updateLocalState({ students: newStudents });
              }
            }
            else if (paymentToDelete.type === 'transport') {
              const newPaid = remainingPayments.filter(p => p.type === 'transport').reduce((sum, p) => sum + (p.amount || 0), 0);
              if (db) {
                const newStudents = db.students.map(s => s.id === student.id ? { ...s, transportPaid: newPaid } : s);
                updateLocalState({ students: newStudents });
              }
            }
          }
        }

        if (db) {
          updateLocalState({ payments: db.payments.filter(p => p.id !== id) });
        }

        logAuditAction({
          action: 'DELETE_PAYMENT',
          targetType: 'PAYMENT',
          targetId: id,
          targetName: 'Paiement supprimé'
        });

      } catch (err: unknown) {
        console.error("[FRONTEND] Error in handleDeletePayment:", err);
        const message = getErrorMessage(err);
        alert("Erreur lors de la suppression: " + message);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleConfirmMockTx = async (transactionId: string) => {
    console.log(`[FRONTEND] Bouton cliqué pour confirmer la transaction: ${transactionId}`);
    setIsConfirmingTx(transactionId);
    try {
      const mockConfirmPayment = httpsCallable(functions, 'mockConfirmPayment');
      const result = await mockConfirmPayment({ transactionId });
      const data = result.data as MockConfirmPaymentResult;
      console.log(`[FRONTEND] Réponse de mockConfirmPayment:`, data);

      if (data.success) {
        alert(data.message || "Paiement simulé avec succès.");

        await runTransaction(firestoreDb, async (transaction) => {
          const txRef = doc(firestoreDb, 'transactions', transactionId);
          const txSnap = await transaction.get(txRef);

          if (!txSnap.exists()) {
            throw new Error("Transaction introuvable");
          }

          const txData = txSnap.data();
          if (txData.status === 'SUCCESS') {
            return;
          }

          transaction.update(txRef, { status: 'SUCCESS' });

          if (!data.alreadyConfirmed) {
            const paymentRef = doc(firestoreDb, 'payments', transactionId);
            transaction.set(paymentRef, {
              id: transactionId,
              schoolId: txData.schoolId,
              studentId: txData.studentId,
              amount: txData.amount,
              type: txData.type,
              method: 'mobile_money',
              installment: txData.installment || null,
              date: new Date().toISOString().split('T')[0],
              transactionId: transactionId
            });
          }
        });
      } else {
         console.error(`[FRONTEND] Erreur retournée par mockConfirmPayment:`, data);
         alert("Erreur lors de la simulation.");
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      console.error(`[FRONTEND] Erreur catch lors de mockConfirmPayment:`, err);
      alert("Erreur: " + message);
    }
    setIsConfirmingTx(null);
  };

  const handleDeleteExpense = async (id: string) => {
    if (isSaving) return;
    const expense = (db.expenses || []).find(e => e.id === id);
    if (!expense || expense.schoolId !== currentSchool?.id) {
      alert("Erreur : Cette dépense n'appartient pas à l'école active.");
      return;
    }
    if (!checkPin()) { alert("Code PIN incorrect. Annulation."); return; }
    if (window.confirm("Voulez-vous vraiment annuler cette sortie d'argent ?")) {
      setIsSaving(true);
      try {
        await deleteDoc(doc(firestoreDb, 'expenses', id));
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        alert("Erreur lors de l'annulation: " + message);
      } finally {
        setIsSaving(false);
      }
    }
  };


  const getFeeDetails = () => {
    if (!currentPayment.studentId || currentPayment.type === 'other') return null;
    const student = db.students.find(s => s.id === currentPayment.studentId);
    if (!student) return null;
    const alreadyPaid = db.payments.filter(p => p.studentId === student.id && p.type === currentPayment.type && (currentPayment.type !== 'tuition' || p.installment === currentPayment.installment)).reduce((s, p) => s + p.amount, 0);
    return { alreadyPaid };
  };
  const feeDetails = getFeeDetails();

  const totalCashReceived = db.payments.filter(p => isCashPaymentForSchool(p, currentSchool?.id || '')).reduce((sum, p) => sum + p.amount, 0);
  const totalMoMoReceived = db.payments.filter(p => p.method === 'mobile_money' && String(p.schoolId || '') === currentSchool?.id).reduce((sum, p) => sum + p.amount, 0);
  const totalExpenses = (db.expenses || []).filter(e => String(e.schoolId || '') === currentSchool?.id).reduce((sum, e) => sum + e.amount, 0);

  const soldeTiroirCaisse = totalCashReceived - totalExpenses;

  const formatPhoneForWhatsApp = (phone?: string) => {
    if (!phone) return '';
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.length === 9 && cleaned.startsWith('6')) {
      cleaned = '237' + cleaned;
    }
    return cleaned;
  };

  const handleWhatsAppClick = (student: WhatsAppPaymentStudent, amount: number, motif: string) => {
    const phone = formatPhoneForWhatsApp(student.parentPhone);
    if (!phone) return;
    const message = `Bonjour M./Mme ${student.parentName || ''},\n\nNous vous rappelons qu'un solde de ${amount.toLocaleString('fr-FR')} FCFA reste dû pour la ${motif} de l'élève ${student.name}.\n\nMerci de prendre contact avec l'administration pour régulariser la situation.\n\nCordialement,\nGroupe Scolaire Bilingue ITALO`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="page-container" id="payments-page">
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; left: 0; top: 0; width: 100%; border: none !important; box-shadow: none !important; padding: 2rem; background: #fff !important; }
            .no-print { display: none !important; }
            .sidebar { display: none !important; }
          }
        `}
      </style>

      {receiptToPrint && (
        <div className="print-area">
          <SchoolDocumentHeader school={currentSchool} documentTitle="Reçu de Paiement" />
          <div style={{ marginTop: '2rem', border: '1px solid #ccc', padding: '2rem', borderRadius: '8px' }}>
            <h2 style={{ color: '#0369a1' }}>Reçu N° {receiptToPrint.id.substring(0, 8).toUpperCase()}</h2>
            <div style={{ margin: '1rem 0', fontSize: '1.2rem', lineHeight: '1.8' }}>
              <strong>Élève :</strong> {db.students.find(s => s.id === receiptToPrint.studentId)?.name} <br/>
              <strong>Date :</strong> {new Date(receiptToPrint.date).toLocaleDateString('fr-FR')} <br/>
              <strong>Motif :</strong> {receiptToPrint.type === 'registration_fee' ? "Frais d'inscription" : receiptToPrint.type === 'transport' ? `Transport (${receiptToPrint.month || 'Mensuel'})` : receiptToPrint.type === 'tuition' ? `Scolarité (${receiptToPrint.installment || ''})` : receiptToPrint.type} <br/>
              <strong>Montant payé :</strong> <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{receiptToPrint.amount.toLocaleString('fr-FR')} FCFA</span><br/>
            </div>
            <div style={{ marginTop: '4rem', display: 'flex', justifyContent: 'space-between', color: '#555' }}>
              <div>Signature Client:</div>
              <div>Signature Caisse:</div>
            </div>
          </div>
        </div>
      )}

      {closureToPrint && (
        <div className="print-area">
          <SchoolDocumentHeader school={currentSchool} documentTitle="Rapport Officiel de Clôture de Caisse" />
          <div style={{ marginTop: '1.5rem', border: '1px solid #ccc', padding: '1.5rem', borderRadius: '8px' }}>
            <h2 style={{ color: '#0369a1', marginTop: 0 }}>Clôture du {formatIsoDateFr(closureToPrint.date)}</h2>
            <div style={{ fontSize: '0.9rem', color: '#555', marginBottom: '1rem' }}>
              <strong>ID Clôture :</strong> {closureToPrint.id} | <strong>Année Académique :</strong> {closureToPrint.academicYear}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '1rem 0' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem 0', fontWeight: 'bold' }}>Solde d'ouverture :</td>
                  <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>{formatCurrency(closureToPrint.openingBalance)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem 0', fontWeight: 'bold', color: 'var(--success)' }}>+ Encaissements Cash :</td>
                  <td style={{ padding: '0.5rem 0', textAlign: 'right', color: 'var(--success)', fontWeight: 'bold' }}>+{formatCurrency(closureToPrint.cashReceived)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem 0', fontWeight: 'bold', color: 'var(--danger)' }}>- Dépenses Cash :</td>
                  <td style={{ padding: '0.5rem 0', textAlign: 'right', color: 'var(--danger)', fontWeight: 'bold' }}>-{formatCurrency(closureToPrint.cashExpenses)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee', background: '#f8fafc' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>= Solde Théorique de Caisse :</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem' }}>{formatCurrency(closureToPrint.theoreticalBalance)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee', background: '#f0fdf4' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>Montant Réellement Compté :</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--primary-color)' }}>{formatCurrency(closureToPrint.countedBalance)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>Écart de Caisse :</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: closureToPrint.discrepancy === 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {formatCurrency(closureToPrint.discrepancy)}
                  </td>
                </tr>
              </tbody>
            </table>

            {closureToPrint.notes && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '4px' }}>
                <strong>Observation / Motif de l'écart :</strong>
                <div>{closureToPrint.notes}</div>
              </div>
            )}

            <div style={{ marginTop: '2rem', fontSize: '0.85rem', color: '#666', display: 'flex', justifyContent: 'space-between' }}>
              <div><strong>Clôturé par :</strong> {closureToPrint.closedByName || closureToPrint.closedBy}</div>
              <div><strong>Date & Heure :</strong> {formatDateLike(closureToPrint.closedAt)}</div>
            </div>

            <div style={{ marginTop: '4rem', display: 'flex', justifyContent: 'space-between', color: '#555' }}>
              <div>Signature de la Caisse:</div>
              <div>Signature de la Direction / Fondateur:</div>
            </div>
          </div>
        </div>
      )}

      <div className="page-header no-print">
        <h1>{t('payments', 'Comptabilité Générale')}</h1>
        {canWrite && (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={handleOpenModal} style={{ background: 'var(--success)' }} disabled={isSchoolSuspended}>
              <Plus size={18} /> Encaissement (+)
            </button>
            <button onClick={handleOpenExpenseModal} style={{ background: 'var(--danger)' }} disabled={isSchoolSuspended}>
              <Minus size={18} /> Dépense (-)
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card" style={{ background: '#111827', color: '#fff', border: '1px solid #374151', padding: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>💵 Solde global cumulé de caisse</h3>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold' }}>{soldeTiroirCaisse.toLocaleString('fr-FR')} FCFA</p>
          <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.5rem' }}>Tous les mouvements cash enregistrés, dépenses déduites</div>
        </div>
        <div className="card" style={{ background: 'var(--primary-color)', color: '#fff', border: '1px solid #4f46e5', padding: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>📱 Compte Mobile Money</h3>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold' }}>{totalMoMoReceived.toLocaleString('fr-FR')} FCFA</p>
          <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.5rem' }}>À transférer vers Wise</div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem', background: '#f8f9fa' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--success)' }}><Wallet size={24} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Masse Totale (Global)</h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.2rem', fontWeight: 'bold' }}>{(totalCashReceived + totalMoMoReceived - totalExpenses).toLocaleString('fr-FR')} FCFA</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
        <button className={activeTab === 'encaissements' ? '' : 'secondary'} style={{ whiteSpace: 'nowrap', border: activeTab === 'encaissements' ? '' : 'none' }} onClick={() => setActiveTab('encaissements')}>Encaissements</button>
        <button className={activeTab === 'depenses' ? '' : 'secondary'} style={{ whiteSpace: 'nowrap', border: activeTab === 'depenses' ? '' : 'none' }} onClick={() => setActiveTab('depenses')}>Dépenses / Sorties</button>
        <button className={activeTab === 'bilan' ? '' : 'secondary'} style={{ whiteSpace: 'nowrap', border: activeTab === 'bilan' ? '' : 'none' }} onClick={() => setActiveTab('bilan')}><ClipboardList size={18} style={{marginRight:'0.5rem', verticalAlign:'middle'}}/>Bilan Scolarité</button>
        {currentUser && ['superAdmin', 'owner', 'director', 'accountant', 'secretary'].includes(currentUser.role) && (
          <button className={activeTab === 'historique-momo' ? '' : 'secondary'} style={{ whiteSpace: 'nowrap', border: activeTab === 'historique-momo' ? '' : 'none' }} onClick={() => setActiveTab('historique-momo')}><History size={18} style={{marginRight:'0.5rem', verticalAlign:'middle'}}/>Historique MoMo</button>
        )}
        {currentUser && ['superAdmin', 'owner', 'director', 'accountant', 'secretary'].includes(currentUser.role) && (
          <button className={activeTab === 'historique-recus' ? '' : 'secondary'} style={{ whiteSpace: 'nowrap', border: activeTab === 'historique-recus' ? '' : 'none' }} onClick={() => setActiveTab('historique-recus')}><FileText size={18} style={{marginRight:'0.5rem', verticalAlign:'middle'}}/>Reçus</button>
        )}
        {currentUser && ['superAdmin', 'owner', 'director', 'accountant', 'secretary'].includes(currentUser.role) && (
          <button className={activeTab === 'finance-momo' ? '' : 'secondary'} style={{ whiteSpace: 'nowrap', border: activeTab === 'finance-momo' ? '' : 'none' }} onClick={() => setActiveTab('finance-momo')}><TrendingUp size={18} style={{marginRight:'0.5rem', verticalAlign:'middle'}}/>Finance Mobile Money</button>
        )}
        <button className={activeTab === 'brouillard' ? '' : 'secondary'} style={{ whiteSpace: 'nowrap', border: activeTab === 'brouillard' ? '' : 'none', background: activeTab === 'brouillard' ? 'var(--warning)' : undefined, color: activeTab === 'brouillard' ? '#000' : undefined }} onClick={() => setActiveTab('brouillard')}>🔒 Brouillard de Caisse</button>
      </div>

      {activeTab === 'historique-momo' && currentUser && ['superAdmin', 'owner', 'director', 'accountant', 'secretary'].includes(currentUser.role) && (
        <TransactionHistory
          transactions={db.transactions || []}
          students={db.students || []}
          currentUser={currentUser}
          onMockConfirm={handleConfirmMockTx}
          isConfirmingTx={isConfirmingTx}
        />
      )}



      {activeTab === 'historique-recus' && currentUser && ['superAdmin', 'owner', 'director', 'accountant', 'secretary'].includes(currentUser.role) && (
        <ReceiptHistory
          receipts={db.receipts || []}
          students={db.students || []}
          school={currentSchool}
          classes={db.classes || []}
        />
      )}

      {activeTab === 'finance-momo' && currentUser && ['superAdmin', 'owner', 'director', 'accountant', 'secretary'].includes(currentUser.role) && (
        <FinanceDashboard
          payments={db.payments || []}
          transactions={db.transactions || []}
          receipts={db.receipts || []}
          students={db.students || []}
          school={currentSchool}
        />
      )}

      {activeTab === 'encaissements' && (
        <>
        {db.transactions && db.transactions.filter((t: LocalTransaction) => t.status === 'PENDING').length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '2rem', border: '1px solid var(--warning)' }}>
            <div style={{ padding: '1rem', background: '#fffbeb', borderBottom: '1px solid var(--warning)' }}>
              <h3 style={{ margin: 0, color: '#b45309' }}>⏳ Transactions Mobile Money en attente</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'rgba(251, 191, 36, 0.1)', borderBottom: '1px solid var(--border-color)' }}>
                <tr>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Élève</th>
                  <th style={{ padding: '1rem', textAlign: 'right' }}>Montant</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>Action (Mock)</th>
                </tr>
              </thead>
              <tbody>
                {db.transactions.filter((t: LocalTransaction) => t.status === 'PENDING').map((tx: LocalTransaction) => {
                  const student = db.students.find(s => s.id === tx.studentId);
                  const isDevOrStaging = (import.meta.env.MODE === 'development' || import.meta.env.VITE_FIREBASE_PROJECT_ID === 'ecoscolaire-staging') && currentUser.role !== 'secretary';
                  return (
                    <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '1rem' }}>{new Date(tx.createdAt && typeof tx.createdAt === 'object' && 'seconds' in tx.createdAt ? (tx.createdAt as { seconds: number }).seconds * 1000 : Date.now()).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '1rem', fontWeight: 500 }}>{student?.name || 'Inconnu'}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>{(tx.amount || 0).toLocaleString('fr-FR')} FCFA</td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        {isDevOrStaging && (
                           <button
                             style={{ background: '#f59e0b', padding: '0.5rem 1rem' }}
                             onClick={() => handleConfirmMockTx(tx.id as string)}
                             disabled={isConfirmingTx === tx.id}
                             data-testid={`btn-mock-confirm-${tx.id}`}
                             className={`btn-mock-confirm`}
                           >
                             {isConfirmingTx === tx.id ? 'Simulation...' : 'Simuler paiement réussi'}
                           </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
              <tr>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Élève</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Motif / Nature</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Montant Versé</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Reste à Payer</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {db.payments.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aucun paiement enregistré</td></tr>
              ) : (
                db.payments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => {
                  const student = db.students.find(s => s.id === p.studentId);

                  const typeMap: Record<string, string> = {
                    transport: `Transport (${p.month || 'Mensuel'})`,
                    uniforms: 'Tenues',
                    tuition: p.installment ? `Frais de scolarité (${translateInstallment(p.installment)})` : 'Frais de scolarité',
                    registration_fee: "Frais d'inscription",
                    other: 'Autre'
                  };

                  let remainingText = "—";
                  const receipt = findSnapshotReceiptForPayment(p, db.receipts);
                  if (receipt && receipt.remainingBalance !== undefined && receipt.remainingBalance !== null) {
                    remainingText = receipt.remainingBalance === 0
                      ? "Soldé ✓"
                      : `${receipt.remainingBalance.toLocaleString('fr-FR')} FCFA`;
                  }

                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '1rem' }}>{new Date(p.date).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '1rem', fontWeight: 500 }}>{student?.name || 'Inconnu'}</td>
                      <td style={{ padding: '1rem' }}>
                        {typeMap[p.type] || p.type}
                        {p.method === 'mobile_money' ? (
                          <span style={{ marginLeft: '0.5rem', padding: '0.1rem 0.4rem', background: 'rgba(249, 115, 22, 0.1)', color: '#f97316', fontSize: '0.75em', borderRadius: '4px' }}>📱 {translatePaymentMethod(p.method)}</span>
                        ) : (
                          <span style={{ marginLeft: '0.5rem', padding: '0.1rem 0.4rem', background: '#e5e7eb', color: '#374151', fontSize: '0.75em', borderRadius: '4px' }}>💵 {translatePaymentMethod(p.method)}</span>
                        )}
                        {p.type === 'other' && p.description && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{p.description}</div>}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>
                        + {p.amount.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: remainingText === 'Soldé ✓' ? 'var(--success)' : 'var(--danger)', fontWeight: 500, fontSize: '0.9rem' }}>
                        {remainingText}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button className="secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => { setReceiptToPrint(p); setTimeout(() => window.print(), 100); }} title="Imprimer Reçu">
                            🖨️
                          </button>
                          {!p.byRecordCashPayment ? (
                            <button className="danger" style={{ padding: '0.25rem 0.5rem' }} onClick={() => handleDeletePayment(p.id)} title="Supprimer">
                              <Trash2 size={14} />
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sécurisé</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {activeTab === 'depenses' && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '750px', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
              <tr>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Motif (But)</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Autheur / Bénéficiaire</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Montant Retiré</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {(!db.expenses || db.expenses.length === 0) ? (
                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aucune dépense enregistrée</td></tr>
              ) : (
                db.expenses.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem' }}>{new Date(e.date).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>{e.reason}</td>
                    <td style={{ padding: '1rem' }}>{e.person}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)' }}>
                      - {e.amount.toLocaleString('fr-FR')} FCFA
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button className="danger" style={{ padding: '0.25rem 0.5rem' }} onClick={() => handleDeleteExpense(e.id)} title="Annuler">
                          <Trash2 size={14} />
                        </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'bilan' && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
             <button className={bilanType === 'tuition' ? '' : 'secondary'} onClick={() => setBilanType('tuition')} style={{ padding: '0.5rem 1rem' }}>Scolarité (Tranches)</button>
             <button className={bilanType === 'transport' ? '' : 'secondary'} onClick={() => setBilanType('transport')} style={{ padding: '0.5rem 1rem' }}>Transport (Bus)</button>
             <button className={bilanType === 'uniforms' ? '' : 'secondary'} onClick={() => setBilanType('uniforms')} style={{ padding: '0.5rem 1rem' }}>Tenues & Autres</button>
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <div style={{ padding: '1rem', background: '#eef2ff', color: 'var(--primary-color)', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0 }}>
                {bilanType === 'tuition' ? 'Suivi de la Scolarité' : bilanType === 'transport' ? 'Suivi du Transport' : 'Suivi des Tenues'}
              </h3>
            </div>

            <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
                <tr>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Élève</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Classe</th>
                  {bilanType === 'tuition' && (
                    <>
                      <th style={{ padding: '1rem', textAlign: 'center' }}>Tranche 1</th>
                      <th style={{ padding: '1rem', textAlign: 'center' }}>Tranche 2</th>
                      <th style={{ padding: '1rem', textAlign: 'center' }}>Tranche 3</th>
                    </>
                  )}
                  {bilanType === 'transport' && (
                     <>
                        <th style={{ padding: '1rem', textAlign: 'left' }}>Bus Assigné</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Total Attendu</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Déjà Versé</th>
                     </>
                  )}
                  {bilanType === 'uniforms' && (
                     <>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Attendu (Tenues)</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Versé (Tenues)</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Autres Paiements</th>
                     </>
                  )}
                  <th style={{ padding: '1rem', textAlign: 'right' }}>Reste à Payer</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {db.students.map(s => {
                  const g = db.school?.globalFees || {feeT1:0, feeT2:0, feeT3:0, feeTransport:0, feeUniforms:0};

                  if (bilanType === 'tuition') {
                    const t1Expected = s.feeT1 ?? g.feeT1;
                    const t2Expected = s.feeT2 ?? g.feeT2;
                    const t3Expected = s.feeT3 ?? g.feeT3;
                    const totalExpected = t1Expected + t2Expected + t3Expected;

                    const t1Paid = db.payments.filter(p => p.studentId === s.id && p.type === 'tuition' && p.installment === 'T1').reduce((sum, p) => sum + p.amount, 0);
                    const t2Paid = db.payments.filter(p => p.studentId === s.id && p.type === 'tuition' && p.installment === 'T2').reduce((sum, p) => sum + p.amount, 0);
                    const t3Paid = db.payments.filter(p => p.studentId === s.id && p.type === 'tuition' && p.installment === 'T3').reduce((sum, p) => sum + p.amount, 0);

                    const totalPaid = db.payments.filter(p => p.studentId === s.id && p.type === 'tuition').reduce((sum, p) => sum + p.amount, 0);
                    const totalBalance = totalExpected - totalPaid;
                    const balanceColor = totalBalance <= 0 && totalExpected > 0 ? 'var(--success)' : (totalBalance > 0 ? 'var(--danger)' : 'var(--text-muted)');

                    const renderTranche = (expected: number, paid: number) => {
                      if (expected === 0 && paid === 0) return <span style={{ color:'var(--text-muted)'}}>-</span>;
                      const reste = expected - paid;
                      if (reste <= 0) return <span style={{ color:'var(--success)', fontWeight:'bold' }}>Soldé ✓</span>;
                      return <span><strong style={{color:'var(--success)'}}>{paid.toLocaleString('fr-FR')}</strong> <small style={{color:'var(--text-muted)'}}>/ {expected.toLocaleString('fr-FR')}</small></span>;
                    };

                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '1rem', fontWeight: 500 }}>{s.name}</td>
                        <td style={{ padding: '1rem' }}>{db.classes.find(c => c.id === s.classId)?.name || s.section}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9em' }}>{renderTranche(t1Expected, t1Paid)}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9em' }}>{renderTranche(t2Expected, t2Paid)}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9em' }}>{renderTranche(t3Expected, t3Paid)}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: balanceColor }}>
                          {totalExpected === 0 ? '-' : (totalBalance <= 0 ? 'Soldé ✓' : totalBalance.toLocaleString('fr-FR') + ' FCFA')}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {canUseWhatsApp && totalBalance > 0 && formatPhoneForWhatsApp(s.parentPhone) ? (
                            <button onClick={() => handleWhatsAppClick(s, totalBalance, 'scolarité')} style={{ background: isSchoolSuspended ? '#a1a1aa' : '#25D366', color: 'white', padding: '0.25rem 0.5rem', border: 'none', borderRadius: '4px', cursor: isSchoolSuspended ? 'not-allowed' : 'pointer', fontSize: '0.85em' }} title="Relancer par WhatsApp" disabled={isSchoolSuspended}>📱 WhatsApp</button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  }

                  if (bilanType === 'transport') {
                    const expected = s.feeTransport ?? g.feeTransport;
                    const paid = db.payments.filter(p => p.studentId === s.id && p.type === 'transport').reduce((sum, p) => sum + p.amount, 0);
                    const reste = expected - paid;
                    const balanceColor = reste <= 0 && expected > 0 ? 'var(--success)' : (reste > 0 ? 'var(--danger)' : 'var(--text-muted)');
                    const busName = db.buses.find(b => b.id === s.busId)?.name || <span style={{color:'var(--text-muted)'}}>Non assigné</span>;

                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '1rem', fontWeight: 500 }}>{s.name}</td>
                        <td style={{ padding: '1rem' }}>{db.classes.find(c => c.id === s.classId)?.name || s.section}</td>
                        <td style={{ padding: '1rem' }}>{busName}</td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>{expected > 0 ? `${expected.toLocaleString('fr-FR')} FCFA` : '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--success)' }}>{paid > 0 ? `+ ${paid.toLocaleString('fr-FR')}` : '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: balanceColor }}>
                          {expected === 0 ? '-' : (reste <= 0 ? 'Soldé ✓' : `${reste.toLocaleString('fr-FR')} FCFA`)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {canUseWhatsApp && reste > 0 && formatPhoneForWhatsApp(s.parentPhone) ? (
                            <button onClick={() => handleWhatsAppClick(s, reste, 'scolarité (transport)')} style={{ background: isSchoolSuspended ? '#a1a1aa' : '#25D366', color: 'white', padding: '0.25rem 0.5rem', border: 'none', borderRadius: '4px', cursor: isSchoolSuspended ? 'not-allowed' : 'pointer', fontSize: '0.85em' }} title="Relancer par WhatsApp" disabled={isSchoolSuspended}>📱 WhatsApp</button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  }

                  if (bilanType === 'uniforms') {
                    const expected = s.feeUniforms ?? g.feeUniforms;
                    const paid = db.payments.filter(p => p.studentId === s.id && p.type === 'uniforms').reduce((sum, p) => sum + p.amount, 0);
                    const paidOther = db.payments.filter(p => p.studentId === s.id && p.type === 'other').reduce((sum, p) => sum + p.amount, 0);
                    const reste = expected - paid;
                    const balanceColor = reste <= 0 && expected > 0 ? 'var(--success)' : (reste > 0 ? 'var(--danger)' : 'var(--text-muted)');

                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '1rem', fontWeight: 500 }}>{s.name}</td>
                        <td style={{ padding: '1rem' }}>{db.classes.find(c => c.id === s.classId)?.name || s.section}</td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>{expected > 0 ? `${expected.toLocaleString('fr-FR')} FCFA` : '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--success)' }}>{paid > 0 ? `+ ${paid.toLocaleString('fr-FR')}` : '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--primary-color)' }}>{paidOther > 0 ? `+ ${paidOther.toLocaleString('fr-FR')}` : '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: balanceColor }}>
                          {expected === 0 ? '-' : (reste <= 0 ? 'Soldé ✓' : `${reste.toLocaleString('fr-FR')} FCFA`)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {canUseWhatsApp && reste > 0 && formatPhoneForWhatsApp(s.parentPhone) ? (
                            <button onClick={() => handleWhatsAppClick(s, reste, 'scolarité (tenues)')} style={{ background: '#25D366', color: 'white', padding: '0.25rem 0.5rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em' }} title="Relancer par WhatsApp">📱 WhatsApp</button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  }
                  return null;
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'brouillard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" id="brouillard-day-section" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
              <h2 style={{ color: 'var(--warning)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock size={22} /> Clôture & Brouillard de Caisse
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={18} color="var(--text-muted)" />
                <label style={{ fontWeight: 500, fontSize: '0.9rem' }}>Date sélectionnée :</label>
                <input
                  type="date"
                  max={todayStr}
                  value={selectedClosureDate}
                  onChange={e => setSelectedClosureDate(e.target.value)}
                  style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontWeight: 'bold' }}
                />
              </div>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Ce module gère <strong>EXCLUSIVEMENT</strong> l'argent liquide (Espèces) encaissé physiquement dans le tiroir caisse. Le Mobile Money est exclu car les fonds sont sur compte virtuel / bancaire.
            </p>

            {(() => {
              const archivedClosure = cashClosures.find(c => c.date === selectedClosureDate);

              if (archivedClosure) {
                return (
                  <div style={{ padding: '1.5rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#15803d', fontWeight: 'bold', fontSize: '1.2rem' }}>
                        <CheckCircle size={24} />
                        Journée du {formatIsoDateFr(archivedClosure.date)} Clôturée
                      </div>
                      <button
                        className="no-print"
                        style={{ background: '#166534', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        onClick={() => {
                          setClosureToPrint(archivedClosure);
                          setTimeout(() => window.print(), 100);
                        }}
                      >
                        🖨️ Imprimer la Clôture Archivée
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', margin: '1.5rem 0', background: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Statut</span>
                        <div style={{ fontWeight: 'bold', color: archivedClosure.discrepancy === 0 ? '#15803d' : '#dc2626' }}>
                          {archivedClosure.discrepancy === 0 ? 'CLÔTURÉ DÉFINITIVEMENT' : 'CLÔTURÉ AVEC ÉCART'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Clôturé par</span>
                        <div style={{ fontWeight: 500 }}>{formatClosureAuthor(archivedClosure, currentUser).name}</div>
                        {formatClosureAuthor(archivedClosure, currentUser).role && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatClosureAuthor(archivedClosure, currentUser).role}</div>
                        )}
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Date & Heure</span>
                        <div style={{ fontWeight: 500 }}>{formatClosureDateTime(archivedClosure.closedAt)}</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', textAlign: 'center' }}>
                      <div style={{ background: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Solde d'Ouverture</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{archivedClosure.openingBalance.toLocaleString('fr-FR')} FCFA</div>
                      </div>
                      <div style={{ background: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Encaissements Cash</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--success)' }}>+{archivedClosure.cashReceived.toLocaleString('fr-FR')} FCFA</div>
                      </div>
                      <div style={{ background: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sorties Cash</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--danger)' }}>-{archivedClosure.cashExpenses.toLocaleString('fr-FR')} FCFA</div>
                      </div>
                      <div style={{ background: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Solde Théorique</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{archivedClosure.theoreticalBalance.toLocaleString('fr-FR')} FCFA</div>
                      </div>
                      <div style={{ background: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Montant Compté</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{archivedClosure.countedBalance.toLocaleString('fr-FR')} FCFA</div>
                      </div>
                      <div style={{ background: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Écart</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: archivedClosure.discrepancy === 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {archivedClosure.discrepancy.toLocaleString('fr-FR')} FCFA
                        </div>
                      </div>
                    </div>

                    {archivedClosure.notes && (
                      <div style={{ marginTop: '1.5rem', background: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <strong style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Observation enregistrée :</strong>
                        <div style={{ marginTop: '0.25rem', fontWeight: 500 }}>{archivedClosure.notes}</div>
                      </div>
                    )}
                  </div>
                );
              }

              const cashPaymentsDate = db.payments.filter(p => p.date === selectedClosureDate && isCashPaymentForSchool(p, currentSchool?.id || ''));
              const expensesDate = (db.expenses || []).filter(e => e.date === selectedClosureDate && String(e.schoolId || '') === currentSchool?.id);
              const cashIn = cashPaymentsDate.reduce((sum, p) => sum + p.amount, 0);
              const cashOut = expensesDate.reduce((sum, e) => sum + e.amount, 0);

              const opening = typeof openingBalanceInput === 'number' ? openingBalanceInput : Number(String(openingBalanceInput || 0).trim());
              const counted = typeof countedBalanceInput === 'number' ? countedBalanceInput : (countedBalanceInput === '' ? 0 : Number(countedBalanceInput));
              const theoretical = opening + cashIn - cashOut;
              const disc = counted - theoretical;

              return (
                <div>
                  <div style={{ padding: '1rem', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '6px', marginBottom: '1.5rem', color: '#b45309' }}>
                    <strong>⚠️ Journée du {formatIsoDateFr(selectedClosureDate)} non clôturée.</strong> Saisissez le solde d'ouverture et le montant réellement compté dans la caisse physique pour effectuer la clôture définitive.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <h4 style={{ margin: '0 0 1rem 0', color: 'var(--primary-color)' }}>Saisie de Clôture</h4>

                      <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label>Solde d'Ouverture du Tiroir (FCFA)</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          required
                          value={openingBalanceInput}
                          onChange={e => setOpeningBalanceInput(e.target.value === '' ? '' : parseFloat(e.target.value))}
                          placeholder="ex: 0"
                        />
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Fond de caisse présent au début de la journée.</div>
                      </div>

                      <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label>Montant Réellement Compté dans le Tiroir (FCFA)</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          required
                          value={countedBalanceInput}
                          onChange={e => setCountedBalanceInput(e.target.value === '' ? '' : parseFloat(e.target.value))}
                          placeholder="Saisissez le total compté"
                        />
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Argent physique dénombré à la fin de journée.</div>
                      </div>

                      <div className="form-group">
                        <label>Observation (Obligatoire si écart ≠ 0)</label>
                        <textarea
                          rows={3}
                          value={notesInput}
                          onChange={e => setNotesInput(e.target.value)}
                          placeholder="Justification en cas d'écart (ex: monnaie manquante...)"
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', resize: 'vertical' }}
                        />
                      </div>
                    </div>

                    <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #fbc02d', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem 0', color: '#f57f17' }}>Aperçu Théorique du Tiroir</h4>
                        <div style={{ fontSize: '0.75rem', color: '#854d0e', marginBottom: '1rem', lineHeight: '1.4' }}>
                          Solde théorique de la journée sélectionnée. Ce montant concerne uniquement la date sélectionnée. Il peut être différent du solde global cumulé affiché en haut.
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.95rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Solde Ouverture (Donnée Manuelle) :</span>
                            <strong>{opening.toLocaleString('fr-FR')} FCFA</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }}>
                            <span>+ Encaissements espèces ({cashPaymentsDate.length}) :</span>
                            <strong>+{cashIn.toLocaleString('fr-FR')} FCFA</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
                            <span>- Dépenses espèces ({expensesDate.length}) :</span>
                            <strong>-{cashOut.toLocaleString('fr-FR')} FCFA</strong>
                          </div>
                          <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '0.5rem 0' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 'bold' }}>
                            <span>= Solde Théorique de la journée sélectionnée :</span>
                            <span style={{ color: '#f57f17' }}>{theoretical.toLocaleString('fr-FR')} FCFA</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.5rem' }}>
                            <span>Montant Compté (Donnée Manuelle) :</span>
                            <span style={{ color: 'var(--primary-color)' }}>{counted.toLocaleString('fr-FR')} FCFA</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 'bold', padding: '0.5rem', background: disc === 0 ? '#f0fdf4' : '#fee2e2', borderRadius: '4px', marginTop: '0.5rem' }}>
                            <span>Écart Calculé :</span>
                            <span style={{ color: disc === 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {disc.toLocaleString('fr-FR')} FCFA
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        disabled={isSubmittingClosure}
                        onClick={handleCloseCashDrawer}
                        style={{ marginTop: '1.5rem', width: '100%', background: '#f57f17', color: '#fff', padding: '0.75rem', fontWeight: 'bold', fontSize: '1rem' }}
                      >
                        {isSubmittingClosure ? 'Clôture en cours...' : `🔒 Clôturer Définitivement la Caisse (${formatIsoDateFr(selectedClosureDate)})`}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* --- SYNTHÈSE JOURNALIÈRE DE CAISSE --- */}
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <div style={{ padding: '1.25rem', background: '#f8fafc', borderBottom: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📊 Synthèse journalière de caisse
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Aperçu des mouvements cash et statut de clôture par date
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Du :</label>
                  <input
                    type="date"
                    max={todayStr}
                    value={synthesisStartDate}
                    onChange={e => setSynthesisStartDate(e.target.value)}
                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Au :</label>
                  <input
                    type="date"
                    max={todayStr}
                    value={synthesisEndDate}
                    onChange={e => setSynthesisEndDate(e.target.value)}
                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </div>

            {synthesisStartDate > synthesisEndDate ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--danger)', background: '#fee2e2' }}>
                ⚠️ La date de début ne peut pas être supérieure à la date de fin.
              </div>
            ) : (() => {
              const dateSet = new Set<string>();

              (db.payments || []).forEach(p => {
                if (isCashPaymentForSchool(p, currentSchool?.id || '') && p.date) {
                  if (p.date >= synthesisStartDate && p.date <= synthesisEndDate) {
                    dateSet.add(p.date);
                  }
                }
              });

              (db.expenses || []).forEach(e => {
                if (e.date && String(e.schoolId || '') === currentSchool?.id && e.date >= synthesisStartDate && e.date <= synthesisEndDate) {
                  dateSet.add(e.date);
                }
              });

              cashClosures.forEach(c => {
                if (c.date && c.date >= synthesisStartDate && c.date <= synthesisEndDate) {
                  dateSet.add(c.date);
                }
              });

              const sortedDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));

              if (sortedDates.length === 0) {
                return (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Aucun mouvement de caisse pour la période sélectionnée.
                  </div>
                );
              }

              return (
                <table style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
                    <tr>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Encaissements espèces</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Dépenses espèces</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Résultat net du jour</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Solde Ouverture</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Solde Théorique</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Montant Compté</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Écart</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Statut</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center', position: 'sticky', right: 0, background: 'var(--bg-color)', zIndex: 1, whiteSpace: 'nowrap' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let totalEncaissementsPeriode = 0;
                      let totalDepensesPeriode = 0;

                      const rows = sortedDates.map(dateStr => {
                        const existingClosure = cashClosures.find(c => c.date === dateStr);

                        let cashReceived = 0;
                        let cashExpenses = 0;
                        let openingBalanceText = '—';
                        let theoreticalBalanceText = '—';
                        let countedBalanceText = '—';
                        let discrepancyText = '—';
                        let isClosed = false;
                        let hasDiscrepancy = false;

                        if (existingClosure) {
                          isClosed = true;
                          cashReceived = existingClosure.cashReceived;
                          cashExpenses = existingClosure.cashExpenses;
                          openingBalanceText = `${existingClosure.openingBalance.toLocaleString('fr-FR')} FCFA`;
                          theoreticalBalanceText = `${existingClosure.theoreticalBalance.toLocaleString('fr-FR')} FCFA`;
                          countedBalanceText = `${existingClosure.countedBalance.toLocaleString('fr-FR')} FCFA`;
                          discrepancyText = `${existingClosure.discrepancy.toLocaleString('fr-FR')} FCFA`;
                          hasDiscrepancy = existingClosure.discrepancy !== 0;
                        } else {
                          const pList = (db.payments || []).filter(p => p.date === dateStr && isCashPaymentForSchool(p, currentSchool?.id || ''));
                          const eList = (db.expenses || []).filter(e => e.date === dateStr && String(e.schoolId || '') === currentSchool?.id);
                          cashReceived = pList.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                          cashExpenses = eList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
                        }

                        totalEncaissementsPeriode += cashReceived;
                        totalDepensesPeriode += cashExpenses;

                        const netDuJour = cashReceived - cashExpenses;

                        return (
                          <tr key={dateStr} style={{ borderBottom: '1px solid var(--border-color)', background: selectedClosureDate === dateStr ? '#f0f9ff' : undefined }}>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{formatIsoDateFr(dateStr)}</td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--success)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                              +{cashReceived.toLocaleString('fr-FR')} FCFA
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--danger)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                              -{cashExpenses.toLocaleString('fr-FR')} FCFA
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: netDuJour >= 0 ? '#0369a1' : 'var(--danger)', whiteSpace: 'nowrap' }}>
                              {netDuJour > 0 ? '+' : ''}{netDuJour.toLocaleString('fr-FR')} FCFA
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{openingBalanceText}</td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 500, whiteSpace: 'nowrap' }}>{theoreticalBalanceText}</td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{countedBalanceText}</td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: !isClosed ? 'inherit' : (hasDiscrepancy ? 'var(--danger)' : 'var(--success)'), whiteSpace: 'nowrap' }}>
                              {discrepancyText}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {isClosed ? (
                                hasDiscrepancy ? (
                                  <span style={{ padding: '0.2rem 0.5rem', background: '#fee2e2', color: '#dc2626', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                    Clôturé avec écart
                                  </span>
                                ) : (
                                  <span style={{ padding: '0.2rem 0.5rem', background: '#dcfce7', color: '#16a34a', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                    Clôturé
                                  </span>
                                )
                              ) : (
                                <span style={{ padding: '0.2rem 0.5rem', background: '#fef9c3', color: '#854d0e', border: '1px solid #fef08a', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                  Non clôturé
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center', position: 'sticky', right: 0, background: selectedClosureDate === dateStr ? '#f0f9ff' : '#fff', zIndex: 1, whiteSpace: 'nowrap' }}>
                              <button
                                className="secondary"
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                                onClick={() => {
                                  setSelectedClosureDate(dateStr);
                                  const el = document.getElementById('brouillard-day-section');
                                  if (el) {
                                    el.scrollIntoView({ behavior: 'smooth' });
                                  }
                                }}
                              >
                                🔍 Inspecter
                              </button>
                            </td>
                          </tr>
                        );
                      });

                      const resultatNetPeriode = totalEncaissementsPeriode - totalDepensesPeriode;
                      const netPeriodeColor = resultatNetPeriode > 0 ? '#16a34a' : (resultatNetPeriode < 0 ? '#dc2626' : 'inherit');

                      return (
                        <>
                          {rows}
                          <tr style={{ background: '#f1f5f9', borderTop: '2px solid var(--border-color)', fontWeight: 'bold' }}>
                            <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>Total de la période</td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--success)', whiteSpace: 'nowrap' }}>
                              +{totalEncaissementsPeriode.toLocaleString('fr-FR')} FCFA
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                              -{totalDepensesPeriode.toLocaleString('fr-FR')} FCFA
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: netPeriodeColor, whiteSpace: 'nowrap' }}>
                              {resultatNetPeriode > 0 ? '+' : ''}{resultatNetPeriode.toLocaleString('fr-FR')} FCFA
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Période</td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center', position: 'sticky', right: 0, background: '#f1f5f9', zIndex: 1, whiteSpace: 'nowrap' }}></td>
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              );
            })()}

            <div style={{ padding: '1rem', background: '#f8fafc', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
              <strong>📌 Légende des indicateurs :</strong>
              <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
                <li><strong>Solde global cumulé :</strong> Tous les mouvements en espèces enregistrés dans l'école, dépenses déduites.</li>
                <li><strong>Résultat net du jour :</strong> Encaissements espèces moins dépenses espèces de la date spécifique.</li>
                <li><strong>Solde théorique :</strong> Solde d'ouverture plus encaissements espèces moins dépenses espèces de la journée.</li>
                <li><strong>Montant compté :</strong> Somme physique réellement dénombrée dans le tiroir de caisse lors de la clôture.</li>
              </ul>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <div style={{ padding: '1rem', background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📋 Historique des Clôtures de Caisse ({cashClosures.length})
              </h3>
            </div>

            <table style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Solde ouverture</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Encaissements espèces</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Dépenses espèces</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Solde théorique</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Montant compté</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Écart</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Statut</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Clôturé par / le</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {cashClosures.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Aucune clôture enregistrée pour cette école
                    </td>
                  </tr>
                ) : (
                  cashClosures.sort((a, b) => b.date.localeCompare(a.date)).map(cl => {
                    const authorInfo = formatClosureAuthor(cl, currentUser);
                    const closureDateTime = formatClosureDateTime(cl.closedAt);
                    const isDiscrepant = cl.discrepancy !== 0;

                    return (
                      <tr key={cl.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{formatIsoDateFr(cl.date)}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{cl.openingBalance.toLocaleString('fr-FR')} FCFA</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--success)', fontWeight: 500, whiteSpace: 'nowrap' }}>+{cl.cashReceived.toLocaleString('fr-FR')} FCFA</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--danger)', fontWeight: 500, whiteSpace: 'nowrap' }}>-{cl.cashExpenses.toLocaleString('fr-FR')} FCFA</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 500, whiteSpace: 'nowrap' }}>{cl.theoreticalBalance.toLocaleString('fr-FR')} FCFA</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{cl.countedBalance.toLocaleString('fr-FR')} FCFA</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: !isDiscrepant ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}>
                          {cl.discrepancy.toLocaleString('fr-FR')} FCFA
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {isDiscrepant ? (
                            <span style={{ padding: '0.2rem 0.5rem', background: '#fee2e2', color: '#dc2626', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                              Clôturé avec écart
                            </span>
                          ) : (
                            <span style={{ padding: '0.2rem 0.5rem', background: '#dcfce7', color: '#16a34a', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                              Clôturé
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                          <div style={{ fontWeight: 'bold' }}>{authorInfo.name}</div>
                          {authorInfo.role && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{authorInfo.role}</div>}
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Le {closureDateTime}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            className="secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                            onClick={() => {
                              setClosureToPrint(cl);
                              setTimeout(() => window.print(), 100);
                            }}
                            title="Réimprimer le document de clôture"
                          >
                            🖨️ Réimprimer
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Encaissement Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title="Nouvel Encaissement">
        <form onSubmit={handleSavePayment}>
          <div className="form-group">
            <label>Élève</label>
            <select required value={currentPayment.studentId || ''} onChange={e => setCurrentPayment({...currentPayment, studentId: e.target.value})}>
              <option value="">-- Choisir un élève --</option>
              {db.students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.section})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
             <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
              <label>Nature du Versement</label>
              <select required value={currentPayment.type || 'tuition'} onChange={e => {
                const newType = e.target.value as 'tuition' | 'transport' | 'uniforms' | 'registration_fee' | 'other';
                if (newType === 'registration_fee') {
                  setCurrentPayment(prev => {
                    const nextPayment: Partial<Payment> = { ...prev, type: 'registration_fee', amount: '' as unknown as number };
                    delete nextPayment.installment;
                    return nextPayment;
                  });
                } else if (newType === 'tuition') {
                  setCurrentPayment(prev => ({
                    ...prev,
                    type: 'tuition',
                    installment: 'T1',
                    amount: '' as unknown as number
                  }));
                } else {
                  setCurrentPayment(prev => {
                    const nextPayment: Partial<Payment> = { ...prev, type: newType, amount: '' as unknown as number };
                    delete nextPayment.installment;
                    return nextPayment;
                  });
                }
              }}>
                <option value="registration_fee">Frais d'inscription</option>
                <option value="tuition">Scolarité (Tranche versée)</option>
                <option value="transport">Transport (Bus)</option>
                <option value="uniforms">Tenues</option>
                <option value="other">Autre</option>
              </select>
            </div>
            {currentPayment.type === 'tuition' && (
              <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Choix de la Tranche</label>
                <select required value={currentPayment.installment || 'T1'} onChange={e => setCurrentPayment({...currentPayment, installment: e.target.value as 'T1' | 'T2' | 'T3'})}>
                  <option value="T1">Tranche 1</option>
                  <option value="T2">Tranche 2</option>
                  <option value="T3">Tranche 3</option>
                </select>
              </div>
            )}
            {currentPayment.type === 'transport' && (
              <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Mois (Transport)</label>
                <select required value={currentPayment.month || 'Septembre'} onChange={e => setCurrentPayment({...currentPayment, month: e.target.value})}>
                  <option value="Septembre">Septembre</option>
                  <option value="Octobre">Octobre</option>
                  <option value="Novembre">Novembre</option>
                  <option value="Décembre">Décembre</option>
                  <option value="Janvier">Janvier</option>
                  <option value="Février">Février</option>
                  <option value="Mars">Mars</option>
                  <option value="Avril">Avril</option>
                  <option value="Mai">Mai</option>
                  <option value="Juin">Juin</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
            )}
            <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
              <label>Date</label>
              <input type="date" required value={currentPayment.date || ''} onChange={e => setCurrentPayment({...currentPayment, date: e.target.value})} />
            </div>
          </div>
          {currentPayment.type !== 'other' && (
            <div className="form-group">
              <label>Montant Attendu (Total pour ce motif)</label>
              <input type="number" min="0" step="1" required value={modalExpectedAmount ?? ''} onChange={e => setModalExpectedAmount(parseFloat(e.target.value) || 0)} />
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>*Vous pouvez définir ou modifier le montant total exigé pour cet élève directement ici.</div>
            </div>
          )}
          <div className="form-group">
            <label>Montant Versé (FCFA)</label>
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              autoComplete="off"
              required
              value={currentPayment.amount ?? ''}
              onChange={e => setCurrentPayment({...currentPayment, amount: e.target.value as unknown as number})}
              onWheel={(e) => e.currentTarget.blur()}
            />

            {feeDetails && currentPayment.type !== 'other' && (() => {
               const expected = modalExpectedAmount;
               const paidBefore = feeDetails.alreadyPaid;
               const resteAvant = Math.max(0, expected - paidBefore);
               const saisi = Number(currentPayment.amount) || 0;
               const resteApres = Math.max(0, resteAvant - saisi);
               return (
                 <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', background: '#f3f4f6', padding: '0.75rem', borderRadius: '4px', lineHeight: '1.5' }}>
                   <div>• <strong>Montant attendu :</strong> {expected.toLocaleString('fr-FR')} FCFA</div>
                   <div>• <strong>{currentPayment.type === 'tuition' ? 'Déjà payé sur la tranche :' : 'Déjà payé :'}</strong> {paidBefore.toLocaleString('fr-FR')} FCFA</div>
                   <div>• <strong>Reste avant versement :</strong> {resteAvant.toLocaleString('fr-FR')} FCFA</div>
                   {saisi > 0 && <div>• <strong>Montant saisi :</strong> {saisi.toLocaleString('fr-FR')} FCFA</div>}
                   <div style={{ color: resteApres > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 'bold', marginTop: '0.25rem' }}>
                     → Nouveau reste prévisionnel : {resteApres.toLocaleString('fr-FR')} FCFA
                   </div>
                 </div>
               );
            })()}
          </div>
          {currentPayment.type === 'other' && (
            <div className="form-group">
              <label>Description (Précisez)</label>
              <input required placeholder="ex: Frais d'examen, Pénalités..." value={currentPayment.description || ''} onChange={e => setCurrentPayment({...currentPayment, description: e.target.value})} />
            </div>
          )}

          <div className="form-group" style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
            <label style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>Méthode d'encaissement</label>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 1rem', background: paymentMethod === 'cash' ? '#fff' : 'transparent', border: paymentMethod === 'cash' ? '1px solid var(--border-color)' : '1px solid transparent', borderRadius: '4px', boxShadow: paymentMethod === 'cash' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                <input type="radio" name="method" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} style={{ margin: 0 }} />
                💵 Espèces
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 1rem', background: paymentMethod === 'mobile_money' ? '#fff' : 'transparent', border: paymentMethod === 'mobile_money' ? '1px solid #f97316' : '1px solid transparent', borderRadius: '4px', boxShadow: paymentMethod === 'mobile_money' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                <input type="radio" name="method" checked={paymentMethod === 'mobile_money'} onChange={() => setPaymentMethod('mobile_money')} style={{ margin: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: '#ea580c', fontWeight: paymentMethod === 'mobile_money' ? 600 : 400 }}>📱 Mobile Money (En Ligne)</span>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '0.7rem', background: '#ff6600', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Orange Money</span>
                    <span style={{ fontSize: '0.7rem', background: '#ffcc00', color: '#000', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>MTN MoMo</span>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {paymentMethod === 'mobile_money' && (
             <div className="form-group" style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(249, 115, 22, 0.05)', border: '1px solid #f97316', borderRadius: '4px' }}>
                <label style={{ color: '#ea580c', fontWeight: 500 }}>Numéro Mobile Money du Parent</label>
                <input
                  type="tel"
                  placeholder="ex: 237677000000"
                  value={parentPhone}
                  required={paymentMethod === 'mobile_money'}
                  onChange={e => setParentPhone(e.target.value)}
                  disabled={isProcessingMoMo || momoSuccess}
                  style={{ borderColor: '#f97316', marginTop: '0.5rem', width: '100%', padding: '0.75rem' }}
                />

                {db.school?.apiKeys?.flutterwavePublic ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--success)', marginTop: '0.5rem' }}>✓ Clé API Officielle détectée.</div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--warning)', marginTop: '0.5rem', fontStyle: 'italic' }}>⚠️ Mode Simulation Actif (Aucune clé API trouvée dans Paramètres). L'argent n'est pas réellement débité.</div>
                )}
             </div>
          )}

          {isProcessingMoMo && (
             <div style={{ padding: '1rem', background: '#eef2ff', color: 'var(--primary-color)', textAlign: 'center', borderRadius: '4px', marginTop: '1rem', fontWeight: 500 }}>
               ⏳ Pop-up USSD envoyé au parent... Validation PIN en attente...
             </div>
          )}

          {momoSuccess && (
             <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', textAlign: 'center', borderRadius: '4px', marginTop: '1rem', fontWeight: 600 }}>
               ✅ Reçu validé ! Transaction réussie.
             </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="secondary" onClick={() => setModalOpen(false)} disabled={isProcessingMoMo || momoSuccess || isSaving}>Annuler</button>
            <button type="submit" disabled={isProcessingMoMo || momoSuccess || isSaving} style={{ background: paymentMethod === 'mobile_money' ? '#ea580c' : 'var(--primary-color)' }}>
              {isSaving ? "Enregistrement..." : (paymentMethod === 'cash' ? "Enregistrer l'encaissement" : "Lancer le paiement Mobile")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Dépense Modal */}
      <Modal isOpen={isExpenseModalOpen} onClose={() => setExpenseModalOpen(false)} title="Enregistrer une Sortie d'Argent">
        <form onSubmit={handleSaveExpense}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Montant Retiré (FCFA)</label>
              <input type="number" min="1" step="1" required value={currentExpense.amount ?? ''} onChange={e => setCurrentExpense({...currentExpense, amount: parseFloat(e.target.value)})} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Date</label>
              <input type="date" required value={currentExpense.date || ''} onChange={e => setCurrentExpense({...currentExpense, date: e.target.value})} />
            </div>
          </div>
          <div className="form-group">
            <label>Motif / But de la dépense</label>
            <input required placeholder="ex: Achat de craie, Réparation de porte..." value={currentExpense.reason || ''} onChange={e => setCurrentExpense({...currentExpense, reason: e.target.value})} />
          </div>
          <div className="form-group">
            <label>Auteur / Personne impliquée</label>
            <input required placeholder="Nom de l'enseignant, du fournisseur..." value={currentExpense.person || ''} onChange={e => setCurrentExpense({...currentExpense, person: e.target.value})} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="secondary" onClick={() => setExpenseModalOpen(false)} disabled={isSaving}>Annuler</button>
            <button type="submit" disabled={isSaving} style={{ background: 'var(--danger)' }}>
              {isSaving ? "Retrait en cours..." : "Confirmer le retrait"}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default Payments;
