import { useCallback, useEffect, useRef, useState } from 'react';

const COMPANION_URL = (import.meta.env.VITE_MEETING_MINUTES_COMPANION_URL || 'http://127.0.0.1:43117').replace(/\/$/, '');
const DISCONNECTED_KEY = 'meeting-minutes:local-oauth-disconnected';

export interface CompanionStatus {
  companion: boolean;
  paired: boolean;
  authenticated: boolean;
  pairUrl?: string;
  authMode?: string;
  plan?: string | null;
  expiresAt?: string | null;
  transcriptionRoute?: 'unknown' | 'public' | 'chatgpt-private';
  publicProbe?: {
    at: string;
    status: number | null;
    ok: boolean;
    detail?: string;
  } | null;
  error?: string;
}

type AuthStatus = 'checking' | 'starting' | 'redirecting' | 'signed-in' | 'signed-out' | 'error' | 'needs-extension';

const delay = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

export const getCompanionUrl = () => COMPANION_URL;

export const fetchCompanionStatus = async (): Promise<CompanionStatus> => {
  let response: Response;
  try {
    response = await fetch(`${COMPANION_URL}/status`, { cache: 'no-store' });
  } catch {
    throw new Error(`Compagnon OAuth local non détecté sur ${COMPANION_URL}. Lancez \"npm run companion:start\" sur cet ordinateur.`);
  }
  const data = await response.json().catch(() => null) as CompanionStatus | null;
  if (!response.ok || !data) throw new Error(data?.error || 'Réponse invalide du compagnon OAuth local.');
  return data;
};

const waitForAuthentication = async (timeoutMs = 120_000): Promise<CompanionStatus> => {
  const deadline = Date.now() + timeoutMs;
  let last: CompanionStatus | null = null;
  while (Date.now() < deadline) {
    await delay(1200);
    last = await fetchCompanionStatus();
    if (last.paired && last.authenticated) return last;
  }
  throw new Error(last?.paired
    ? 'La connexion Codex OAuth n’a pas été finalisée à temps.'
    : 'Ce site n’a pas encore été autorisé dans le compagnon local.');
};

export const useSignInWithChatGPT = () => {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [error, setError] = useState<Error | null>(null);
  const statusRef = useRef<CompanionStatus | null>(null);

  const refresh = useCallback(async () => {
    if (window.localStorage.getItem(DISCONNECTED_KEY) === '1') {
      setStatus('signed-out');
      return null;
    }
    try {
      const current = await fetchCompanionStatus();
      statusRef.current = current;
      setError(null);
      setStatus(current.paired && current.authenticated ? 'signed-in' : 'signed-out');
      return current;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Compagnon OAuth indisponible.'));
      setStatus('error');
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (window.localStorage.getItem(DISCONNECTED_KEY) !== '1') void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const login = useCallback(async () => {
    window.localStorage.removeItem(DISCONNECTED_KEY);
    setError(null);
    setStatus('starting');
    try {
      let current = await fetchCompanionStatus();
      statusRef.current = current;
      if (!current.paired) {
        if (!current.pairUrl) throw new Error('Le compagnon n’a pas fourni de lien d’autorisation pour ce site.');
        window.open(current.pairUrl, '_blank', 'noopener,noreferrer');
        setStatus('redirecting');
        current = await waitForAuthentication();
      } else if (!current.authenticated) {
        const response = await fetch(`${COMPANION_URL}/login`, { method: 'POST' });
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || 'Impossible de démarrer la connexion Codex.');
        setStatus('redirecting');
        current = await waitForAuthentication();
      }
      statusRef.current = current;
      setStatus(current.authenticated ? 'signed-in' : 'signed-out');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Connexion Codex OAuth impossible.'));
      setStatus('error');
    }
  }, []);

  const logout = useCallback(async () => {
    // Disconnect MeetingMind from the local companion without revoking the user's
    // Codex login globally. Reconnect by pressing the login button again.
    window.localStorage.setItem(DISCONNECTED_KEY, '1');
    statusRef.current = null;
    setError(null);
    setStatus('signed-out');
  }, []);

  return {
    status,
    isSignedIn: status === 'signed-in',
    error: error || new Error(''),
    installUrl: null as string | null,
    login,
    logout,
  };
};

// Kept as a compatibility export for code that previously used the browser OAuth
// package. OAuth headers are deliberately never exposed to the hosted web app.
export const openaiAuthHeaders = async () => ({} as Record<string, string>);
