import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  getSecureItem, 
  saveSecureItem, 
  clearAuthStorage, 
  STORAGE_KEYS 
} from '../utils/storage';
import { decodeJwt } from '../utils/api';

interface UserProfile {
  userId: string;
  name: string;
  email: string;
  role: string;
  hospitalId: string;
  hospitalName: string;
}

interface AuthContextType {
  token: string | null;
  user: UserProfile | null;
  hospitalId: string | null;
  hospitalName: string | null;
  loading: boolean;
  login: (authData: { 
    token: string; 
    userId: string; 
    name: string; 
    email: string; 
    role: string; 
    hospitalId: string; 
    hospitalName: string; 
  }) => Promise<void>;
  logout: () => Promise<void>;
  updateHospitalName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [hospitalName, setHospitalName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStoredAuth() {
      try {
        const storedToken = await getSecureItem(STORAGE_KEYS.TOKEN);
        const storedUserJson = await getSecureItem(STORAGE_KEYS.USER);
        const storedHospitalId = await getSecureItem(STORAGE_KEYS.HOSPITAL_ID);
        const storedHospitalName = await getSecureItem(STORAGE_KEYS.HOSPITAL_NAME);

        if (storedToken && storedUserJson) {
          const decoded = decodeJwt(storedToken);
          const nowInSecs = Math.floor(Date.now() / 1000);
          if (decoded && decoded.exp && decoded.exp < nowInSecs) {
            console.log('Stored auth token is expired. Clearing storage.');
            await clearAuthStorage();
          } else {
            const parsedUser = JSON.parse(storedUserJson);
            setToken(storedToken);
            setUser(parsedUser);
            setHospitalId(storedHospitalId);
            setHospitalName(storedHospitalName);
          }
        }
      } catch (error) {
        console.error('Failed to load stored auth details:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadStoredAuth();
  }, []);

  // Hook up global unauthorized helper to perform automatic logout
  useEffect(() => {
    global.onUnauthorized = async () => {
      await logout();
    };
    return () => {
      global.onUnauthorized = undefined;
    };
  }, []);

  const login = async (authData: {
    token: string;
    userId: string;
    name: string;
    email: string;
    role: string;
    hospitalId: string;
    hospitalName: string;
  }) => {
    const userProfile: UserProfile = {
      userId: authData.userId,
      name: authData.name,
      email: authData.email,
      role: authData.role,
      hospitalId: authData.hospitalId,
      hospitalName: authData.hospitalName,
    };

    await saveSecureItem(STORAGE_KEYS.TOKEN, authData.token);
    await saveSecureItem(STORAGE_KEYS.USER, JSON.stringify(userProfile));
    await saveSecureItem(STORAGE_KEYS.HOSPITAL_ID, authData.hospitalId);
    await saveSecureItem(STORAGE_KEYS.HOSPITAL_NAME, authData.hospitalName);

    setToken(authData.token);
    setUser(userProfile);
    setHospitalId(authData.hospitalId);
    setHospitalName(authData.hospitalName);
  };

  const logout = async () => {
    await clearAuthStorage();
    setToken(null);
    setUser(null);
    setHospitalId(null);
    setHospitalName(null);
  };

  const updateHospitalName = async (name: string) => {
    if (user) {
      const updatedUser = { ...user, hospitalName: name };
      await saveSecureItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
      await saveSecureItem(STORAGE_KEYS.HOSPITAL_NAME, name);
      setUser(updatedUser);
      setHospitalName(name);
    }
  };

  return (
    <AuthContext.Provider value={{
      token,
      user,
      hospitalId,
      hospitalName,
      loading,
      login,
      logout,
      updateHospitalName,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
