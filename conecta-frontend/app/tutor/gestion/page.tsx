"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface BloqueHorario {
  id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: "libre" | "bloqueada" | "reservada";
}

export default function GestionTutor() {
  const router = useRouter();

  const [especialidad, setEspecialidad] = useState("");
  const [tarifaHora, setTarifaHora] = useState("");
  const [perfilCreado, setPerfilCreado] = useState(false);

  const [fecha, setFecha] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");

  const [horarios, setHorarios] = useState<BloqueHorario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

  const manejarTokenExpirado = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    router.push("/login");
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    const usuarioGuardado = localStorage.getItem("usuario");

    if (!token || !usuarioGuardado) {
      router.push("/login");
      return;
    }

    const usuario = JSON.parse(usuarioGuardado);
    if (usuario.rol !== "tutor") {
      router.push("/perfil");
      return;
    }

    const cargarDatos = async () => {
      try {
        const [resPerfil, resHorarios] = await Promise.all([
          fetch("http://localhost:3001/api/tutores/mi-perfil", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("http://localhost:3001/api/agendamiento/mis-horarios", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (resPerfil.status === 401 || resHorarios.status === 401) {
          manejarTokenExpirado();
          return;
        }

        if (resPerfil.ok) {
          const dataPerfil = await resPerfil.json();
          if (dataPerfil) {
            setEspecialidad(dataPerfil.especialidad || "");
            setTarifaHora(dataPerfil.tarifa_hora ? String(Math.round(Number(dataPerfil.tarifa_hora))) : "");
            setPerfilCreado(true);
          }
        }

        if (resHorarios.ok) {
          setHorarios(await resHorarios.json());
        }
      } catch (error) {
        setMensaje({ tipo: "error", texto: "Error al cargar tus datos de tutor." });
      } finally {
        setCargando(false);
      }
    };

    cargarDatos();
  }, [router]);

  const guardarPerfilProfesional = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) return manejarTokenExpirado();

    setMensaje(null);
    try {
      const res = await fetch("http://localhost:3001/api/tutores/mi-perfil", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          especialidad,
          tarifa_hora: Number(tarifaHora),
        }),
      });

      const data = await res.json();
      if (res.status === 401 || data.error?.includes("Token")) return manejarTokenExpirado();

      if (res.ok) {
        setPerfilCreado(true);
        setMensaje({ tipo: "exito", texto: "Perfil profesional guardado. Ya puedes publicar horarios." });
      } else {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo guardar el perfil." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error de conexión con el servidor." });
    }
  };

  const agregarHorario = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) return manejarTokenExpirado();

    if (horaFin <= horaInicio) {
      setMensaje({ tipo: "error", texto: "La hora de término debe ser posterior a la hora de inicio." });
      return;
    }

    setMensaje(null);
    try {
      const res = await fetch("http://localhost:3001/api/agendamiento/disponibilidad", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fecha,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
        }),
      });

      const data = await res.json();
      if (res.status === 401 || data.error?.includes("Token")) return manejarTokenExpirado();

      if (res.ok) {
        setHorarios((prev) => [...prev, data.bloque]);
        setFecha("");
        setHoraInicio("");
        setHoraFin("");
        setMensaje({ tipo: "exito", texto: "Bloque horario publicado en el catálogo." });
      } else {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo publicar el horario." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error al conectar con el servidor." });
    }
  };

  const cambiarEstadoHorario = async (bloque: BloqueHorario) => {
    const token = localStorage.getItem("token");
    if (!token) return manejarTokenExpirado();

    const nuevoEstado = bloque.estado === "libre" ? "bloqueada" : "libre";

    try {
      const res = await fetch(`http://localhost:3001/api/agendamiento/disponibilidad/${bloque.id}/estado`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ estado: nuevoEstado }),
      });

      const data = await res.json();
      if (res.status === 401 || data.error?.includes("Token")) return manejarTokenExpirado();

      if (res.ok) {
        setHorarios((prev) =>
          prev.map((h) => (h.id === bloque.id ? { ...h, estado: nuevoEstado } : h))
        );
      } else {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo cambiar el estado." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error de conexión al actualizar el bloque." });
    }
  };

  const formatearFecha = (fechaIso: string) => {
    const [anio, mes, dia] = fechaIso.split("T")[0].split("-");
    const fechaLocal = new Date(Number(anio), Number(mes) - 1, Number(dia));
    return fechaLocal.toLocaleDateString("es-CL", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  if (cargando) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-xl text-gray-700">Cargando panel del tutor...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-blue-700">Gestión de Tutor</h1>
            <p className="text-gray-600 mt-1">Configura tu perfil profesional y tus horarios disponibles.</p>
          </div>
          <Link href="/perfil" className="text-blue-600 font-semibold hover:underline">
            ← Volver a mi perfil
          </Link>
        </div>

        {mensaje && (
          <div
            className={`p-4 rounded-xl font-medium border ${
              mensaje.tipo === "exito"
                ? "bg-green-50 text-green-800 border-green-200"
                : "bg-red-50 text-red-800 border-red-200"
            }`}
          >
            {mensaje.texto}
          </div>
        )}

        {/* Sección 1: Perfil Profesional */}
        <section className="bg-white rounded-2xl shadow-md p-8 border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-5">1. Datos Profesionales</h2>
          <form onSubmit={guardarPerfilProfesional} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Especialidad / Materias
              </label>
              <input
                type="text"
                value={especialidad}
                onChange={(e) => setEspecialidad(e.target.value)}
                placeholder="Ej: Cálculo, Álgebra y Programación"
                required
                className="w-full text-gray-900 placeholder-gray-500 bg-gray-50 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Tarifa por hora (CLP)
              </label>
              <input
                type="number"
                min={1000}
                step={500}
                value={tarifaHora}
                onChange={(e) => setTarifaHora(e.target.value)}
                placeholder="Ej: 15000"
                required
                className="w-full text-gray-900 placeholder-gray-500 bg-gray-50 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm"
              >
                Guardar Perfil Profesional
              </button>
            </div>
          </form>
        </section>

        {/* Sección 2: Publicar Horarios */}
        <section className="bg-white rounded-2xl shadow-md p-8 border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">2. Publicar Nuevo Horario</h2>
          {!perfilCreado && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg mb-4">
              Guarda primero tus datos profesionales arriba para habilitar la publicación de horarios.
            </p>
          )}

          <form onSubmit={agregarHorario} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={!perfilCreado}
                required
                className="w-full text-gray-900 bg-gray-50 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Hora inicio</label>
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                disabled={!perfilCreado}
                required
                className="w-full text-gray-900 bg-gray-50 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Hora término</label>
              <input
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                disabled={!perfilCreado}
                required
                className="w-full text-gray-900 bg-gray-50 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={!perfilCreado}
              className="bg-green-600 text-white py-3 px-4 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-400 transition-colors"
            >
              + Agregar Bloque
            </button>
          </form>
        </section>

        {/* Sección 3: Lista de Horarios */}
        <section className="bg-white rounded-2xl shadow-md p-8 border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-5">3. Mis Horarios Configurados</h2>

          {horarios.length === 0 ? (
            <p className="text-gray-600 text-center py-6 bg-gray-50 rounded-xl border border-gray-200">
              Aún no has publicado bloques horarios.
            </p>
          ) : (
            <div className="space-y-3">
              {horarios.map((bloque) => (
                <div
                  key={bloque.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200"
                >
                  <div>
                    <p className="font-bold text-gray-900 capitalize">{formatearFecha(bloque.fecha)}</p>
                    <p className="text-blue-700 font-semibold">
                      {bloque.hora_inicio.slice(0, 5)} - {bloque.hora_fin.slice(0, 5)} hrs
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        bloque.estado === "libre"
                          ? "bg-green-100 text-green-700"
                          : bloque.estado === "bloqueada"
                          ? "bg-gray-200 text-gray-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {bloque.estado}
                    </span>

                    {bloque.estado !== "reservada" && (
                      <button
                        onClick={() => cambiarEstadoHorario(bloque)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          bloque.estado === "libre"
                            ? "bg-red-100 text-red-700 hover:bg-red-200"
                            : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                        }`}
                      >
                        {bloque.estado === "libre" ? "Bloquear" : "Liberar"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}