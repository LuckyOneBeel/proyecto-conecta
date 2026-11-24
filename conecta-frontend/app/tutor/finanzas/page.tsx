"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Movimiento {
  pago_id: number;
  id_transaccion_flow: string;
  monto_total: string;
  comision_retenida: string;
  monto_neto: string;
  estado_pago: "pagado" | "pendiente" | "fallido";
  fecha_pago: string | null;
  nombre_estudiante: string;
  fecha_clase: string;
  hora_inicio: string;
  hora_fin: string;
}

interface ResumenFinanciero {
  totales: {
    bruto: number;
    comision: number;
    neto: number;
    clases_pagadas?: number;
  };
  movimientos: Movimiento[];
}

export default function FinanzasTutor() {
  const router = useRouter();
  const [resumen, setResumen] = useState<ResumenFinanciero | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

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

    let activo = true;

    const obtenerResumen = async () => {
      try {
        const res = await fetch("http://localhost:3001/api/pagos/resumen-tutor", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!activo) return;

        if (res.status === 401 || res.status === 400) {
          localStorage.removeItem("token");
          localStorage.removeItem("usuario");
          router.push("/login");
          return;
        }

        const data = await res.json();
        if (!activo) return;

        if (res.ok) {
          setResumen(data);
        } else {
          setError(data.error || "No se pudo cargar tu resumen financiero.");
        }
      } catch {
        if (activo) {
          setError("Error de conexión con el servidor.");
        }
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    };

    obtenerResumen();

    return () => {
      activo = false;
    };
  }, [router]);

  const formatearCLP = (valor: number | string) =>
    `$${Math.round(Number(valor)).toLocaleString("es-CL")}`;

  const formatearFecha = (fechaIso: string) => {
    const [anio, mes, dia] = fechaIso.split("T")[0].split("-");
    return new Date(Number(anio), Number(mes) - 1, Number(dia)).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (cargando) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-xl text-gray-700">Cargando panel financiero...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-6">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-700">Panel Financiero del Tutor</h1>
            <p className="text-gray-600 mt-1">
              Desglose de tus ingresos por tutorías y comisión de plataforma (15%).
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/tutor/gestion"
              className="text-gray-700 font-semibold hover:text-blue-700 transition-colors"
            >
              Horarios
            </Link>
            <Link
              href="/perfil"
              className="text-blue-600 font-semibold hover:underline"
            >
              ← Volver a mi perfil
            </Link>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 text-red-800 border border-red-200 font-medium">
            {error}
          </div>
        )}

        {resumen && (
          <>
            {/* Tarjetas de Resumen Financiero */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
                <p className="text-sm font-semibold text-gray-600">Total Recaudado (Bruto)</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {formatearCLP(resumen.totales.bruto)}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {resumen.totales.clases_pagadas ?? 0} clases confirmadas y pagadas
                </p>
              </div>

              <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
                <p className="text-sm font-semibold text-gray-600">Comisión Conecta (15%)</p>
                <p className="text-3xl font-bold text-amber-700 mt-2">
                  - {formatearCLP(resumen.totales.comision)}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Retención automática por uso de plataforma
                </p>
              </div>

              <div className="bg-green-50 rounded-2xl shadow-md p-6 border border-green-200">
                <p className="text-sm font-semibold text-green-800">Ganancia Neta a Recibir</p>
                <p className="text-3xl font-bold text-green-800 mt-2">
                  {formatearCLP(resumen.totales.neto)}
                </p>
                <p className="text-xs text-green-700 mt-2">
                  Monto líquido disponible para liquidación
                </p>
              </div>
            </div>

            {/* Tabla de Movimientos */}
            <section className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">Historial de Movimientos</h2>
              </div>

              {resumen.movimientos.length === 0 ? (
                <p className="text-gray-600 text-center py-10 px-6">
                  Aún no registras pagos de estudiantes. Cuando confirmen una clase, aparecerá el desglose aquí.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-700 text-sm border-b border-gray-200">
                        <th className="py-3.5 px-5 font-semibold">Estudiante</th>
                        <th className="py-3.5 px-5 font-semibold">Clase</th>
                        <th className="py-3.5 px-5 font-semibold">Monto Bruto</th>
                        <th className="py-3.5 px-5 font-semibold">Comisión</th>
                        <th className="py-3.5 px-5 font-semibold">Neto Tutor</th>
                        <th className="py-3.5 px-5 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {resumen.movimientos.map((mov) => (
                        <tr key={mov.pago_id} className="hover:bg-gray-50">
                          <td className="py-4 px-5">
                            <p className="font-semibold text-gray-900">{mov.nombre_estudiante}</p>
                            <p className="text-xs text-gray-500 font-mono">
                              {mov.id_transaccion_flow}
                            </p>
                          </td>
                          <td className="py-4 px-5 text-gray-800">
                            <p className="font-medium capitalize">{formatearFecha(mov.fecha_clase)}</p>
                            <p className="text-xs text-gray-600">
                              {mov.hora_inicio.slice(0, 5)} - {mov.hora_fin.slice(0, 5)} hrs
                            </p>
                          </td>
                          <td className="py-4 px-5 font-medium text-gray-900">
                            {formatearCLP(mov.monto_total)}
                          </td>
                          <td className="py-4 px-5 text-amber-700 font-medium">
                            - {formatearCLP(mov.comision_retenida)}
                          </td>
                          <td className="py-4 px-5 font-bold text-green-700">
                            {formatearCLP(mov.monto_neto)}
                          </td>
                          <td className="py-4 px-5">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase ${
                                mov.estado_pago === "pagado"
                                  ? "bg-green-100 text-green-800"
                                  : mov.estado_pago === "fallido"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {mov.estado_pago}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}