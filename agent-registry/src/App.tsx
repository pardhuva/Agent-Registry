import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { DataProvider } from "./context/DataContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Agents } from "./pages/Agents";
import { NewAgent } from "./pages/NewAgent";
import { EditAgent } from "./pages/EditAgent";
import { AgentDetail } from "./pages/AgentDetail";
import { LangfusePage } from "./pages/LangfusePage";
import { LangSmithPage } from "./pages/LangSmithPage";
import { HeliconePage } from "./pages/HeliconePage";
import { OtelPage } from "./pages/OtelPage";
import { DependencyGraph } from "./pages/DependencyGraph";
import { Lifecycle } from "./pages/Lifecycle";
import { Governance } from "./pages/Governance";
import { Discover } from "./pages/Discover";
import { Threats } from "./pages/Threats";
import { ConnectorPage } from "./pages/ConnectorPage";
import { CONNECTOR_ORDER } from "./lib/connectors";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <DataProvider>
              <Layout />
            </DataProvider>
          </ProtectedRoute>
        }
      >
        <Route path="/agents" element={<Agents />} />
        <Route path="/agents/new" element={<NewAgent />} />
        <Route path="/agents/:id" element={<AgentDetail />} />
        <Route path="/agents/:id/edit" element={<EditAgent />} />
        <Route path="/graph" element={<DependencyGraph />} />
        <Route path="/lifecycle" element={<Lifecycle />} />
        <Route path="/governance" element={<Governance />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/threats" element={<Threats />} />
        {CONNECTOR_ORDER.map((p) => (
          <Route key={p} path={`/connectors/${p}`} element={<ConnectorPage platform={p} />} />
        ))}
        <Route path="/langfuse" element={<LangfusePage />} />
        <Route path="/langsmith" element={<LangSmithPage />} />
        <Route path="/helicone" element={<HeliconePage />} />
        <Route path="/otel" element={<OtelPage />} />
        <Route path="/" element={<Navigate to="/agents" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/agents" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
