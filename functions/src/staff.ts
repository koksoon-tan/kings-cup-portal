import { onCall } from "firebase-functions/v2/https";
import { db, auth, FieldValue, HttpsError, REGION, ROLES, Role, audit, requireArea, str, normEmail } from "./common";

/** createStaff({ email, displayName, role, password }) – superadmin only. */
export const createStaff = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "staff");
  const email = normEmail(req.data?.email);
  if (!email) throw new HttpsError("invalid-argument", "email is required.");
  const displayName = str(req.data?.displayName, "displayName", { max: 100 });
  const role = str(req.data?.role, "role", { required: true }) as Role;
  if (!ROLES.includes(role)) throw new HttpsError("invalid-argument", "Unknown role.");
  const password = str(req.data?.password, "password", { required: true });
  if (password.length < 10) throw new HttpsError("invalid-argument", "Password must be at least 10 characters.");

  let user;
  try {
    user = await auth.createUser({ email, password, displayName: displayName || undefined });
  } catch (e: any) {
    if (e?.code === "auth/email-already-exists") throw new HttpsError("already-exists", "A user with this email exists. Change their role instead.");
    throw e;
  }
  await auth.setCustomUserClaims(user.uid, { role });
  await db.collection("staff").doc(user.uid).set({
    email, displayName, role, disabled: false, createdAt: FieldValue.serverTimestamp(), createdBy: actor.email,
  });
  await audit(actor, "staff.create", "staff", user.uid, { email, role });
  return { uid: user.uid };
});

/** setStaffRole({ uid, role | null }) – null removes access and disables the account. */
export const setStaffRole = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "staff");
  const uid = str(req.data?.uid, "uid", { required: true });
  const role = (req.data?.role ?? null) as Role | null;
  if (role !== null && !ROLES.includes(role)) throw new HttpsError("invalid-argument", "Unknown role.");
  if (uid === actor.uid && role !== "superadmin") throw new HttpsError("failed-precondition", "You can't remove your own superadmin access.");
  await auth.setCustomUserClaims(uid, role ? { role } : {});
  await auth.updateUser(uid, { disabled: role === null });
  await auth.revokeRefreshTokens(uid);
  await db.collection("staff").doc(uid).set({ role, disabled: role === null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(actor, "staff.role", "staff", uid, { role });
  return { ok: true };
});
