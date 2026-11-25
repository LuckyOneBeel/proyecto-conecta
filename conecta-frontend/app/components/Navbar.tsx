"use client";

import { Suspense, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

interface UsuarioSesion {
  id: number;
  nombre: string;
  email: string;
  rol: "estudiante" | "tutor" | "admin";
}

const suscribirSesion = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("conecta-auth", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("conecta-auth", callback);
  };
};

const leerSesionCliente = () => localStorage.getItem("usuario");
const leerSesionServidor = () => null;

function ContenidoNavbar() {
  const pathname = usePathname();
  const router = useRouter();

  const usuarioRaw = useSyncExternalStore(
    suscribirSesion,
    leerSesionCliente,
    leerSesionServidor
  );

  const usuario = useMemo<UsuarioSesion | null>(() => {
    if (!usuarioRaw) return null;
    try {
      return JSON.parse(usuarioRaw) as UsuarioSesion;
    } catch {
      return null;
    }
  }, [usuarioRaw]);

  // Ocultar barra en el Aula Virtual para mantener la vista de videollamada a pantalla completa
  if (pathname?.startsWith("/aula/")) {
    return null;
  }

  const cerrarSesion = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    window.dispatchEvent(new Event("conecta-auth"));
    router.push("/login");
  };

  const claseEnlace = (ruta: string) =>
    `px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
      pathname === ruta
        ? "bg-blue-50 text-blue-700"
        : "text-gray-700 hover:text-blue-700 hover:bg-gray-100"
    }`;

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        {/* Marca */}
        <Link
          href="/"
          className="text-2xl font-extrabold tracking-tight text-blue-700 hover:text-blue-800 transition-colors"
        >
          CONECTA
        </Link>

        {/* Navegación principal */}
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
          <Link href="/catalogo" className={claseEnlace("/catalogo")}>
            Catálogo
          </Link>

          {!usuario ? (
            <>
              <Link href="/login" className={claseEnlace("/login")}>
                Iniciar Sesión
              </Link>
              <Link
                href="/registro"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Registrarse
              </Link>
            </>
          ) : (
            <>
              {usuario.rol === "tutor" && (
                <>
                  <Link href="/tutor/gestion" className={claseEnlace("/tutor/gestion")}>
                    Horarios
                  </Link>
                  <Link href="/tutor/finanzas" className={claseEnlace("/tutor/finanzas")}>
                    Finanzas
                  </Link>
                  <Link href="/tutor/kyc" className={claseEnlace("/tutor/kyc")}>
                    KYC
                  </Link>
                </>
              )}

              {usuario.rol === "admin" && (
                <Link href="/admin" className={claseEnlace("/admin")}>
                  Panel Admin
                </Link>
              )}

              <Link href="/perfil" className={claseEnlace("/perfil")}>
                Mi Perfil
              </Link>

              <button
                onClick={cerrarSesion}
                className="ml-1 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Salir
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
export default function Navbar() {
  return (
    <Suspense fallback={null}>
      <ContenidoNavbar />
    </Suspense>
  );
}