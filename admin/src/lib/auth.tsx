import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onIdTokenChanged, User } from "firebase/auth";
import { auth } from "./firebase";
import { Role, ROLES } from "./roles";

interface AuthState { user: User | null; role: Role | null; loading: boolean }
const Ctx = createContext<AuthState>({ user: null, role: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, role: null, loading: true });
  useEffect(() => onIdTokenChanged(auth, async (user) => {
    if (!user) return setState({ user: null, role: null, loading: false });
    const token = await user.getIdTokenResult();
    const role = ROLES.includes(token.claims.role as Role) ? (token.claims.role as Role) : null;
    setState({ user, role, loading: false });
  }), []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
