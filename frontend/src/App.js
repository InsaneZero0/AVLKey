import "@/App.css";
import React from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

import Landing from "@/pages/Landing";
import Explore from "@/pages/Explore";
import PropertyDetail from "@/pages/PropertyDetail";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AuthCallback from "@/pages/AuthCallback";
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
      <Route path="/pago/exito" element={<PaymentSuccess />} />
      <Route path="/pago/cancelado" element={<PaymentCancel />} />
      <Route path="/panel" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<Overview />} />
        <Route path="inmuebles" element={<MyProperties />} />
        <Route path="publicar" element={<PropertyForm />} />
        <Route path="recibidas" element={<Applications />} />
        <Route path="solicitudes" element={<MyApplications />} />
        <Route path="contratos" element={<Contracts />} />
        <Route path="pagos" element={<Payments />} />
        <Route path="perfil" element={<Profile />} />
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
