import { useEffect, useState, useCallback } from 'react';
import { authService, type AuthStateChange } from '../services/auth';
import { wipeAllLocalData } from '../services/db';

export function useAuth() {
  const [state, setState] = useState<AuthStateChange>(() => authService.getState());

  useEffect(() => {
    const unsubscribe = authService.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(() => {
    authService.requestToken();
  }, []);

  const reconnect = useCallback(() => {
    authService.requestToken();
  }, []);

  const setClientId = useCallback(async (clientId: string) => {
    await authService.setClientId(clientId);
  }, []);

  const signOut = useCallback(() => {
    authService.signOut();
  }, []);

  const signOutAndWipe = useCallback(async () => {
    authService.signOut();
    await wipeAllLocalData();
  }, []);

  return {
    ...state,
    signIn,
    reconnect,
    setClientId,
    signOut,
    signOutAndWipe,
  };
}
