import "@/App.css";
import React from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";

import Landing from "@/pages/Landing";
import Explore from "@/pages/Explore";
import PropertyDetail from "@/pages/PropertyDetail";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AuthCallback from "@/pages/AuthCallback";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";

import DashboardLayout from "@/pages/dashboard/DashboardLayout";
import Overview from "@/pages/dashboard/Overview";
import MyProperties from "@/pages/dashboard/MyProperties";
import PropertyForm from "@/pages/dashboard/PropertyForm";
import Applications from "@/pages/dashboard/Applications";
import MyApplications from "@/pages/dashboard/MyApplications";
import Contracts from "@/pages/dashboard/Contracts";
import Payments from "@/pages/dashboard/Payments";
import Profile from "@/pages/dashboard/Profile";
import Verification from "@/pages/dashboard/Verification";
import Visits from "@/pages/dashboard/Visits";
import Favorites from "@/pages/dashboard/Favorites";

import AdminLayout from "@/pages/admin/AdminLayout";
import AdminOverview from "@/pages/admin/AdminOverview";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminMembers from "@/pages/admin/AdminMembers";
import AdminMemberDetail from "@/pages/admin/AdminMemberDetail";
import AdminProperties from "@/pages/admin/AdminProperties";
import AdminApplications from "@/pages/admin/AdminApplications";
import AdminContracts from "@/pages/admin/AdminContracts";
import AdminPayments from "@/pages/admin/AdminPayments";
import AdminFinance from "@/pages/admin/AdminFinance";
import AdminStatement from "@/pages/admin/AdminStatement";
import AdminDocuments from "@/pages/admin/AdminDocuments";
import AdminVerification from "@/pages/admin/AdminVerification";
import AdminAudit from "@/pages/admin/AdminAudit";

function AppRoutes() {
  const location = useLocation();
  // Handle Google OAuth callback (session_id in URL fragment) before anything else.
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/explorar" element={<Explore />} />
      <Route path="/inmueble/:id" element={<PropertyDetail />} />
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Register />} />
      <Route path="/recuperar" element={<ForgotPassword />} />
      <Route path="/restablecer" element={<ResetPassword />} />
      <Route path="/pago/exito" element={<PaymentSuccess />} />
      <Route path="/pago/cancelado" element={<PaymentCancel />} />
      <Route path="/panel" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<Overview />} />
        <Route path="inmuebles" element={<MyProperties />} />
        <Route path="publicar" element={<PropertyForm />} />
        <Route path="publicar/:id" element={<PropertyForm />} />
        <Route path="recibidas" element={<Applications />} />
        <Route path="solicitudes" element={<MyApplications />} />
        <Route path="contratos" element={<Contracts />} />
        <Route path="pagos" element={<Payments />} />
        <Route path="visitas" element={<Visits />} />
        <Route path="favoritos" element={<Favorites />} />
        <Route path="verificacion" element={<Verification />} />
        <Route path="perfil" element={<Profile />} />
      </Route>
      <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route index element={<AdminOverview />} />
        <Route path="usuarios" element={<AdminUsers />} />
        <Route path="arrendadores" element={<AdminMembers role="arrendador" />} />
        <Route path="arrendatarios" element={<AdminMembers role="arrendatario" />} />
        <Route path="miembro/:userId" element={<AdminMemberDetail />} />
        <Route path="propiedades" element={<AdminProperties />} />
        <Route path="solicitudes" element={<AdminApplications />} />
        <Route path="contratos" element={<AdminContracts />} />
        <Route path="pagos" element={<AdminPayments />} />
        <Route path="finanzas" element={<AdminFinance />} />
        <Route path="estado-cuenta/:userId" element={<AdminStatement />} />
        <Route path="documentos" element={<AdminDocuments />} />
        <Route path="verificacion" element={<AdminVerification />} />
        <Route path="auditoria" element={<AdminAudit />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
