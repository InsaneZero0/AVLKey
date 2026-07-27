import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { apiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      const { data } = await api.get("/my/favorites/ids");
      setFavoriteIds(data);
    } catch {
      setFavoriteIds([]);
    }
  }, []);

  useEffect(() => {
    if (user) loadFavorites(); else setFavoriteIds([]);
  }, [user, loadFavorites]);

  const toggleFavorite = async (propertyId) => {
    if (!user) return false;
    const isFav = favoriteIds.includes(propertyId);
    setFavoriteIds((prev) => isFav ? prev.filter((x) => x !== propertyId) : [...prev, propertyId]);
    try {
      if (isFav) await api.delete(`/favorites/${propertyId}`);
      else await api.post(`/favorites/${propertyId}`);
    } catch {
      loadFavorites();
    }
    return true;
  };

  useEffect(() => {
    // If returning from Google OAuth callback, let AuthCallback establish session first.
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setUser(data);
    return data;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    setUser(data);
    return data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, refresh, favoriteIds, toggleFavorite }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export { apiError };
