// Production build: demo mode compiled out (vite aliases "@demo" here unless --mode demo).
import type { ReactNode } from "react";
export const IS_DEMO = false;
export const DemoGate = ({ children }: { children: ReactNode }) => <>{children}</>;
export const DemoBanner = () => null;
export const DemoLoginHelp = (_p: { onPick: (email: string, password: string) => void }) => null;
export const DemoInboxPage = () => null;
