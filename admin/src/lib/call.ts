import { httpsCallable } from "firebase/functions";
import { notifications } from "@mantine/notifications";
import { functions } from "./firebase";

/** Calls a Cloud Function; shows an error toast and rethrows on failure. */
export async function call<T = any>(name: string, data: unknown, success?: string): Promise<T> {
  try {
    const res = await httpsCallable(functions, name, { timeout: 540_000 })(data);
    if (success) notifications.show({ color: "green", message: success });
    return res.data as T;
  } catch (e: any) {
    notifications.show({ color: "red", title: "Something went wrong", message: e?.message ?? String(e), autoClose: 8000 });
    throw e;
  }
}

export function toastError(e: any) {
  notifications.show({ color: "red", title: "Something went wrong", message: e?.message ?? String(e), autoClose: 8000 });
}

export function toastOk(message: string) {
  notifications.show({ color: "green", message });
}
