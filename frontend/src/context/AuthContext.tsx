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
  useSignInEmailPassword,
  useSignOut,
} from "@nhost/react";
import { nhost } from "@/lib/nhost";

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
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const nhostUser = useUserData();
  const isAuthenticated = useAuthenticated();
  const { isLoading: isAuthLoading } = useAuthenticationStatus();
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
        setRole(data.role);
      }
    } catch (err) {
      console.error("Failed to fetch organization details:", err);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;

    async function syncOrg() {
      if (nhostUser && nhostUser.id) {
        try {
          const res = await fetch(`/api/auth/me?userId=${nhostUser.id}`);
          if (!res.ok) return;
          const data = await res.json();
          if (isCurrent) {
            setOrganization(data.organization || null);
            setRole(data.role || null);
          }
        } catch (err) {
          console.error("Failed to fetch organization details:", err);
        }
      } else if (isCurrent) {
        setOrganization(null);
        setRole(null);
      }
    }

    syncOrg();

    return () => {
      isCurrent = false;
    };
  }, [nhostUser]);

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

  const user: AuthUser | null = nhostUser
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
        isLoading: isAuthLoading,
        isAuthenticated,
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
