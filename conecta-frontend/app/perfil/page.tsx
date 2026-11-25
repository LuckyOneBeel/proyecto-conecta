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

interface ReservaUsuario {
  reserva_id: number;
  estado_reserva: "pendiente" | "confirmada" | "cancelada";
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  contraparte_nombre: string;
  especialidad: string | null;
  tarifa_hora: string;
  estado_pago: string | null;
  monto_total: string | null;
}

export default function Perfil() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [reservas, setReservas] = useState<ReservaUsuario[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    let activo = true;

    const cargarPerfilYClases = async () => {
      try {
        const [resPerfil, resReservas] = await Promise.all([
          fetch("http://localhost:3001/api/usuarios/perfil", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("http://localhost:3001/api/agendamiento/mis-reservas", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!activo) return;

        if (!resPerfil.ok) {
          localStorage.removeItem("token");
          localStorage.removeItem("usuario");
          router.push("/login");
          return;
        }

        const dataUsuario = await resPerfil.json();
        if (!activo) return;
        setUsuario(dataUsuario);

        if (resReservas.ok) {
          const dataReservas = await resReservas.json();
          if (activo) setReservas(dataReservas);
        }
      } catch {
        if (activo) {
          setError("Error al conectar con el servidor");
        }
      }
    };

    cargarPerfilYClases();

    return () => {
      activo = false;
    };
  }, [router]);

  const cerrarSesion = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    router.push("/login");
  };

  const formatearFecha = (fechaIso: string) => {
    const [anio, mes, dia] = fechaIso.split("T")[0].split("-");
    return new Date(Number(anio), Number(mes) - 1, Number(dia)).toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  if (!usuario && !error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-xl text-gray-700">Cargando tu perfil...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
        {/* Cabecera del Perfil */}
        <div className="bg-blue-600 p-8 text-center relative">
          <button
            onClick={cerrarSesion}
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Cerrar Sesión
          </button>

          <div className="w-24 h-24 bg-white rounded-full mx-auto flex items-center justify-center text-4xl font-bold text-blue-600 shadow-md mb-4 uppercase">
            {usuario?.nombre.charAt(0)}
          </div>
          <h1 className="text-3xl font-bold text-white">{usuario?.nombre}</h1>
          <p className="text-blue-100 mt-1 capitalize font-medium">{usuario?.rol}</p>
        </div>

        <div className="p-8">
          {error ? (
            <p className="text-red-600 text-center font-medium">{error}</p>
          ) : (
            <div className="space-y-8">
              {/* Información Personal */}
              <section>
                <h2 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">
                  Información Personal
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-600 font-medium">Correo Electrónico</p>
                    <p className="text-gray-900 font-semibold mt-1">{usuario?.email}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-600 font-medium">Miembro desde</p>
                    <p className="text-gray-900 font-semibold mt-1">
                      {usuario ? new Date(usuario.fecha_registro).toLocaleDateString("es-CL") : ""}
                    </p>
                  </div>
                </div>
              </section>

              {/* Accesos Rápidos por Rol */}
              {usuario?.rol === "tutor" && (
                <section>
                  <h2 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">
                    Herramientas de Tutor
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Link
                      href="/tutor/gestion"
                      className="block bg-blue-50 hover:bg-blue-100 border border-blue-200 p-5 rounded-xl transition-colors"
                    >
                      <p className="text-lg font-bold text-blue-800">Perfil y Horarios</p>
                      <p className="text-sm text-blue-700 mt-1">
                        Edita tu especialidad, tarifa por hora y bloques disponibles.
                      </p>
                    </Link>

                    <Link
                      href="/tutor/finanzas"
                      className="block bg-green-50 hover:bg-green-100 border border-green-200 p-5 rounded-xl transition-colors"
                    >
                      <p className="text-lg font-bold text-green-800">Panel Financiero</p>
                      <p className="text-sm text-green-700 mt-1">
                        Revisa tus ingresos brutos, comisiones y ganancia neta.
                      </p>
                    </Link>
                  </div>
                </section>
              )}

              {/* Mis Clases Agendadas */}
              <section>
                <div className="flex items-center justify-between border-b pb-2 mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Mis Clases Agendadas</h2>
                  {usuario?.rol === "estudiante" && (
                    <Link
                      href="/catalogo"
                      className="text-sm font-semibold text-blue-600 hover:underline"
                    >
                      + Buscar nuevo tutor
                    </Link>
                  )}
                </div>

                {reservas.length === 0 ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
                    <p className="text-gray-700">
                      {usuario?.rol === "estudiante"
                        ? "Todavía no tienes clases agendadas."
                        : "Aún ningún estudiante ha reservado un horario contigo."}
                    </p>
                    {usuario?.rol === "estudiante" && (
                      <Link
                        href="/catalogo"
                        className="inline-block mt-4 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                      >
                        Explorar Catálogo de Tutores
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reservas.map((clase) => (
                      <div
                        key={clase.reserva_id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-gray-50 rounded-xl border border-gray-200"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-gray-500">
                              Reserva #{clase.reserva_id}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                                clase.estado_reserva === "confirmada"
                                  ? "bg-green-100 text-green-800"
                                  : clase.estado_reserva === "cancelada"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {clase.estado_reserva}
                            </span>
                          </div>

                          <p className="text-lg font-bold text-gray-900">
                            {usuario?.rol === "estudiante" ? "Tutor: " : "Estudiante: "}
                            {clase.contraparte_nombre}
                          </p>
                          <p className="text-sm text-gray-700">
                            {clase.especialidad || "Tutoría personalizada"}
                          </p>
                          <p className="text-sm font-semibold text-blue-700 capitalize">
                            {formatearFecha(clase.fecha)} · {clase.hora_inicio.slice(0, 5)} -{" "}
                            {clase.hora_fin.slice(0, 5)} hrs
                          </p>
                        </div>

                        <div className="flex flex-col sm:items-end gap-2">
                          <p className="text-lg font-bold text-gray-900">
                            ${Math.round(Number(clase.monto_total || clase.tarifa_hora)).toLocaleString("es-CL")} CLP
                          </p>

                          {usuario?.rol === "estudiante" && clase.estado_reserva === "pendiente" && (
                            <Link
                              href={`/pago/${clase.reserva_id}`}
                              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors text-center"
                            >
                              Completar Pago
                            </Link>
                          )}

                          {clase.estado_reserva === "confirmada" && (
                            <div className="flex flex-col sm:items-end gap-1.5">
                              <Link
                                href={`/aula/${clase.reserva_id}`}
                                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors text-center"
                              >
                                Entrar al Aula Virtual
                              </Link>
                              {usuario?.rol === "estudiante" && (
                                <Link
                                  href={`/pago/${clase.reserva_id}`}
                                  className="text-xs font-semibold text-gray-600 hover:underline"
                                >
                                  Ver comprobante
                                </Link>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}