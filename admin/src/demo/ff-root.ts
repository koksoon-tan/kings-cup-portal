export const logger = {
  info: (...a: unknown[]) => console.info("[functions]", ...a),
  warn: (...a: unknown[]) => console.warn("[functions]", ...a),
  error: (...a: unknown[]) => console.error("[functions]", ...a),
  log: (...a: unknown[]) => console.log("[functions]", ...a),
};
