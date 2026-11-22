import { registerDocTrigger } from "./core";
export function onDocumentUpdated(opts: any, handler: (e: any) => any) {
  registerDocTrigger(typeof opts === "string" ? opts : opts.document, "updated", handler);
  return handler;
}
