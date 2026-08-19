export interface ChatGPTSession {
  accessToken: string;
  accountId: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: string;
  isFedRamp?: boolean;
}

export type LoginStartResult =
  | { status: 'started' }
  | { status: 'needs-extension'; installUrl: string };

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const ISSUER = 'https://auth.openai.com';
const SCOPE = 'openid profile email offline_access';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const SESSION_KEY = 'meetingmind:chatgpt-oauth-session';
const PENDING_KEY = 'meetingmind:chatgpt-oauth-pending';
const EXTENSION_STATE_PREFIX = 'oo2_';
const CHROME_EXTENSION_ID = 'odbgboachaefbbbdiffcefhpkekhfcna';
const CHROME_INSTALL_URL = 'https://chromewebstore.google.com/detail/sign-in-with-chatgpt/odbgboachaefbbbdiffcefhpkekhfcna';
const FIREFOX_INSTALL_URL = 'https://addons.mozilla.org/firefox/addon/sign-in-with-chatgpt/';
const FIREFOX_DETECTION_URL = 'http://localhost:1455/openai-oauth/installed';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface PendingLogin {
  state: string;
  codeVerifier: string;
  returnTo: string;
}

const textEncoder = new TextEncoder();

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

const stringToBase64Url = (value: string) => bytesToBase64Url(textEncoder.encode(value));

const randomUrlSafeString = (length = 48) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
};

const createCodeChallenge = async (verifier: string) => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
};

const parseJwtClaims = (token?: string): Record<string, unknown> | null => {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const binary = decodeBase64Url(parts[1]);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const deriveAccountId = (token?: string): string | undefined => {
  const claims = parseJwtClaims(token);
  if (!claims) return undefined;
  const authClaim = claims['https://api.openai.com/auth'];
  if (authClaim && typeof authClaim === 'object' && !Array.isArray(authClaim)) {
    const id = (authClaim as Record<string, unknown>).chatgpt_account_id;
    if (typeof id === 'string' && id) return id;
  }
  if (typeof claims.chatgpt_account_id === 'string' && claims.chatgpt_account_id) return claims.chatgpt_account_id;
  const organizations = claims.organizations;
  if (Array.isArray(organizations) && organizations.length > 0) {
    const first = organizations[0];
    if (first && typeof first === 'object' && typeof (first as Record<string, unknown>).id === 'string') {
      return (first as Record<string, unknown>).id as string;
    }
  }
  return undefined;
};

const deriveFedRamp = (token?: string) => {
  const claims = parseJwtClaims(token);
  const authClaim = claims?.['https://api.openai.com/auth'];
  return Boolean(authClaim && typeof authClaim === 'object' && !Array.isArray(authClaim) && (authClaim as Record<string, unknown>).chatgpt_account_is_fedramp === true);
};

const loadSession = (): ChatGPTSession | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChatGPTSession>;
    if (!parsed.accessToken || !parsed.accountId) return null;
    return parsed as ChatGPTSession;
  } catch {
    return null;
  }
};

const saveSession = (session: ChatGPTSession) => sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

const normalizeTokenResponse = (payload: Record<string, unknown>, previousRefreshToken?: string): ChatGPTSession => {
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
  if (!accessToken) throw new Error("La réponse OAuth ChatGPT ne contient pas de jeton d'accès.");
  const idToken = typeof payload.id_token === 'string' ? payload.id_token : undefined;
  const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : previousRefreshToken;
  const accountId = deriveAccountId(idToken) || deriveAccountId(accessToken);
  if (!accountId) throw new Error('Identifiant de compte ChatGPT introuvable dans la réponse OAuth.');
  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : undefined;
  return {
    accessToken,
    accountId,
    refreshToken,
    idToken,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
    isFedRamp: deriveFedRamp(idToken) || deriveFedRamp(accessToken),
  };
};

const shouldRefresh = (session: ChatGPTSession) => {
  if (session.expiresAt) {
    const expiry = new Date(session.expiresAt).getTime();
    if (Number.isFinite(expiry)) return expiry <= Date.now() + REFRESH_MARGIN_MS;
  }
  const claims = parseJwtClaims(session.accessToken);
  const exp = claims?.exp;
  return typeof exp === 'number' && exp * 1000 <= Date.now() + REFRESH_MARGIN_MS;
};

const refreshSession = async (session: ChatGPTSession) => {
  if (!session.refreshToken) throw new Error('Session ChatGPT expirée. Reconnectez-vous.');
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: session.refreshToken, client_id: CLIENT_ID }),
  });
  if (!response.ok) throw new Error(`Renouvellement OAuth ChatGPT impossible (${response.status}).`);
  const payload = await response.json() as Record<string, unknown>;
  const next = normalizeTokenResponse(payload, session.refreshToken);
  saveSession(next);
  return next;
};

