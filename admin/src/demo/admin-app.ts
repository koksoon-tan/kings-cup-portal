let apps: unknown[] = [];
export const initializeApp = (..._a: unknown[]) => { const a = { name: "demo-admin" }; apps.push(a); return a; };
export const getApps = () => apps;
