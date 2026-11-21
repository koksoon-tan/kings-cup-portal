import { createHash, randomInt } from "crypto";
import { onCall } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import {
  db, auth, FieldValue, Timestamp, HttpsError, REGION, Actor, audit, requireArea, str,
  getGeneralSettings,
} from "./common";
import type { Transaction } from "firebase-admin/firestore";

/**
 * serialCodes/{sha256(normalisedCode)}
 *   status      generated → sent → redeemed   (or revoked / expired)
 *   emailStatus none | queued | delivered | error   (delivery reported by the Trigger Email extension)
 *
 * One active code per customer. Once redeemed the code can never be used again; the
 * mobile app should then ask the customer to link Google / Apple / email login for
 * future sign-ins (the Firebase user is created with uid "cust_<customerId>").
 */

// No 0/O/1/I/L to avoid mis-reads.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < 3; g++) {
    let s = "";
    for (let i = 0; i < 4; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(s);
  }
  return `KC-${groups.join("-")}`;
}

export function normaliseCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.startsWith("KC") ? raw.slice(2) : raw;
}

export function hashCode(code: string): string {
  return createHash("sha256").update(normaliseCode(code)).digest("hex");
}

const ACTIVE = ["generated", "sent"];

export const DEFAULT_EMAIL = {
  appName: "Kings Cup",
  codeSubject: "Your {{appName}} app access code",
  codeHtml:
    `<p>Hi {{name}},</p>
<p>Thanks for buying {{appName}}! Here is your personal code to unlock the mobile app:</p>
<p style="font-size:22px;font-weight:bold;letter-spacing:2px">{{code}}</p>
<p>Open the app and enter this code to sign in. The code works once and is linked to you – please don't share it.{{expiryLine}}</p>
<p>Cheers,<br/>The {{appName}} team</p>`,
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function render(tpl: string, vars: Record<string, string>, html: boolean) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k] ?? "";
    return html && k !== "expiryLine" ? escapeHtml(v) : v;
  });
}

interface EmailTpl { appName: string; codeSubject: string; codeHtml: string }

async function readEmailTemplate(tx: Transaction): Promise<EmailTpl> {
  const snap = await tx.get(db.collection("settings").doc("email"));
  return { ...DEFAULT_EMAIL, ...(snap.data() ?? {}) } as EmailTpl;
}

function queueCodeEmail(
  tx: Transaction, tpl: EmailTpl, codeId: string, customerId: string,
  to: string, name: string, code: string, expiresAt: Date | null,
) {
  const expiryLine = expiresAt ? ` It expires on ${expiresAt.toISOString().slice(0, 10)}.` : "";
  const vars = { name: name || "there", code, appName: tpl.appName, expiryLine };
  const html = render(tpl.codeHtml, vars, true);
  const mailRef = db.collection("mail").doc();
  // Format understood by the "Trigger Email from Firestore" extension (firebase/firestore-send-email).
  tx.set(mailRef, {
    to,
    message: {
      subject: render(tpl.codeSubject, vars, false),
      html,
      text: html.replace(/<br\s*\/?>/g, "\n").replace(/<\/p>/g, "\n\n").replace(/<[^>]+>/g, "").trim(),
    },
    codeId,
    customerId,
    createdAt: FieldValue.serverTimestamp(),
  });
  return mailRef.id;
}

/**
 * Issues a new code to a customer (and emails it). Throws if the customer already has an
 * active / redeemed code unless `force` is set (used by revoke-and-reissue).
 */
