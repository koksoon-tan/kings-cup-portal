import { Badge, Group, Title, Text, Stack, Paper, Center, Loader } from "@mantine/core";
import { ReactNode } from "react";
import { STATUS_COLORS, label } from "../lib/format";

export function StatusBadge({ status, size = "sm" }: { status?: string | null; size?: "xs" | "sm" | "md" }) {
  return <Badge size={size} variant="light" color={STATUS_COLORS[status ?? ""] ?? "gray"}>{label(status)}</Badge>;
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-start" mb="lg" wrap="wrap" gap="sm">
      <Stack gap={2}>
        <Title order={2}>{title}</Title>
        {subtitle && <Text c="dimmed" size="sm">{subtitle}</Text>}
      </Stack>
      {actions && <Group gap="xs">{actions}</Group>}
    </Group>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <Paper withBorder p="xl"><Text c="dimmed" ta="center">{children}</Text></Paper>;
}

export function Loading() {
  return <Center p="xl"><Loader /></Center>;
}

export function Field({ label: l, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{l}</Text>
      <Text size="sm" component="div">{children || "—"}</Text>
    </Stack>
  );
}
