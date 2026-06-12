import { SubscriptionPlanConfig } from '../models/billing';

export const DRAFT_PLANS: SubscriptionPlanConfig[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 0, // à définir
    yearlyPrice: 0, // à définir
    maxStudents: 100,
    features: ['Gestion des élèves', 'Notes', 'Bulletins'],
    isActive: true
  },
  {
    id: 'standard',
    name: 'Standard',
    monthlyPrice: 0, // à définir
    yearlyPrice: 0, // à définir
    maxStudents: 500,
    features: ['Portail Parent', 'Facturation basique'],
    isActive: true
  },
  {
    id: 'premium',
    name: 'Premium',
    monthlyPrice: 0, // à définir
    yearlyPrice: 0, // à définir
    maxStudents: 'unlimited',
    features: ['WhatsApp SMS', 'Assistants IA', 'Support VIP'],
    isActive: true
  }
];
