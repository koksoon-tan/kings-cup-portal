/**
 * Creates (or promotes) the first superadmin.
 *
 *   Real project:  gcloud auth application-default login
 *                  node scripts/bootstrap-superadmin.js you@company.com 'a-strong-password' your-project-id
 *   Emulators:     FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *                  node scripts/bootstrap-superadmin.js admin@example.com 'password123!' demo-kingscup
 */
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

async function main() {
  const [email, password, projectId] = process.argv.slice(2);
  if (!email || !projectId) {
    console.error("Usage: node scripts/bootstrap-superadmin.js <email> <password> <projectId>");
    process.exit(1);
  }
  initializeApp({ projectId });
  const auth = getAuth();
  let user;
  try {
    user = await auth.getUserByEmail(email);
    console.log(`Found existing user ${user.uid}`);
  } catch {
    if (!password || password.length < 10) throw new Error("Password must be at least 10 characters.");
    user = await auth.createUser({ email, password });
    console.log(`Created user ${user.uid}`);
  }
  await auth.setCustomUserClaims(user.uid, { role: "superadmin" });
  await getFirestore().collection("staff").doc(user.uid).set({
    email, displayName: user.displayName ?? "", role: "superadmin", disabled: false, createdAt: FieldValue.serverTimestamp(), createdBy: "bootstrap",
  }, { merge: true });
  console.log(`${email} is now a superadmin. Sign out and back in if you were already signed in.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
