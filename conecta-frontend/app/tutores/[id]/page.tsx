"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/app/lib/api";

interface Tutor {
  usuario_id: number;
  tutor_id: number;
  nombre: string;
  especialidad: string | null;
  tarifa_hora: string | null;
  documentos_validados: boolean;
}

interface BloqueHorario {
  id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
}

function ContenidoHorariosTutor() {
  const params = useParams();
  const router = useRouter();
  const tutorId = params.id;

  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [horarios, setHorarios] = useState<BloqueHorario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [reservandoId, setReservandoId] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

  useEffect(() => {
    if (!tutorId) return;

    const cargarDatos = async () => {
      try {
        const [resTutor, resHorarios] = await Promise.all([
          fetch(`${API_URL}/api/tutores/${tutorId}`),
          fetch(`${API_URL}/api/agendamiento/disponibilidad/${tutorId}`),
        ]);

        if (resTutor.ok) {
          setTutor(await resTutor.json());
        }
        if (resHorarios.ok) {
          setHorarios(await resHorarios.json());
        }
      } catch (error) {
        setMensaje({ tipo: "error", texto: "Error al conectar con el servidor." });
      } finally {
        setCargando(false);
      }
    };

    cargarDatos();
  }, [tutorId]);

  // Formatea fechas de PostgreSQL (YYYY-MM-DD) sin desfase de zona horaria
  const formatearFecha = (fechaIso: string) => {
    const [anio, mes, dia] = fechaIso.split("T")[0].split("-");
    const fechaLocal = new Date(Number(anio), Number(mes) - 1, Number(dia));
    return fechaLocal.toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  // Recorta los segundos (ej: "10:00:00" -> "10:00")
  const formatearHora = (hora: string) => hora.slice(0, 5);

  const handleReservar = async (disponibilidadId: number) => {
    const token = localStorage.getItem("token");

    if (!token) {
      setMensaje({
        tipo: "error",
        texto: "Debes iniciar sesión como estudiante para reservar una clase.",
      });
      setTimeout(() => router.push("/login"), 1800);
      return;
    }

    setReservandoId(disponibilidadId);
    setMensaje(null);

    try {
      const res = await fetch("http://localhost:3001/api/agendamiento/reservar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ disponibilidad_id: disponibilidadId }),
      });

      const data = await res.json();

      if (res.ok) {
        setMensaje({
          tipo: "exito",
          texto: `Reserva #${data.reserva.id} creada. Redirigiendo a la pasarela de pago...`,
        });
        setHorarios((prev) => prev.filter((h) => h.id !== disponibilidadId));
        setTimeout(() => {
          router.push(`/pago/${data.reserva.id}`);
        }, 1200);
      } else {
        if (res.status === 401 || data.error?.includes("Token")) {
          localStorage.removeItem("token");
          localStorage.removeItem("usuario");
          setMensaje({
            tipo: "error",
            texto: "Tu sesión expiró. Redirigiendo al inicio de sesión...",
          });
          setTimeout(() => router.push("/login"), 1500);
          return;
        }
        setMensaje({ tipo: "error", texto: data.error || "No se pudo completar la reserva." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error de conexión al intentar reservar." });
    } finally {
      setReservandoId(null);
    }
  };

  if (cargando) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-xl text-gray-700">Cargando horarios del tutor...</p>
      </main>
    );
  }

  if (!tutor) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <p className="text-xl text-gray-800 mb-4">Tutor no encontrado.</p>
        <Link href="/catalogo" className="text-blue-600 font-semibold hover:underline">
          ← Volver al catálogo
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/catalogo"
          className="inline-block text-blue-600 font-semibold hover:underline mb-6"
        >
          ← Volver al catálogo de tutores
        </Link>

        {/* Encabezado del Tutor */}
        <div className="bg-white rounded-2xl shadow-md p-8 border border-gray-100 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-3xl font-bold uppercase">
              {tutor.nombre.charAt(0)}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{tutor.nombre}</h1>
              <p className="text-gray-700 font-medium mt-1">
                {tutor.especialidad || "Especialidad por definir"}
              </p>
              {tutor.documentos_validados && (
                <span className="inline-block bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full mt-2 font-semibold">
                  ✓ Identidad Validada
                </span>
              )}
            </div>
          </div>

          <div className="bg-blue-50 px-6 py-4 rounded-xl border border-blue-100 text-center">
            <p className="text-sm text-gray-600 font-medium">Valor por hora</p>
            <p className="text-2xl font-bold text-blue-700">
              {tutor.tarifa_hora
                ? `$${Number(tutor.tarifa_hora).toLocaleString("es-CL")}`
                : "Por acordar"}
            </p>
          </div>
        </div>

        {/* Mensajes de estado */}
        {mensaje && (
          <div
            className={`p-4 rounded-xl mb-6 font-medium border ${
              mensaje.tipo === "exito"
                ? "bg-green-50 text-green-800 border-green-200"
                : "bg-red-50 text-red-800 border-red-200"
            }`}
          >
            {mensaje.texto}
          </div>
        )}

        {/* Lista de Horarios Disponibles */}
        <div className="bg-white rounded-2xl shadow-md p-8 border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Horarios Disponibles</h2>

          {horarios.length === 0 ? (
            <p className="text-gray-600 text-center py-8 bg-gray-50 rounded-xl border border-gray-200">
              Este tutor no tiene bloques horarios disponibles en este momento.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {horarios.map((bloque) => (
                <div
                  key={bloque.id}
                  className="flex items-center justify-between p-5 bg-gray-50 rounded-xl border border-gray-200 hover:border-blue-300 transition-colors"
                >
                  <div>
                    <p className="text-gray-900 font-bold capitalize">
                      {formatearFecha(bloque.fecha)}
                    </p>
                    <p className="text-blue-700 font-semibold mt-1">
                      {formatearHora(bloque.hora_inicio)} - {formatearHora(bloque.hora_fin)} hrs
                    </p>
                  </div>

                  <button
                    onClick={() => handleReservar(bloque.id)}
                    disabled={reservandoId === bloque.id}
                    className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition-colors shadow-sm"
                  >
                    {reservandoId === bloque.id ? "Reservando..." : "Reservar"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
export default function HorariosTutor() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-xl text-gray-700">Cargando horarios del tutor...</p>
        </main>
      }
    >
      <ContenidoHorariosTutor />
    </Suspense>
  );
}