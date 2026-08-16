import { httpsCallable } from 'firebase/functions';
import { functions } from '../db/firebase';

export type CreateExpenseInput = {
  amount: number;
  date: string;
  person: string;
  reason: string;
  category: string;
};

export const createExpense = async (input: CreateExpenseInput) => {
  const callable = httpsCallable<CreateExpenseInput, {
    success: boolean;
    expenseId: string;
    schoolId: string;
    status: 'POSTED';
  }>(functions, 'createExpense');
  return (await callable(input)).data;
};

export const reverseExpense = async (expenseId: string, reason: string) => {
  const callable = httpsCallable<{ expenseId: string; reason: string }, {
    success: boolean;
    expenseId: string;
    reversalId: string;
    schoolId: string;
    originalAmount: number;
    reversalAmount: number;
    status: 'REVERSED';
  }>(functions, 'reverseExpense');
  return (await callable({ expenseId, reason })).data;
};