export const getChatGPTSession = async (): Promise<ChatGPTSession | null> => {
  const session = loadSession();
  if (!session) return null;
  if (!shouldRefresh(session)) return session;
  return refreshSession(session);
};

export const getChatGPTAuthHeaders = async (): Promise<Record<string, string>> => {
  const session = await getChatGPTSession();
  if (!session) throw new Error('Connectez-vous à ChatGPT avant de lancer le traitement.');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    'chatgpt-account-id': session.accountId,
  };
  if (session.isFedRamp) headers['x-openai-fedramp'] = 'true';
  return headers;
};

const isFirefox = () => navigator.userAgent.toLowerCase().includes('firefox/');

const chromeExtensionInstalled = async () => {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 800);
    const response = await fetch(`chrome-extension://${CHROME_EXTENSION_ID}/src/installed.json`, { cache: 'no-store', signal: controller.signal });
    window.clearTimeout(timeout);
    if (!response.ok) return false;
    const marker = await response.json().catch(() => null) as { installed?: boolean } | null;
    return marker?.installed === true;
  } catch {
    return false;
  }
};

const firefoxExtensionInstalled = () => new Promise<boolean>((resolve) => {
  const parent = document.body || document.documentElement;
  if (!parent) return resolve(false);
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.setAttribute('aria-hidden', 'true');
  frame.src = FIREFOX_DETECTION_URL;
  let settled = false;
  const finish = (value: boolean) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    window.removeEventListener('message', onMessage);
    frame.remove();
    resolve(value);
  };
  const onMessage = (event: MessageEvent) => {
    const data = event.data as Record<string, unknown> | null;
    if (event.source === frame.contentWindow && event.origin.startsWith('moz-extension://') && data?.type === 'openai-oauth:browser-extension-installed') finish(true);
  };
  const timeout = window.setTimeout(() => finish(false), 800);
  window.addEventListener('message', onMessage);
  parent.appendChild(frame);
});

const extensionStatus = async (): Promise<{ installed: boolean; installUrl: string }> => {
  if (isFirefox()) return { installed: await firefoxExtensionInstalled(), installUrl: FIREFOX_INSTALL_URL };
  return { installed: await chromeExtensionInstalled(), installUrl: CHROME_INSTALL_URL };
};

export const startChatGPTLogin = async (): Promise<LoginStartResult> => {
  const extension = await extensionStatus();
  if (!extension.installed) return { status: 'needs-extension', installUrl: extension.installUrl };

  const codeVerifier = randomUrlSafeString();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const callbackUrl = `${window.location.origin}${window.location.pathname}`;
  const callbackState = {
    type: 'openai-oauth-callback',
    version: 1,
    nonce: randomUrlSafeString(24),
    callbackUrl,
  };
  const state = `${EXTENSION_STATE_PREFIX}${stringToBase64Url(JSON.stringify(callbackState))}`;
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const pending: PendingLogin = { state, codeVerifier, returnTo };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

  const url = new URL(`${ISSUER}/oauth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('id_token_add_organizations', 'true');
  url.searchParams.set('codex_cli_simplified_flow', 'true');
  window.location.assign(url.toString());
  return { status: 'started' };
};

export const completeChatGPTLogin = async (): Promise<ChatGPTSession | null> => {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');
  if (!code && !oauthError) return getChatGPTSession();

  const rawPending = sessionStorage.getItem(PENDING_KEY);
  const pending = rawPending ? JSON.parse(rawPending) as PendingLogin : null;
  if (!pending) throw new Error('État OAuth ChatGPT introuvable. Relancez la connexion.');
  const returnedState = url.searchParams.get('state');
  if (!returnedState || returnedState !== pending.state) throw new Error('État OAuth ChatGPT invalide.');

  if (oauthError) {
    sessionStorage.removeItem(PENDING_KEY);
    window.history.replaceState(null, '', pending.returnTo || '/');
    if (oauthError === 'access_denied') return null;
    throw new Error(url.searchParams.get('error_description') || `Erreur OAuth ChatGPT: ${oauthError}`);
  }

  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code as string,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: pending.codeVerifier,
    }).toString(),
  });
  if (!response.ok) throw new Error(`Connexion OAuth ChatGPT impossible (${response.status}).`);
  const payload = await response.json() as Record<string, unknown>;
  const session = normalizeTokenResponse(payload);
  saveSession(session);
  sessionStorage.removeItem(PENDING_KEY);
  window.history.replaceState(null, '', pending.returnTo || '/');
  return session;
};

export const logoutChatGPT = () => {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(PENDING_KEY);
};
