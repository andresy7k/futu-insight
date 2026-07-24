import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useAuthUI } from "@/lib/authStore";

export function AuthGateModal() {
  const openLogin = useAuthUI((s) => s.openLogin);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/10 backdrop-blur-sm px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm bg-white/70 backdrop-blur-3xl border border-white/80 rounded-3xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.12)] text-center"
      >
        <div className="w-12 h-12 mx-auto rounded-2xl bg-[#007AFF]/10 flex items-center justify-center">
          <Lock className="w-5 h-5 text-[#007AFF]" />
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-tight text-[#1D1D1F]">
          Acceso exclusivo
        </h2>
        <p className="mt-2 text-sm text-[#636366]">
          Inicia sesión para ver tu portfolio y analíticas personalizadas.
        </p>
        <button
          onClick={openLogin}
          className="mt-6 w-full h-11 rounded-full bg-[#007AFF] text-white text-sm font-medium hover:bg-[#0071e3] transition active:scale-95 shadow-[0_4px_16px_rgba(0,122,255,0.35)]"
        >
          Iniciar sesión
        </button>
      </motion.div>
    </div>
  );
}