import { useState } from "react";
import { Center, Paper, Stack, Title, TextInput, PasswordInput, Button, Text, Anchor } from "@mantine/core";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../lib/firebase";
import { toastError, toastOk } from "../lib/call";
import { DemoLoginHelp } from "@demo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch { toastError({ message: "Wrong email or password." }); }
    finally { setBusy(false); }
  };

  const reset = async () => {
    if (!email) return toastError({ message: "Enter your email first." });
    try { await sendPasswordResetEmail(auth, email.trim()); toastOk("Password reset email sent."); }
    catch (e) { toastError(e); }
  };

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={380}>
        <form onSubmit={submit}>
          <Stack>
            <Title order={2}>👑 Kings Cup Admin</Title>
            <Text size="sm" c="dimmed">Staff sign in</Text>
            <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required autoComplete="username" />
            <PasswordInput label="Password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} required autoComplete="current-password" />
            <Button type="submit" loading={busy}>Sign in</Button>
            <Anchor size="sm" component="button" type="button" onClick={reset}>Forgot password?</Anchor>
            <DemoLoginHelp onPick={(e, p) => { setEmail(e); setPassword(p); }} />
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
