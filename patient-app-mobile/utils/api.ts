import { getSecureItem, STORAGE_KEYS, clearAuthStorage } from './storage';

export const API_BASE = 'https://hospital-queue-system-production.up.railway.app/api/v1';
export const WS_BASE = 'wss://hospital-queue-system-production.up.railway.app/ws-queue';

// Base64URL decoder for JWT parsing in React Native
export function decodeJwt(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    const payload = parts[1];
    
    // Replace URL-safe base64 characters
    let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    // Pad base64 string if necessary
    while (base64.length % 4) {
      base64 += '=';
    }
    
    // Custom base64 decode for environment compatibility
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let raw = '';
    for (let i = 0; i < base64.length; i += 4) {
      const c1 = chars.indexOf(base64[i]);
      const c2 = chars.indexOf(base64[i + 1]);
      const c3 = base64[i + 2] === '=' ? 0 : chars.indexOf(base64[i + 2]);
      const c4 = base64[i + 3] === '=' ? 0 : chars.indexOf(base64[i + 3]);
      
      const chunk = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;
      
      raw += String.fromCharCode((chunk >> 16) & 255);
      if (base64[i + 2] !== '=') {
        raw += String.fromCharCode((chunk >> 8) & 255);
      }
      if (base64[i + 3] !== '=') {
        raw += String.fromCharCode(chunk & 255);
      }
    }
    
    // Decode UTF-8 correctly
    try {
      return JSON.parse(
        decodeURIComponent(
          raw
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        )
      );
    } catch {
      return JSON.parse(raw);
    }
  } catch (error) {
    console.error('Error decoding JWT token:', error);
    return null;
  }
}

export async function authFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = await getSecureItem(STORAGE_KEYS.TOKEN);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  if (response.status === 401) {
    // Session expired, clear tokens
    await clearAuthStorage();
    // We could dispatch an event or trigger state change in AuthContext
    // This will force the app to redirect to Login
    if (global.onUnauthorized) {
      global.onUnauthorized();
    }
  }
  
  return response;
}

export async function getErrorMessage(res: Response, defaultMsg: string = 'An error occurred'): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return defaultMsg;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'string') return parsed;
      if (parsed.message) return parsed.message;
      if (parsed.error) return parsed.error;
      if (parsed.errors && Array.isArray(parsed.errors)) {
        return parsed.errors.map((e: any) => e.defaultMessage || e.message || String(e)).join(', ');
      }
    } catch {
      return text;
    }
    return text;
  } catch {
    return defaultMsg;
  }
}

// Add global type declaration for custom unauthorized callback hook
declare global {
  var onUnauthorized: (() => void) | undefined;
}
