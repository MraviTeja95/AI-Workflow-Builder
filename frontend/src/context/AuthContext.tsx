"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  NhostProvider,
  useUserData,
  useAuthenticated,
  useAuthenticationStatus,
  useAccessToken,
  useSignInEmailPassword,
  useSignOut,
} from "@nhost/react";
import { nhost } from "@/lib/nhost";
import { useMounted } from "@/hooks/useMounted";

export interface AuthUser {
  id: string;
  email?: string;
  displayName?: string;
}

export interface UserOrganization {
  id: string;
  name: string;
  quota_limit?: number;
  quota_used?: number;
}

export interface AuthContextType {
  user: AuthUser | null;
  organization: UserOrganization | null;
  role: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const isMounted = useMounted();
  const nhostUser = useUserData();
  const isNhostAuthenticated = useAuthenticated();
  const { isLoading: isNhostAuthLoading } = useAuthenticationStatus();
  const accessToken = useAccessToken();
  const { signInEmailPassword } = useSignInEmailPassword();
  const { signOut } = useSignOut();

  const [organization, setOrganization] = useState<UserOrganization | null>(
    null
  );
  const [role, setRole] = useState<string | null>(null);

  const fetchOrganizationDetails = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/auth/me?userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.organization) {
        setOrganization(data.organization);
      }
      if (data.role) {
        setRole(data.role || null);
      }
    } catch (err) {
      console.error("Failed to fetch organization details:", err);
    }
  }, []);

  // Synchronize organization details whenever authenticated user changes
  useEffect(() => {
    let isCurrent = true;

    if (isMounted && !isNhostAuthLoading && isNhostAuthenticated && nhostUser?.id) {
      fetch(`/api/auth/me?userId=${nhostUser.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && isCurrent) {
            if (data.organization) setOrganization(data.organization);
            if (data.role) setRole(data.role || null);
          }
        })
        .catch((err) => console.error("Sync org error:", err));
    }

    return () => {
      isCurrent = false;
    };
  }, [isMounted, isNhostAuthLoading, isNhostAuthenticated, nhostUser?.id]);

  const login = async (email: string, password: string) => {
    const result = await signInEmailPassword(email, password);
    if (result.isError) {
      throw new Error(result.error?.message || "Failed to sign in.");
    }
    if (result.user && result.user.id) {
      await fetchOrganizationDetails(result.user.id);
    }
  };

  const logout = async () => {
    await signOut();
    setOrganization(null);
    setRole(null);
  };

  const refreshSession = async () => {
    if (nhostUser && nhostUser.id) {
      await fetchOrganizationDetails(nhostUser.id);
    }
  };

  // Lifecycle states:
  // 1. isLoading: True during initial SSR and while Nhost is checking/refreshing token
  const isLoading = !isMounted || isNhostAuthLoading;

  // 2. isAuthenticated: True ONLY when hydration is complete and Nhost confirms signedIn with valid token
  const isAuthenticated = isMounted && !isNhostAuthLoading ? (isNhostAuthenticated && Boolean(accessToken)) : false;

  // 3. user: Populated when authenticated
  const user: AuthUser | null =
    isAuthenticated && nhostUser
      ? {
          id: nhostUser.id,
          email: nhostUser.email || undefined,
          displayName: nhostUser.displayName || undefined,
        }
      : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        role,
        isLoading,
        isAuthenticated,
        accessToken: isAuthenticated ? accessToken : null,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <NhostProvider nhost={nhost}>
      <AuthStateProvider>{children}</AuthStateProvider>
    </NhostProvider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

