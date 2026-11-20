"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  fecha_registro: string;
}

export default function Perfil() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    const obtenerPerfil = async () => {
      try {
        const res = await fetch("http://localhost:3001/api/usuarios/perfil", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          }
        });

        if (res.ok) {
          const data = await res.json();
          setUsuario(data);
        } else {
          localStorage.removeItem("token");
          router.push("/login");
        }
      } catch (error) {
        setError("Error al conectar con el servidor");
      }
    };

    obtenerPerfil();
  }, [router]);

  const cerrarSesion = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    router.push("/login");
  };

  if (!usuario && !error) return <div className="text-center p-24 text-xl text-gray-700">Cargando tu perfil...</div>;

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
        
        {/* Cabecera del Perfil */}
        <div className="bg-blue-600 p-8 text-center relative">
          <button 
            onClick={cerrarSesion}
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Cerrar Sesión
          </button>
          
          {/* Avatar (Círculo con la inicial del nombre) */}
          <div className="w-24 h-24 bg-white rounded-full mx-auto flex items-center justify-center text-4xl font-bold text-blue-600 shadow-md mb-4 uppercase">
            {usuario?.nombre.charAt(0)}
          </div>
          <h1 className="text-3xl font-bold text-white">{usuario?.nombre}</h1>
          <p className="text-blue-100 mt-1 capitalize">{usuario?.rol}</p>
        </div>
        
        <div className="p-8">
          {error ? (
            <p className="text-red-500 text-center">{error}</p>
          ) : (
            <div className="space-y-6">
              
              {/* Sección de Información Básica */}
              <div>
                <h3 className="text-xl font-bold text-gray-800 border-b pb-2 mb-4">Información Personal</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-500 font-medium">Correo Electrónico</p>
                    <p className="text-gray-900 font-semibold mt-1">{usuario?.email}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-500 font-medium">Miembro desde</p>
                    <p className="text-gray-900 font-semibold mt-1">
                      {usuario ? new Date(usuario.fecha_registro).toLocaleDateString('es-CL') : ''}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sección Condicional: Solo visible para Tutores */}
              {usuario?.rol === 'tutor' && (
                <div className="mt-8">
                  <h3 className="text-xl font-bold text-gray-800 border-b pb-2 mb-4">Perfil de Tutor (Configuración)</h3>
                  <div className="bg-blue-50 border border-blue-100 p-6 rounded-lg text-center">
                    <p className="text-blue-800 mb-4">
                      Aún necesitas completar tu perfil profesional (especialidades, tarifa y validación de documentos).
                    </p>
                    <Link
                      href="/tutor/gestion"
                      className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Gestionar Perfil y Horarios
                    </Link>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </main>
  );
}