export async function issueCode(
  customerId: string,
  opts: { orderId?: string; actor: Actor | null; sendEmail: boolean; force?: boolean; skipIfHasCode?: boolean },
): Promise<{ codeId: string; code: string } | null> {
  const settings = await getGeneralSettings();
  return db.runTransaction(async (tx) => {
    const custRef = db.collection("customers").doc(customerId);
    const cust = await tx.get(custRef);
    if (!cust.exists) throw new HttpsError("not-found", "Customer not found.");
    const c = cust.data()!;
    const tpl = await readEmailTemplate(tx);

    const hasCode = ["generated", "sent", "redeemed"].includes(c.codeStatus);
    if (hasCode && !opts.force) {
      if (opts.skipIfHasCode) return null;
      throw new HttpsError("already-exists",
        c.codeStatus === "redeemed"
          ? "This customer has already redeemed a code."
          : "This customer already has an active code – resend or revoke it instead.");
    }

    // Generate a code that doesn't collide (astronomically unlikely, but cheap to check).
    let code = newCode();
    let codeRef = db.collection("serialCodes").doc(hashCode(code));
    for (let i = 0; i < 3 && (await tx.get(codeRef)).exists; i++) {
      code = newCode();
      codeRef = db.collection("serialCodes").doc(hashCode(code));
    }

    const expiresAt = settings.codeExpiryDays > 0
      ? new Date(Date.now() + settings.codeExpiryDays * 86400_000)
      : null;
    const email = (c.email as string) || "";
    const send = opts.sendEmail && !!email;

    let mailId: string | null = null;
    if (send) mailId = queueCodeEmail(tx, tpl, codeRef.id, customerId, email, c.name ?? "", code, expiresAt);

    tx.set(codeRef, {
      code,
      last4: code.slice(-4),
      customerId,
      customerName: c.name ?? "",
      customerEmail: email,
      source: c.source ?? null,
      orderId: opts.orderId ?? null,
      status: send ? "sent" : "generated",
      emailStatus: send ? "queued" : "none",
      mailId,
      sendCount: send ? 1 : 0,
      generatedAt: FieldValue.serverTimestamp(),
      generatedBy: opts.actor ? { uid: opts.actor.uid, email: opts.actor.email } : { uid: "system", email: "system" },
      sentAt: send ? FieldValue.serverTimestamp() : null,
      lastSentAt: send ? FieldValue.serverTimestamp() : null,
      deliveredAt: null,
      redeemedAt: null,
      redeemedUid: null,
      redeemedDevice: null,
      revokedAt: null,
      revokedReason: null,
      expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null,
    });
    tx.update(custRef, {
      currentCodeId: codeRef.id,
      codeLast4: code.slice(-4),
      codeStatus: send ? "sent" : "generated",
      updatedAt: FieldValue.serverTimestamp(),
    });
    audit(opts.actor, "code.issue", "serialCodes", codeRef.id,
      { customerId, orderId: opts.orderId ?? null, emailed: send }, tx);
    return { codeId: codeRef.id, code };
  });
}

// ---------------------------------------------------------------------------
// Admin callables
// ---------------------------------------------------------------------------

/** issueSerialCode({ customerId, orderId?, sendEmail = true }) */
export const issueSerialCode = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "codes");
  const customerId = str(req.data?.customerId, "customerId", { required: true });
  const orderId = str(req.data?.orderId, "orderId") || undefined;
  const res = await issueCode(customerId, { orderId, actor, sendEmail: req.data?.sendEmail !== false });
  return { codeId: res!.codeId };
});

/** resendSerialCode({ codeId, email? }) – resends (optionally correcting the customer's email first). */
export const resendSerialCode = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "codes");
  const codeId = str(req.data?.codeId, "codeId", { required: true });
  await db.runTransaction(async (tx) => {
    const ref = db.collection("serialCodes").doc(codeId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Code not found.");
    const c = snap.data()!;
    if (!ACTIVE.includes(c.status)) throw new HttpsError("failed-precondition", `Code is ${c.status}; it can't be resent.`);
    const custRef = db.collection("customers").doc(c.customerId);
    const cust = await tx.get(custRef);
    const tpl = await readEmailTemplate(tx);
    const email = (cust.data()?.email as string) || "";
    if (!email) throw new HttpsError("failed-precondition", "Customer has no email address.");
    const expires = c.expiresAt ? (c.expiresAt as Timestamp).toDate() : null;
    const mailId = queueCodeEmail(tx, tpl, codeId, c.customerId, email, cust.data()?.name ?? "", c.code, expires);
    tx.update(ref, {
      status: "sent", emailStatus: "queued", mailId, customerEmail: email,
      sendCount: FieldValue.increment(1),
      sentAt: c.sentAt ?? FieldValue.serverTimestamp(),
      lastSentAt: FieldValue.serverTimestamp(),
    });
    tx.update(custRef, { codeStatus: "sent", updatedAt: FieldValue.serverTimestamp() });
    audit(actor, "code.resend", "serialCodes", codeId, { to: email }, tx);
  });
  return { ok: true };
});

/** revokeSerialCode({ codeId, reason, reissue = false }) */
export const revokeSerialCode = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "codes");
  const codeId = str(req.data?.codeId, "codeId", { required: true });
  const reason = str(req.data?.reason, "reason", { required: true, max: 300 });
  let customerId = "";
  await db.runTransaction(async (tx) => {
    const ref = db.collection("serialCodes").doc(codeId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Code not found.");
    const c = snap.data()!;
    if (!ACTIVE.includes(c.status)) throw new HttpsError("failed-precondition", `Code is already ${c.status}.`);
    customerId = c.customerId;
    tx.update(ref, { status: "revoked", revokedAt: FieldValue.serverTimestamp(), revokedReason: reason });
    tx.update(db.collection("customers").doc(customerId), {
      codeStatus: "revoked", updatedAt: FieldValue.serverTimestamp(),
    });
    audit(actor, "code.revoke", "serialCodes", codeId, { reason }, tx);
  });
  let newCodeId: string | null = null;
  if (req.data?.reissue) {
    const res = await issueCode(customerId, { actor, sendEmail: true, force: true });
    newCodeId = res!.codeId;
  }
  return { ok: true, newCodeId };
});

