"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface DetallePago {
  reserva_id: number;
  estado_reserva: string;
  nombre_tutor: string;
  especialidad: string;
  tarifa_hora: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  id_transaccion_flow: string | null;
  monto_total: string | null;
  estado_pago: string | null;
  fecha_pago: string | null;
}

function ContenidoPaginaPago() {
  const params = useParams();
  const router = useRouter();
  const reservaId = params.reservaId;

  const [detalle, setDetalle] = useState<DetallePago | null>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [tokenSimulado, setTokenSimulado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

  const cerrarPorExpiracion = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    router.push("/login");
  };

  const cargarDetalle = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const res = await fetch(`http://localhost:3001/api/pagos/reserva/${reservaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) return cerrarPorExpiracion();

      const data = await res.json();
      if (res.ok) {
        setDetalle(data);
      } else {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo cargar la reserva." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error de conexión con el servidor." });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (reservaId) cargarDetalle();
  }, [reservaId]);

  const iniciarPagoFlow = async () => {
    const token = localStorage.getItem("token");
    if (!token) return cerrarPorExpiracion();

    setProcesando(true);
    setMensaje(null);

    try {
      const res = await fetch("http://localhost:3001/api/pagos/crear-orden", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reserva_id: Number(reservaId) }),
      });

      const data = await res.json();
      if (res.status === 401 || data.error?.includes("Token")) return cerrarPorExpiracion();

      if (res.ok) {
        if (data.modo === "real" && data.urlPago) {
          window.location.href = data.urlPago;
        } else {
          setTokenSimulado(data.tokenFlow);
        }
      } else {
        setMensaje({ tipo: "error", texto: data.error || "Error al iniciar la orden de pago." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error al conectar con la pasarela." });
    } finally {
      setProcesando(false);
    }
  };

  const confirmarSimulacion = async (resultado: "pagado" | "fallido") => {
    const token = localStorage.getItem("token");
    if (!token) return cerrarPorExpiracion();

    setProcesando(true);
    setMensaje(null);

    try {
      const res = await fetch("http://localhost:3001/api/pagos/confirmar-simulado", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reserva_id: Number(reservaId), resultado }),
      });

      const data = await res.json();
      if (res.status === 401 || data.error?.includes("Token")) return cerrarPorExpiracion();

      if (res.ok) {
        setTokenSimulado(null);
        setMensaje({
          tipo: resultado === "pagado" ? "exito" : "error",
          texto: data.mensaje,
        });
        await cargarDetalle();
      } else {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo confirmar el pago." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error de conexión al confirmar el pago." });
    } finally {
      setProcesando(false);
    }
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

  if (cargando) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-xl text-gray-700">Cargando orden de pago...</p>
      </main>
    );
  }

  if (!detalle) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <p className="text-xl text-red-600 mb-4">{mensaje?.texto || "Orden no encontrada."}</p>
        <Link href="/catalogo" className="text-blue-600 font-semibold hover:underline">
          ← Volver al catálogo
        </Link>
      </main>
    );
  }

  const montoMostrar = Number(detalle.monto_total || detalle.tarifa_hora);

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-blue-700 p-6 text-white flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Checkout de Tutoría</h1>
            <p className="text-blue-100 text-sm">Orden de Reserva #{detalle.reserva_id}</p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
              detalle.estado_reserva === "confirmada"
                ? "bg-green-400 text-green-950"
                : detalle.estado_reserva === "cancelada"
                ? "bg-red-400 text-red-950"
                : "bg-amber-300 text-amber-950"
            }`}
          >
            {detalle.estado_reserva}
          </span>
        </div>

        <div className="p-8 space-y-6">
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

          {/* Resumen de la clase */}
          <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 space-y-2">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Resumen de la Clase</h2>
            <p className="text-gray-800">
              <strong>Tutor:</strong> {detalle.nombre_tutor}
            </p>
            <p className="text-gray-800">
              <strong>Materia:</strong> {detalle.especialidad}
            </p>
            <p className="text-gray-800 capitalize">
              <strong>Fecha:</strong> {formatearFecha(detalle.fecha)}
            </p>
            <p className="text-gray-800">
              <strong>Horario:</strong> {detalle.hora_inicio.slice(0, 5)} - {detalle.hora_fin.slice(0, 5)} hrs
            </p>
            <div className="pt-3 mt-3 border-t border-gray-300 flex justify-between items-center">
              <span className="text-lg font-bold text-gray-900">Total a Pagar</span>
              <span className="text-2xl font-bold text-blue-700">
                ${montoMostrar.toLocaleString("es-CL")} CLP
              </span>
            </div>
          </div>

          {/* Estado: Pendiente de Pago */}
          {detalle.estado_reserva === "pendiente" && !tokenSimulado && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-blue-100 bg-blue-50 text-sm text-blue-900">
                <p className="font-semibold mb-1">Medios de pago seguros vía Flow (PCI-DSS)</p>
                <p>Webpay Plus (Tarjetas de Débito / Crédito) y Transferencia Bancaria.</p>
              </div>

              <button
                onClick={iniciarPagoFlow}
                disabled={procesando}
                className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold text-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors shadow-md"
              >
                {procesando ? "Conectando con Flow..." : "Pagar con Flow"}
              </button>
            </div>
          )}

          {/* Pantalla intermedia de Pasarela Simulada (solo en FLOW_MODO=simulado) */}
          {tokenSimulado && detalle.estado_reserva === "pendiente" && (
            <div className="p-6 rounded-xl border-2 border-blue-500 bg-blue-50/50 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-blue-900">Pasarela Flow Sandbox (Simulación Local)</h3>
                <span className="text-xs font-mono bg-white px-2 py-1 rounded border text-gray-700">
                  {tokenSimulado}
                </span>
              </div>
              <p className="text-sm text-gray-700">
                Selecciona el resultado que quieres simular para probar el flujo transaccional ACID y el cálculo de comisión:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => confirmarSimulacion("pagado")}
                  disabled={procesando}
                  className="bg-green-600 text-white py-3 px-4 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                >
                  ✓ Aprobar Pago (Webpay OK)
                </button>
                <button
                  onClick={() => confirmarSimulacion("fallido")}
                  disabled={procesando}
                  className="bg-red-600 text-white py-3 px-4 rounded-lg font-bold hover:bg-red-700 disabled:bg-gray-400 transition-colors"
                >
                  ✕ Rechazar Pago (Fallo)
                </button>
              </div>
            </div>
          )}

          {/* Estado: Confirmada / Pagada */}
          {detalle.estado_reserva === "confirmada" && (
            <div className="p-6 rounded-xl bg-green-50 border border-green-200 space-y-2">
              <h3 className="text-lg font-bold text-green-800">Comprobante de Pago Confirmado</h3>
              <p className="text-sm text-green-900">
                <strong>ID Transacción Flow:</strong> {detalle.id_transaccion_flow}
              </p>
              {detalle.fecha_pago && (
                <p className="text-sm text-green-900">
                  <strong>Fecha de pago:</strong>{" "}
                  {new Date(detalle.fecha_pago).toLocaleString("es-CL")}
                </p>
              )}
              <div className="pt-4">
                <Link
                  href="/perfil"
                  className="inline-block bg-green-700 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-green-800 transition-colors"
                >
                  Ir a mi Perfil
                </Link>
              </div>
            </div>
          )}

          {/* Estado: Cancelada */}
          {detalle.estado_reserva === "cancelada" && (
            <div className="text-center pt-2">
              <Link
                href="/catalogo"
                className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Volver al catálogo para elegir otro horario
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
export default function PaginaPago() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-xl text-gray-700">Cargando orden de pago...</p>
        </main>
      }
    >
      <ContenidoPaginaPago />
    </Suspense>
  );
}