"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface EstadoKyc {
  perfil_incompleto: boolean;
  tutor_id?: number;
  especialidad?: string;
  rut?: string | null;
  estado_kyc?: "no_iniciado" | "pendiente" | "aprobado" | "rechazado";
  documentos_validados?: boolean;
  sumsub_applicant_id?: string | null;
  url_documento?: string | null;
  observacion_kyc?: string | null;
  fecha_solicitud_kyc?: string | null;
}

export default function VerificacionKycTutor() {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoKyc | null>(null);
  const [rut, setRut] = useState("");
  const [urlDocumento, setUrlDocumento] = useState("");
  const [aceptaConsentimiento, setAceptaConsentimiento] = useState(false);

  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [recargar, setRecargar] = useState(0);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

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

    const obtenerEstado = async () => {
      try {
        const res = await fetch("http://localhost:3001/api/kyc/mi-estado", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!activo) return;

        if (res.status === 401 || res.status === 400) {
          localStorage.removeItem("token");
          localStorage.removeItem("usuario");
          router.push("/login");
          return;
        }

        const data: EstadoKyc = await res.json();
        if (!activo) return;

        if (res.ok) {
          setEstado(data);
          if (data.rut) setRut(data.rut);
          if (data.url_documento) setUrlDocumento(data.url_documento);
        } else {
          setMensaje({ tipo: "error", texto: "No se pudo consultar tu estado de verificación." });
        }
      } catch {
        if (activo) {
          setMensaje({ tipo: "error", texto: "Error de conexión con el servidor." });
        }
      } finally {
        if (activo) setCargando(false);
      }
    };

    obtenerEstado();

    return () => {
      activo = false;
    };
  }, [router, recargar]);

  const handleEnviarKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    if (!aceptaConsentimiento) {
      setMensaje({
        tipo: "error",
        texto: "Debes aceptar la declaración de veracidad y verificación biométrica (Sumsub).",
      });
      return;
    }

    setEnviando(true);
    setMensaje(null);

    try {
      const res = await fetch("http://localhost:3001/api/kyc/solicitar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rut,
          url_documento: urlDocumento,
        }),
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
        setMensaje({ tipo: "error", texto: data.error || "No se pudo enviar la solicitud." });
      }
    } catch {
      setMensaje({ tipo: "error", texto: "Error de conexión al enviar tus antecedentes." });
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-xl text-gray-700">Cargando estado de verificación KYC...</p>
      </main>
    );
  }

  const estadoActual = estado?.estado_kyc || "no_iniciado";

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-700">Validación de Identidad (KYC)</h1>
            <p className="text-gray-600 mt-1">
              Acredita tu identidad y formación para obtener el sello verificado en el catálogo.
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

        {estado?.perfil_incompleto ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-amber-900">Perfil profesional pendiente</h2>
            <p className="text-amber-800">
              Antes de iniciar tu verificación KYC, debes registrar tu especialidad y tarifa por hora.
            </p>
            <Link
              href="/tutor/gestion"
              className="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Ir a Perfil y Horarios
            </Link>
          </div>
        ) : (
          <section className="bg-white rounded-2xl shadow-md border border-gray-100 p-8 space-y-6">
            {/* Banner de estado actual */}
            <div className="flex items-center justify-between flex-wrap gap-3 pb-5 border-b border-gray-100">
              <div>
                <p className="text-sm font-semibold text-gray-500">Estado de Verificación</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">
                  {estadoActual === "aprobado"
                    ? "Identidad Validada"
                    : estadoActual === "pendiente"
                    ? "En Revisión por Administración"
                    : estadoActual === "rechazado"
                    ? "Solicitud Rechazada — Requiere Corrección"
                    : "No Iniciado"}
                </p>
              </div>
              <span
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase ${
                  estadoActual === "aprobado"
                    ? "bg-green-100 text-green-800"
                    : estadoActual === "pendiente"
                    ? "bg-amber-100 text-amber-800"
                    : estadoActual === "rechazado"
                    ? "bg-red-100 text-red-800"
                    : "bg-gray-200 text-gray-800"
                }`}
              >
                {estadoActual.replace("_", " ")}
              </span>
            </div>

            {/* Observación en caso de rechazo */}
            {estadoActual === "rechazado" && estado?.observacion_kyc && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-sm">
                <p className="font-bold">Motivo del rechazo:</p>
                <p className="mt-1">{estado.observacion_kyc}</p>
              </div>
            )}

            {/* Estado Aprobado */}
            {estadoActual === "aprobado" && (
              <div className="p-6 rounded-xl bg-green-50 border border-green-200 space-y-2">
                <p className="text-green-900 font-bold text-lg">
                  ✓ Tu cuenta de tutor está verificada
                </p>
                <p className="text-green-800 text-sm">
                  Los estudiantes ya ven el sello de confianza en tu tarjeta del catálogo.
                </p>
                {estado?.rut && (
                  <p className="text-green-900 text-sm">
                    <strong>RUT verificado:</strong> {estado.rut}
                  </p>
                )}
                {estado?.sumsub_applicant_id && (
                  <p className="text-green-900 text-xs font-mono">
                    ID Verificación Sumsub: {estado.sumsub_applicant_id}
                  </p>
                )}
              </div>
            )}

            {/* Estado Pendiente */}
            {estadoActual === "pendiente" && (
              <div className="p-6 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                <p className="text-amber-900 font-bold">Antecedentes recibidos</p>
                <p className="text-amber-800 text-sm">
                  Tu solicitud está en cola de validación administrativa.
                </p>
                <p className="text-amber-900 text-sm">
                  <strong>RUT:</strong> {estado?.rut}
                </p>
                <p className="text-amber-900 text-xs font-mono">
                  Referencia Sumsub: {estado?.sumsub_applicant_id}
                </p>
              </div>
            )}

            {/* Formulario para enviar o reenviar antecedentes */}
            {(estadoActual === "no_iniciado" || estadoActual === "rechazado") && (
              <form onSubmit={handleEnviarKyc} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    RUT Chileno
                  </label>
                  <input
                    type="text"
                    value={rut}
                    onChange={(e) => setRut(e.target.value)}
                    placeholder="Ej: 18.456.789-K"
                    required
                    className="w-full text-gray-900 placeholder-gray-500 bg-gray-50 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Enlace a Certificado de Título / Cédula o Antecedentes (Drive / PDF)
                  </label>
                  <input
                    type="url"
                    value={urlDocumento}
                    onChange={(e) => setUrlDocumento(e.target.value)}
                    placeholder="https://drive.google.com/file/d/..."
                    required
                    className="w-full text-gray-900 placeholder-gray-500 bg-gray-50 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <label className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aceptaConsentimiento}
                    onChange={(e) => setAceptaConsentimiento(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-blue-600"
                  />
                  <span className="text-sm text-gray-800">
                    Declaro que los antecedentes ingresados son fidedignos y autorizo su validación
                    mediante el flujo KYC (Sumsub / Administración CONECTA) conforme a la normativa
                    de protección de datos.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 disabled:bg-gray-400 transition-colors shadow-sm"
                >
                  {enviando ? "Enviando solicitud..." : "Enviar Antecedentes para Validación"}
                </button>
              </form>
            )}
          </section>
        )}
      </div>
    </main>
  );
}