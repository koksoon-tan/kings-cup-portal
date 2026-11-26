// Production build: demo mode compiled out (vite aliases "@demo" to DemoGate.tsx only with --mode demo).
import type { ReactNode } from "react";
export const IS_DEMO = false;
export const DemoGate = ({ children }: { children: ReactNode }) => <>{children}</>;
export const DemoBadge = () => null;
export const DemoCodeHint = (_p: { onUse: (code: string) => void }) => null;
export const DemoMailPreview = (_p: { email: string; onUse: (code: string) => void }) => null;
