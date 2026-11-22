import { registerStorageTrigger } from "./core";
export function onObjectFinalized(optsOrHandler: any, maybeHandler?: any) {
  const h = typeof optsOrHandler === "function" ? optsOrHandler : maybeHandler;
  registerStorageTrigger(h);
  return h;
}
