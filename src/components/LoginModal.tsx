import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useAuthUI } from "@/lib/authStore";
import { lovable } from "@/integrations/lovable";

export function LoginModal() {
  const { loginOpen, closeLogin } = useAuthUI();

  const google = async () => {
    try {
      const res = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (res.error) {
        toast.error("No se pudo iniciar sesión con Google");
        return;
      }
      if (!res.redirected) {
        toast.success("Sesión iniciada");
        closeLogin();
      }
    } catch {
      toast.error("Error al iniciar sesión");
    }
  };

  return (
    <AnimatePresence>
      {loginOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/10 backdrop-blur-sm px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeLogin}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm bg-white/70 backdrop-blur-3xl border border-white/80 rounded-3xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.12)]"
          >
            <button
              onClick={closeLogin}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-[#636366] hover:bg-black/5 transition"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center">
              <div className="text-xl font-bold tracking-tighter text-[#1D1D1F]">Futibet</div>
              <h2 className="mt-4 text-lg font-semibold text-[#1D1D1F] tracking-tight">
                Bienvenido de nuevo
              </h2>
              <p className="mt-1 text-sm text-[#636366]">
                Continúa para desbloquear tu portfolio y analíticas.
              </p>
            </div>
            <div className="mt-6 space-y-3">
              <button
                onClick={google}
                className="w-full h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 text-[#1D1D1F] text-sm font-medium flex items-center justify-center gap-3 hover:bg-white transition-all active:scale-95 shadow-sm"
              >
                <GoogleIcon />
                Continuar con Google
              </button>
              <button
                onClick={() => toast("Próximamente disponible")}
                className="w-full h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 text-[#1D1D1F] text-sm font-medium flex items-center justify-center gap-3 hover:bg-white transition-all active:scale-95 shadow-sm"
              >
                <GithubIcon />
                Continuar con GitHub
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#1D1D1F">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.1c-3.2.7-3.87-1.36-3.87-1.36-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.76.4-1.27.73-1.56-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.28 1.19-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.06 11.06 0 015.79 0c2.2-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.4-2.7 5.36-5.27 5.65.41.35.78 1.05.78 2.11v3.13c0 .31.21.68.8.56C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/>
    </svg>
  );
}