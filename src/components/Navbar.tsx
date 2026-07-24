import { Link, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { LogOut, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/useSession";
import { useAuthUI } from "@/lib/authStore";
import { toast } from "sonner";

const links = [
  { to: "/", label: "Inicio" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/analytics", label: "Analytics" },
];

export function Navbar() {
  const { pathname } = useLocation();
  const { user } = useSession();
  const openLogin = useAuthUI((s) => s.openLogin);
  const [menuOpen, setMenuOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
    toast.success("Sesión cerrada");
  };

  const initial = (user?.email || "?").charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-50 bg-white/60 backdrop-blur-3xl border-b border-white/60 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link
          to="/"
          className="text-lg font-bold tracking-tighter text-[#1D1D1F] hover:opacity-80 transition"
        >
          Futibet
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => {
            const active = pathname === l.to;
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`relative px-4 py-2 text-sm font-medium transition-colors ${
                  active ? "text-[#007AFF]" : "text-[#636366] hover:text-[#1D1D1F]"
                }`}
              >
                {l.label}
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute left-3 right-3 -bottom-0.5 h-0.5 bg-[#007AFF] rounded-full"
                  />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="w-9 h-9 rounded-full bg-[#007AFF]/15 backdrop-blur-md border border-white/70 text-[#007AFF] font-semibold text-sm flex items-center justify-center hover:scale-105 active:scale-95 transition"
              >
                {initial}
              </button>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="absolute right-0 mt-2 w-56 bg-white/80 backdrop-blur-3xl border border-white/80 rounded-2xl p-2 shadow-[0_12px_40px_rgba(0,0,0,0.10)]"
                >
                  <div className="px-3 py-2 text-xs text-[#636366] truncate">{user.email}</div>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1D1D1F] hover:bg-black/5 rounded-xl transition">
                    <UserIcon className="w-4 h-4" /> Perfil
                  </button>
                  <button
                    onClick={signOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF3B30] hover:bg-[#FF3B30]/10 rounded-xl transition"
                  >
                    <LogOut className="w-4 h-4" /> Cerrar sesión
                  </button>
                </motion.div>
              )}
            </div>
          ) : (
            <button
              onClick={openLogin}
              className="h-9 px-5 rounded-full bg-[#007AFF] text-white text-sm font-medium hover:bg-[#0071e3] active:scale-95 transition shadow-[0_4px_12px_rgba(0,122,255,0.30)]"
            >
              Entrar
            </button>
          )}
        </div>
      </div>
    </header>
  );
}