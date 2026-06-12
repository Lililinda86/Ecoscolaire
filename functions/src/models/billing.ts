export interface SaaSInvoice {
  id: string; // Généré par Firestore
  schoolId: string;
  planId: string; // ex: 'standard_yearly'
  amount: number;
  currency: string; // 'XAF'
  provider: 'campay' | 'flutterwave';
  externalReference: string; // Réf unique envoyée à Campay
  providerReference: string; // ID de transaction retourné par Campay
  status: 'pending' | 'successful' | 'failed' | 'cancelled';
  createdAt: string; // ISO String
  paidAt: string | null;
  webhookPayloads: any[]; // Trace brute pour l'audit
}

export interface SubscriptionPlanConfig {
  id: string; // 'starter', 'standard', 'premium'
  name: string;
  monthlyPrice: number; // en FCFA
  yearlyPrice: number; // en FCFA (avec réduction)
  maxStudents: number | 'unlimited';
  features: string[];
  isActive: boolean;
}
