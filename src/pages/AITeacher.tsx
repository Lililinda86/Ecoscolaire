import React, { useState, useRef, useEffect } from 'react';
import { aiService } from '../services/AIService';
import type { AIProvider } from '../services/AIService';
import { Send, Bot, User, Loader2, Settings, BookOpen } from 'lucide-react';

const AITeacher: React.FC = () => {
  const [messages, setMessages] = useState<{role: 'user'|'assistant', content: string}[]>([
    { role: 'assistant', content: "Bonjour cher Enseignant ! Je suis votre assistant pédagogique IA. Je peux vous aider à préparer une leçon, créer une évaluation, générer des remarques de bulletins, ou trouver des activités éducatives. Que souhaitez-vous préparer aujourd'hui ?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<AIProvider>('mock');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await aiService.generateResponse(userMessage, { provider });
      setMessages(prev => [...prev, { role: 'assistant', content: response.content }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Erreur: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-color)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen color="var(--primary-color)" size={28} />
            Assistant IA Enseignant
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Propulsé par {provider.toUpperCase()}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Settings size={18} color="var(--text-muted)" />
          <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)} style={{ border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.25rem 0.5rem' }}>
            <option value="mock">Mode Mock (Simulation locale)</option>
            <option value="ollama">Ollama (Local LLaMA)</option>
            <option value="openai">OpenAI (Nécessite API Key)</option>
            <option value="gemini">Google Gemini</option>
            <option value="claude">Anthropic Claude</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#f8fafc' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: '1rem', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              {msg.role === 'assistant' && <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Bot size={20} /></div>}
              
              <div style={{ 
                background: msg.role === 'user' ? 'var(--primary-color)' : 'white', 
                color: msg.role === 'user' ? 'white' : 'var(--text-color)',
                padding: '1rem', 
                borderRadius: '12px',
                border: msg.role === 'user' ? 'none' : '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-sm)',
                whiteSpace: 'pre-wrap'
              }}>
                {msg.content}
              </div>

              {msg.role === 'user' && <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={20} /></div>}
            </div>
          ))}
          {isLoading && (
            <div style={{ display: 'flex', gap: '1rem', alignSelf: 'flex-start' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Bot size={20} /></div>
              <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Loader2 size={18} className="spin" color="var(--primary-color)" /> <i>Préparation du cours...</i>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} style={{ padding: '1rem', background: 'white', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '1rem' }}>
          <input 
            type="text" 
            value={input} 
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ex: Prépare une leçon de sciences sur les plantes pour le CM1" 
            style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '999px', border: '1px solid var(--border-color)', outline: 'none' }}
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !input.trim()} style={{ borderRadius: '999px', width: '48px', height: '48px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Send size={20} />
          </button>
        </form>
      </div>
      
      {/* Styles for the spin animation if not globally defined */}
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};

export default AITeacher;
