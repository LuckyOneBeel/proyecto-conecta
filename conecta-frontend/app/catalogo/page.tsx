"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/app/lib/api";

interface Tutor {
  usuario_id: number;
  tutor_id: number | null;
  nombre: string;
  especialidad: string | null;
  tarifa_hora: string | null;
  documentos_validados: boolean;
}

export default function Catalogo() {
  const [tutores, setTutores] = useState<Tutor[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const obtenerTutores = async () => {
      try {
        const res = await fetch(`${API_URL}/api/tutores`);
        if (res.ok) {
          const data = await res.json();
          setTutores(data);
        }
      } catch (error) {
        console.error("Error al cargar tutores");
      } finally {
        setCargando(false);
      }
    };

    obtenerTutores();
  }, []);

  const quitarTildes = (texto: string) => {
    return texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  };

  const tutoresFiltrados = tutores.filter((tutor) => {
    const busquedaLimpia = quitarTildes(busqueda);
    const nombreLimpio = quitarTildes(tutor.nombre);
    const especialidadLimpia = tutor.especialidad ? quitarTildes(tutor.especialidad) : "";

    return (
      nombreLimpio.includes(busquedaLimpia) ||
      especialidadLimpia.includes(busquedaLimpia)
    );
  });

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-blue-700 mb-2 text-center">
          Encuentra a tu Tutor Ideal
        </h1>
        <p className="text-gray-600 text-center mb-10 text-lg">
          Explora nuestro catálogo y agenda tu próxima clase.
        </p>

        <div className="mb-10 max-w-2xl mx-auto">
          <input
            type="text"
            placeholder="Buscar por materia, especialidad o nombre..."
            className="w-full text-gray-900 placeholder-gray-500 bg-white border-2 border-blue-200 p-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-lg"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {cargando ? (
          <p className="text-center text-gray-700 text-xl">Cargando tutores disponibles...</p>
        ) : tutoresFiltrados.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tutoresFiltrados.map((tutor) => (
              <div
                key={tutor.usuario_id}
                className="bg-white rounded-2xl shadow-md p-6 border border-gray-100 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl font-bold uppercase">
                    {tutor.nombre.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{tutor.nombre}</h2>
                    {tutor.documentos_validados && (
                      <span className="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full mt-1 font-semibold">
                        ✓ Identidad Validada
                      </span>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-gray-500 text-sm font-medium">Especialidad</p>
                  <p className="text-gray-900 font-semibold">
                    {tutor.especialidad || "No definida"}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-gray-500 text-sm font-medium">Valor por hora</p>
                    <p className="text-blue-700 font-bold text-lg">
                      {tutor.tarifa_hora
                        ? `$${Number(tutor.tarifa_hora).toLocaleString("es-CL")}`
                        : "Por acordar"}
                    </p>
                  </div>

                  {tutor.tutor_id ? (
                    <Link
                      href={`/tutores/${tutor.tutor_id}`}
                      className="bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Ver Horarios
                    </Link>
                  ) : (
                    <span className="text-sm text-gray-400 font-medium">Perfil incompleto</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-700 text-xl">
            No se encontraron tutores con esa búsqueda.
          </p>
        )}
      </div>
    </main>
  );
}