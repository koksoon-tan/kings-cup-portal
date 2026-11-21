import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

/** Appends an audit-log entry for a direct (non-function) edit. Never throws. */
export async function logAudit(action: string, entity: string, entityId: string, details: Record<string, unknown> = {}) {
  const u = auth.currentUser;
  if (!u) return;
  try {
    await addDoc(collection(db, "auditLogs"), {
      action, entity, entityId, details, by: { uid: u.uid, email: u.email ?? "" }, at: serverTimestamp(),
    });
  } catch (e) {
    console.warn("audit failed", e);
  }
}
