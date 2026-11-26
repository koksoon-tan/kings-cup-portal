import { AppShell, Burger, Group, NavLink, Text, Button, Badge, ScrollArea, Center, Paper, Title, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Routes, Route, NavLink as RouterLink, useLocation, Navigate } from "react-router";
import { signOut } from "firebase/auth";
import {
  IconLayoutDashboard, IconCards, IconPackage, IconShoppingCart, IconUsers, IconKey, IconBuilding,
  IconSettings, IconUserShield, IconMessage2, IconHistory, IconLogout, IconMail,
} from "@tabler/icons-react";
import { auth } from "./lib/firebase";
import { useAuth } from "./lib/auth";
import { Area, canAccess } from "./lib/roles";
import { Loading } from "./components/ui";
import { IS_DEMO, DemoBanner, DemoInboxPage } from "@demo";
import LoginPage from "./pages/Login";
import HomePage from "./pages/Home";
import ActionsPage from "./pages/Actions";
import DecksPage from "./pages/Decks";
import DeckEditorPage from "./pages/DeckEditor";
import InventoryPage from "./pages/Inventory";
import InventoryDetailPage from "./pages/InventoryDetail";
import OrdersPage from "./pages/Orders";
import OrderDetailPage from "./pages/OrderDetail";
import ImportOrdersPage from "./pages/ImportOrders";
import CustomersPage from "./pages/Customers";
import CustomerDetailPage from "./pages/CustomerDetail";
import CodesPage from "./pages/Codes";
import CorporatesPage from "./pages/Corporates";
import CorporateDetailPage from "./pages/CorporateDetail";
import CorporateOrderPage from "./pages/CorporateOrder";
import InvoicePage from "./pages/Invoice";
import SettingsPage from "./pages/Settings";
import StaffPage from "./pages/Staff";
import AuditPage from "./pages/Audit";

const NAV: { to: string; label: string; icon: typeof IconCards; area: Area | null }[] = [
  { to: "/", label: "Dashboard", icon: IconLayoutDashboard, area: null },
  { to: "/actions", label: "Action text", icon: IconMessage2, area: "decks" },
  { to: "/decks", label: "Deck designs", icon: IconCards, area: "decks" },
  { to: "/inventory", label: "Inventory", icon: IconPackage, area: "inventory" },
  { to: "/orders", label: "Orders", icon: IconShoppingCart, area: "orders" },
  { to: "/customers", label: "Customers", icon: IconUsers, area: "customers" },
  { to: "/codes", label: "Serial codes", icon: IconKey, area: "codes" },
  { to: "/corporates", label: "Corporate", icon: IconBuilding, area: "corporates" },
  { to: "/settings", label: "Settings", icon: IconSettings, area: "settings" },
  { to: "/staff", label: "Staff", icon: IconUserShield, area: "staff" },
  { to: "/audit", label: "Audit log", icon: IconHistory, area: "settings" },
  ...(IS_DEMO ? [{ to: "/demo-inbox", label: "Demo inbox", icon: IconMail, area: null }] : []),
];

function Guard({ area, children }: { area: Area; children: React.ReactNode }) {
  const { role } = useAuth();
  if (!canAccess(role, area)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, role, loading } = useAuth();
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!user) return <LoginPage />;
  if (!role) {
    return (
      <Center h="100vh" p="md">
        <Paper withBorder p="xl" maw={420}>
          <Stack>
            <Title order={3}>No access yet</Title>
            <Text size="sm">You're signed in as <b>{user.email}</b>, but this account has no staff role. Ask a superadmin to add you.</Text>
            <Button variant="light" onClick={() => signOut(auth)}>Sign out</Button>
          </Stack>
        </Paper>
      </Center>
    );
  }

  return (
    <AppShell header={{ height: IS_DEMO ? 86 : 56 }} navbar={{ width: 230, breakpoint: "sm", collapsed: { mobile: !opened } }} padding="md">
      <AppShell.Header>
        {IS_DEMO && <DemoBanner />}
        <Group h={56} px="md" justify="space-between">
          <Group gap="xs">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={800} size="lg">👑 Kings Cup <Text span c="dimmed" fw={500}>Admin</Text></Text>
          </Group>
          <Group gap="xs">
            <Text size="sm" visibleFrom="sm">{user.email}</Text>
            <Badge variant="light">{role}</Badge>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <AppShell.Section grow component={ScrollArea}>
          {NAV.filter((n) => !n.area || canAccess(role, n.area)).map((n) => (
            <NavLink
              key={n.to}
              component={RouterLink}
              to={n.to}
              label={n.label}
              leftSection={<n.icon size={18} stroke={1.6} />}
              active={n.to === "/" ? location.pathname === "/" : location.pathname.startsWith(n.to)}
              onClick={close}
            />
          ))}
        </AppShell.Section>
        <AppShell.Section>
          <NavLink label="Sign out" leftSection={<IconLogout size={18} />} onClick={() => signOut(auth)} />
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/actions" element={<Guard area="decks"><ActionsPage /></Guard>} />
          <Route path="/decks" element={<Guard area="decks"><DecksPage /></Guard>} />
          <Route path="/decks/:id" element={<Guard area="decks"><DeckEditorPage /></Guard>} />
          <Route path="/inventory" element={<Guard area="inventory"><InventoryPage /></Guard>} />
          <Route path="/inventory/:sku" element={<Guard area="inventory"><InventoryDetailPage /></Guard>} />
          <Route path="/orders" element={<Guard area="orders"><OrdersPage /></Guard>} />
          <Route path="/orders/import" element={<Guard area="orders"><ImportOrdersPage /></Guard>} />
          <Route path="/orders/:id" element={<Guard area="orders"><OrderDetailPage /></Guard>} />
          <Route path="/customers" element={<Guard area="customers"><CustomersPage /></Guard>} />
          <Route path="/customers/:id" element={<Guard area="customers"><CustomerDetailPage /></Guard>} />
          <Route path="/codes" element={<Guard area="codes"><CodesPage /></Guard>} />
          <Route path="/corporates" element={<Guard area="corporates"><CorporatesPage /></Guard>} />
          <Route path="/corporates/:id" element={<Guard area="corporates"><CorporateDetailPage /></Guard>} />
          <Route path="/corporate-orders/:id" element={<Guard area="corporates"><CorporateOrderPage /></Guard>} />
          <Route path="/invoices/:id" element={<Guard area="invoices"><InvoicePage /></Guard>} />
          <Route path="/settings" element={<Guard area="settings"><SettingsPage /></Guard>} />
          <Route path="/staff" element={<Guard area="staff"><StaffPage /></Guard>} />
          <Route path="/audit" element={<Guard area="settings"><AuditPage /></Guard>} />
          {IS_DEMO && <Route path="/demo-inbox" element={<DemoInboxPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}
