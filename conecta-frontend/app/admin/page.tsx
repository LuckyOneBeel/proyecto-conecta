"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/app/lib/api";

interface SolicitudTutor {
  tutor_id: number;
  usuario_id: number;
  nombre: string;
  email: string;
  especialidad: string | null;
  tarifa_hora: string | null;
  rut: string | null;
  estado_kyc: "no_iniciado" | "pendiente" | "aprobado" | "rechazado";
  documentos_validados: boolean;
  sumsub_applicant_id: string | null;
  url_documento: string | null;
  observacion_kyc: string | null;
  fecha_solicitud_kyc: string | null;
  sumsub_veredicto: string | null;
}

interface KpisAdmin {
  total_usuarios: number;
  tutores_pendientes: number;
  tutores_validados: number;
  total_comisiones: number;
  pagos_confirmados: number;
}

export default function PanelAdmin() {
  const router = useRouter();
  const [kpis, setKpis] = useState<KpisAdmin | null>(null);
  const [solicitudes, setSolicitudes] = useState<SolicitudTutor[]>([]);
  const [filtro, setFiltro] = useState<"todos" | "pendiente" | "aprobado" | "rechazado">("pendiente");
  const [observaciones, setObservaciones] = useState<Record<number, string>>({});
  const [procesandoId, setProcesandoId] = useState<number | null>(null);
  const [recargar, setRecargar] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const usuarioGuardado = localStorage.getItem("usuario");

    if (!token || !usuarioGuardado) {
      router.push("/login");
      return;
    }

    const usuario = JSON.parse(usuarioGuardado);
    if (usuario.rol !== "admin") {
      router.push("/perfil");
      return;
    }

    let activo = true;

    const cargarPanel = async () => {
      try {
        const res = await fetch(`${API_URL}/api/kyc/admin/solicitudes`, {
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
          setKpis(data.kpis);
          setSolicitudes(data.solicitudes);
        } else {
          setMensaje({ tipo: "error", texto: data.error || "No se pudo cargar el panel." });
        }
      } catch {
        if (activo) {
          setMensaje({ tipo: "error", texto: "Error de conexión con el servidor." });
        }
      } finally {
        if (activo) setCargando(false);
      }
    };

    cargarPanel();

    return () => {
      activo = false;
    };
  }, [router, recargar]);

  const resolverKyc = async (tutorId: number, decision: "aprobado" | "rechazado") => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    const observacion = observaciones[tutorId] || "";
    if (decision === "rechazado" && !observacion.trim()) {
      setMensaje({
        tipo: "error",
        texto: "Escribe un motivo en el campo de observación antes de rechazar.",
      });
      return;
    }

    setProcesandoId(tutorId);
    setMensaje(null);

    try {
      const res = await fetch(`http://localhost:3001/api/kyc/admin/resolver/${tutorId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ decision, observacion }),
      });

      const data = await res.json();

      if (res.status === 401 || data.error?.includes("Token")) {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        router.push("/login");
        return;
      }

      if (res.ok) {
        setMensaje({ tipo: "exito", texto: data.mensaje });
        setRecargar((prev) => prev + 1);
      } else {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo procesar la decisión." });
      }
    } catch {
      setMensaje({ tipo: "error", texto: "Error de conexión al resolver solicitud." });
    } finally {
      setProcesandoId(null);
    }
  };

  const solicitudesFiltradas = solicitudes.filter((s) =>
    filtro === "todos" ? true : s.estado_kyc === filtro
  );

  if (cargando) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-xl text-gray-700">Cargando panel de administración...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-700">Panel de Administración CONECTA</h1>
            <p className="text-gray-600 mt-1">
              Validación KYC de tutores y monitoreo operativo de la plataforma.
            </p>
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

        {/* KPIs Generales */}
        {kpis && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
              <p className="text-sm font-semibold text-gray-600">Solicitudes KYC Pendientes</p>
              <p className="text-3xl font-bold text-amber-700 mt-2">{kpis.tutores_pendientes}</p>
            </div>

            <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
              <p className="text-sm font-semibold text-gray-600">Tutores Validados</p>
              <p className="text-3xl font-bold text-green-700 mt-2">{kpis.tutores_validados}</p>
            </div>

            <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
              <p className="text-sm font-semibold text-gray-600">Usuarios Registrados</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{kpis.total_usuarios}</p>
            </div>

            <div className="bg-blue-50 rounded-2xl shadow-md p-6 border border-blue-200">
              <p className="text-sm font-semibold text-blue-900">Comisiones Plataforma (15%)</p>
              <p className="text-3xl font-bold text-blue-800 mt-2">
                ${Math.round(kpis.total_comisiones).toLocaleString("es-CL")}
              </p>
              <p className="text-xs text-blue-700 mt-1">
                {kpis.pagos_confirmados} pagos confirmados
              </p>
            </div>
          </div>
        )}

        {/* Filtros de estado KYC */}
        <section className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
            <h2 className="text-xl font-bold text-gray-900">Revisión de Tutores (KYC)</h2>
            <div className="flex flex-wrap gap-2">
              {(["pendiente", "todos", "aprobado", "rechazado"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFiltro(tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${
                    filtro === tab
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {solicitudesFiltradas.length === 0 ? (
            <p className="text-gray-600 text-center py-8 bg-gray-50 rounded-xl border border-gray-200">
              No hay tutores en la categoría &quot;{filtro}&quot;.
            </p>
          ) : (
            <div className="space-y-5">
              {solicitudesFiltradas.map((tutor) => (
                <div
                  key={tutor.tutor_id}
                  className="p-6 rounded-xl bg-gray-50 border border-gray-200 space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-lg font-bold text-gray-900">{tutor.nombre}</h3>
                        <span
                          className={`px-3 py-0.5 rounded-full text-xs font-bold uppercase ${
                            tutor.estado_kyc === "aprobado"
                              ? "bg-green-100 text-green-800"
                              : tutor.estado_kyc === "pendiente"
                              ? "bg-amber-100 text-amber-800"
                              : tutor.estado_kyc === "rechazado"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {tutor.estado_kyc.replace("_", " ")}
                        </span>
                        {tutor.sumsub_veredicto && (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              tutor.sumsub_veredicto === "GREEN"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : "bg-red-100 text-red-800 border border-red-200"
                            }`}
                          >
                            Sumsub: {tutor.sumsub_veredicto}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700">
                        {tutor.email} · <strong>RUT:</strong> {tutor.rut || "No ingresado"}
                      </p>
                      <p className="text-sm text-gray-700">
                        <strong>Especialidad:</strong> {tutor.especialidad || "Sin definir"} ·{" "}
                        <strong>Tarifa:</strong>{" "}
                        {tutor.tarifa_hora
                          ? `$${Number(tutor.tarifa_hora).toLocaleString("es-CL")} CLP`
                          : "Sin definir"}
                      </p>
                      {tutor.sumsub_applicant_id && (
                        <p className="text-xs font-mono text-gray-500">
                          ID Sumsub: {tutor.sumsub_applicant_id}
                        </p>
                      )}
                      {tutor.url_documento && (
                        <p className="text-sm pt-1">
                          <a
                            href={tutor.url_documento}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 font-semibold hover:underline break-all"
                          >
                            Ver documento adjunto ↗
                          </a>
                        </p>
                      )}
                      {tutor.observacion_kyc && (
                        <p className="text-sm text-red-700 pt-1">
                          <strong>Última observación:</strong> {tutor.observacion_kyc}
                        </p>
                      )}
                    </div>

                    {/* Acciones de aprobación/rechazo */}
                    <div className="flex flex-col gap-3 min-w-[260px]">
                      <input
                        type="text"
                        placeholder="Observación (obligatoria si rechazas)"
                        value={observaciones[tutor.tutor_id] || ""}
                        onChange={(e) =>
                          setObservaciones((prev) => ({
                            ...prev,
                            [tutor.tutor_id]: e.target.value,
                          }))
                        }
                        className="w-full text-sm text-gray-900 placeholder-gray-500 bg-white border border-gray-300 p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => resolverKyc(tutor.tutor_id, "aprobado")}
                          disabled={procesandoId === tutor.tutor_id || tutor.estado_kyc === "aprobado"}
                          className="flex-1 bg-green-600 text-white py-2 px-3 rounded-lg text-sm font-bold hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                        >
                          ✓ Aprobar
                        </button>
                        <button
                          onClick={() => resolverKyc(tutor.tutor_id, "rechazado")}
                          disabled={procesandoId === tutor.tutor_id}
                          className="flex-1 bg-red-600 text-white py-2 px-3 rounded-lg text-sm font-bold hover:bg-red-700 disabled:bg-gray-400 transition-colors"
                        >
                          ✕ Rechazar
                        </button>
                      </div>
                    </div>
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