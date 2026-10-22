import { Suspense, lazy, useEffect } from "react";
import { Navigate, Outlet, Route, BrowserRouter as Router, Routes, useLocation } from "react-router";
import PageLoading from "./components/app/Skeleton";
import { ScrollToTop } from "./components/common/ScrollToTop";
import AppLayout from "./layout/AppLayout";
import { auth, isAdmin, useAuth } from "./lib/session";
import { dataStore } from "./lib/dataStore";
import SignIn from "./pages/AuthPages/SignIn";
import Setup from "./pages/AuthPages/Setup";
import TokenPassword from "./pages/AuthPages/TokenPassword";
import NotFound from "./pages/OtherPage/NotFound";

const Dashboard = lazy(() => import("./pages/app/Dashboard"));
const Lot3D = lazy(() => import("./pages/app/Lot3D"));
const Ledger = lazy(() => import("./pages/app/Ledger"));
const Reports = lazy(() => import("./pages/app/Reports"));
const Summary = lazy(() => import("./pages/app/Summary"));
const Customers = lazy(() => import("./pages/app/Customers"));
const Zones = lazy(() => import("./pages/app/Zones"));
const Savings = lazy(() => import("./pages/app/Savings"));
const Accounts = lazy(() => import("./pages/app/Accounts"));
const FormulaAudit = lazy(() => import("./pages/app/FormulaAudit"));
const AuditLog = lazy(() => import("./pages/app/AuditLog"));
const Users = lazy(() => import("./pages/app/Users"));
const Settings = lazy(() => import("./pages/app/Settings"));
const Profile = lazy(() => import("./pages/app/Profile"));
const Security = lazy(() => import("./pages/app/Security"));

function RequireAuth() {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === "loading") return <PageLoading />;
  if (status === "setup") return <Navigate to="/setup" replace />;
  if (status === "anon" || status === "mfa") {
    const next = loc.pathname + loc.search;
    return <Navigate to={next && next !== "/" ? `/signin?next=${encodeURIComponent(next)}` : "/signin"} replace />;
  }
  return <Outlet />;
}

function RequireAdmin() {
  const { user } = useAuth();
  return isAdmin(user) ? <Outlet /> : <Navigate to="/" replace />;
}

export default function App() {
  const { status } = useAuth();
  useEffect(() => {
    void auth.refresh();
  }, []);
  useEffect(() => {
    if (status === "anon") dataStore.reset();
  }, [status]);

  return (
    <Router>
      <ScrollToTop />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/forgot-password" element={<SignIn initialPane="forgot" />} />
          <Route path="/accept-invite" element={<TokenPassword kind="invite" />} />
          <Route path="/reset-password" element={<SignIn initialPane="reset" />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="/lot" element={<Lot3D />} />
              <Route path="/ledger" element={<Ledger />} />
              <Route path="/ledger/:year" element={<Ledger />} />
              <Route path="/summary" element={<Summary />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/zones" element={<Zones />} />
              <Route path="/savings" element={<Savings />} />
              <Route path="/savings/:year" element={<Savings />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/formula-audit" element={<FormulaAudit />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/security" element={<Security />} />
              <Route element={<RequireAdmin />}>
                <Route path="/audit" element={<AuditLog />} />
                <Route path="/users" element={<Users />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
