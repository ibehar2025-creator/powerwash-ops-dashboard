import { createContext, useContext } from "react";

export type AccountRole = "owner" | "employee";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  pictureUrl: string;
  phone: string;
  age: number;
  role: AccountRole;
}

export const AuthContext = createContext<{ user: AuthUser; updateProfile: (profile: Pick<AuthUser, "name" | "phone" | "pictureUrl">) => Promise<void>; signOut: () => Promise<void>; deleteAccount: (confirmation: string) => Promise<void> } | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthGate.");
  return value;
}
