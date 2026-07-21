import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="admin-loading">
        <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.account_type !== "internal") return <Navigate to="/panel" replace />;
  return children;
}
