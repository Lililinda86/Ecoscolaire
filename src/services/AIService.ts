export type AIProvider = 'openai' | 'gemini' | 'claude' | 'ollama' | 'mock';

export interface AIResponse {
  content: string;
  provider: AIProvider;
  metadata?: any;
}

export interface AIRequestOptions {
  provider?: AIProvider;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Service d'Intelligence Artificielle extensible
 * Permet de basculer entre différents fournisseurs (OpenAI, Gemini, Claude, Ollama)
 */
class AIService {
  private defaultProvider: AIProvider = 'mock'; // Default to mock for safety until API keys are set
  
  // TODO: Load these from environment variables or secure backend
  // private keys = { ... }

  /**
   * Envoie un prompt à l'IA et retourne la réponse
   */
  async generateResponse(prompt: string, options?: AIRequestOptions): Promise<AIResponse> {
    const provider = options?.provider || this.defaultProvider;

    switch (provider) {
      case 'openai':
        return this.callOpenAI(prompt, options);
      case 'gemini':
        return this.callGemini(prompt, options);
      case 'claude':
        return this.callClaude(prompt, options);
      case 'ollama':
        return this.callOllama(prompt, options);
      case 'mock':
      default:
        return this.callMock(prompt);
    }
  }

  private async callOpenAI(prompt: string, _options?: AIRequestOptions): Promise<AIResponse> {
    // Implementation for OpenAI API (requires backend proxy or direct fetch with key)
    console.log("Calling OpenAI API...", prompt);
    throw new Error("OpenAI API non configurée. Utilisez le mode 'mock' pour tester.");
  }

  private async callGemini(prompt: string, _options?: AIRequestOptions): Promise<AIResponse> {
    // Implementation for Google Gemini API
    console.log("Calling Gemini API...", prompt);
    throw new Error("Gemini API non configurée.");
  }

  private async callClaude(prompt: string, _options?: AIRequestOptions): Promise<AIResponse> {
    // Implementation for Anthropic Claude API
    console.log("Calling Claude API...", prompt);
    throw new Error("Claude API non configurée.");
  }

  private async callOllama(prompt: string, _options?: AIRequestOptions): Promise<AIResponse> {
    // Implementation for local Ollama (e.g. http://localhost:11434/api/generate)
    console.log("Calling local Ollama API...", prompt);
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3', // ou mistral, etc.
          prompt: prompt,
          stream: false
        })
      });
      if (response.ok) {
        const data = await response.json();
        return { content: data.response, provider: 'ollama' };
      }
    } catch (err) {
      console.warn("Ollama non détecté localement, fallback vers mock.");
    }
    return this.callMock(prompt);
  }

  private async callMock(prompt: string): Promise<AIResponse> {
    // Simulated responses based on keywords in prompt
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network latency

    let response = "Je suis votre assistant métier EcoScolaire. Comment puis-je vous aider ?";

    const p = prompt.toLowerCase();
    
    // Director Mocks
    if (p.includes('revenu') || p.includes('paiement') || p.includes('finance')) {
      response = "📊 **Analyse Financière du mois**\n\n- Revenus collectés : 2,500,000 FCFA\n- Dépenses : 800,000 FCFA\n- Solde : 1,700,000 FCFA\n\nIl y a 12 retards de paiements concernant la tranche 2.";
    } else if (p.includes('absent') || p.includes('présence')) {
      response = "⚠️ **Rapport des présences**\n\nAujourd'hui, 3 élèves sont absents. \n\n**Alerte** : L'élève Jean Dupont (CM2) a cumulé plus de 3 jours d'absence consécutifs. Il est recommandé d'envoyer un message WhatsApp aux parents.";
    } else if (p.includes('effectif') || p.includes('classe')) {
      response = "📈 **Statistiques des classes**\n\n- CM2 : 45 élèves (Complet)\n- CM1 : 38 élèves\n- Maternelle : 25 élèves\n\nLe ratio moyen est de 35 élèves par classe.";
    }
    // Teacher Mocks
    else if (p.includes('leçon') || p.includes('cours')) {
      response = "📚 **Proposition de Leçon**\n\n**Sujet** : Le cycle de l'eau\n**Niveau** : CM1\n\n**Objectifs** : Comprendre l'évaporation, la condensation et les précipitations.\n\n**Activités** :\n1. Introduction théorique (15 min)\n2. Expérience de condensation sur vitre (20 min)\n3. Synthèse au tableau (10 min)";
    } else if (p.includes('évaluation') || p.includes('devoir') || p.includes('quiz')) {
      response = "📝 **Proposition d'Évaluation**\n\n**QCM : Le cycle de l'eau**\n\n1. Qu'est-ce que l'évaporation ?\na) L'eau qui gèle\nb) L'eau qui se transforme en gaz\nc) La pluie\n\n2. Où va l'eau de pluie ?\n[ ] Rivières\n[ ] Nappes phréatiques\n[ ] Espace";
    }

    return {
      content: response,
      provider: 'mock',
      metadata: { simulated: true }
    };
  }
}

export const aiService = new AIService();