// ---------------------------------------------------------------------------
// Mobile app: redeem a code → Firebase custom token
// ---------------------------------------------------------------------------

const MAX_FAILS_PER_HOUR = 10;

async function rateLimit(ip: string, failed: boolean) {
  const ref = db.collection("rateLimits").doc(createHash("sha256").update(ip).digest("hex"));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    let { count = 0, windowStart = now } = (snap.data() ?? {}) as { count?: number; windowStart?: number };
    if (now - windowStart > 3600_000) { count = 0; windowStart = now; }
    if (!failed) return count;
    count += 1;
    tx.set(ref, { count, windowStart });
    return count;
  });
}

/**
 * redeemSerialCode({ code, device? }) → { token, customerId }
 * Called by the mobile app. Sign in with `signInWithCustomToken(token)`.
 * Turn on enforceAppCheck once the app has App Check configured.
 */
export const redeemSerialCode = onCall({ region: REGION, enforceAppCheck: false }, async (req) => {
  const ip = req.rawRequest.ip ?? "unknown";
  if ((await rateLimit(ip, false)) >= MAX_FAILS_PER_HOUR) {
    throw new HttpsError("resource-exhausted", "Too many attempts. Try again later.");
  }
  const code = str(req.data?.code, "code", { required: true, max: 40 });
  const device = str(req.data?.device, "device", { max: 200 });
  const ref = db.collection("serialCodes").doc(hashCode(code));

  const fail = async (msg: string) => {
    await rateLimit(ip, true);
    throw new HttpsError("not-found", msg);
  };

  const pre = await ref.get();
  if (!pre.exists) return fail("Invalid code.");
  const c = pre.data()!;
  if (c.status === "redeemed") return fail("This code has already been used.");
  if (!ACTIVE.includes(c.status)) return fail("This code is no longer valid.");
  if (c.expiresAt && (c.expiresAt as Timestamp).toMillis() < Date.now()) return fail("This code has expired.");

  // Create (or reuse) the customer's Firebase Auth account before committing the redemption.
  const uid = `cust_${c.customerId}`;
  try {
    await auth.getUser(uid);
  } catch {
    await auth.createUser({ uid, displayName: c.customerName || undefined });
  }
  await auth.setCustomUserClaims(uid, { customerId: c.customerId });
  const token = await auth.createCustomToken(uid, { customerId: c.customerId });

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!ACTIVE.includes(snap.data()?.status)) throw new HttpsError("not-found", "This code is no longer valid.");
    tx.update(ref, {
      status: "redeemed", redeemedAt: FieldValue.serverTimestamp(), redeemedUid: uid, redeemedDevice: device || null,
    });
    tx.update(db.collection("customers").doc(c.customerId), {
      codeStatus: "redeemed", appUid: uid, redeemedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    audit(null, "code.redeem", "serialCodes", ref.id, { uid, device }, tx);
  });
  return { token, customerId: c.customerId };
});

// ---------------------------------------------------------------------------
// Background jobs
// ---------------------------------------------------------------------------

/** Mirrors email delivery status reported by the Trigger Email extension onto the code. */
export const onCodeMailUpdated = onDocumentUpdated({ document: "mail/{mailId}", region: REGION }, async (event) => {
  const after = event.data?.after.data();
  const before = event.data?.before.data();
  if (!after?.codeId) return;
  const state = after.delivery?.state;
  if (!state || state === before?.delivery?.state) return;
  const ref = db.collection("serialCodes").doc(after.codeId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.mailId !== event.params.mailId) return; // superseded by a resend
  if (state === "SUCCESS") {
    await ref.update({ emailStatus: "delivered", deliveredAt: FieldValue.serverTimestamp(), emailError: null });
  } else if (state === "ERROR") {
    await ref.update({ emailStatus: "error", emailError: String(after.delivery?.error ?? "Unknown error") });
  }
});

/** Daily: mark unredeemed codes past their expiry as expired. */
export const expireSerialCodes = onSchedule({ schedule: "every day 03:00", timeZone: "Asia/Kuala_Lumpur", region: REGION }, async () => {
  const snap = await db.collection("serialCodes")
    .where("status", "in", ACTIVE)
    .where("expiresAt", "<=", Timestamp.now())
    .limit(500)
    .get();
  const batch = db.batch();
  snap.docs.forEach((d) => {
    batch.update(d.ref, { status: "expired" });
    batch.update(db.collection("customers").doc(d.data().customerId), { codeStatus: "expired" });
  });
  await batch.commit();
  logger.info(`Expired ${snap.size} codes`);
});
