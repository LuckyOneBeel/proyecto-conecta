"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/app/lib/api";

interface EstadoKyc {
  perfil_incompleto: boolean;
  modo_sumsub?: "simulado" | "real";
  tutor_id?: number;
  especialidad?: string;
  rut?: string | null;
  estado_kyc?: "no_iniciado" | "pendiente" | "aprobado" | "rechazado";
  documentos_validados?: boolean;
  sumsub_applicant_id?: string | null;
  url_documento?: string | null;
  observacion_kyc?: string | null;
  fecha_solicitud_kyc?: string | null;
  sumsub_veredicto?: string | null;
}

export default function VerificacionKycTutor() {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoKyc | null>(null);
  const [rut, setRut] = useState("");
  const [urlDocumento, setUrlDocumento] = useState("");
  const [aceptaConsentimiento, setAceptaConsentimiento] = useState(false);

  const [sdkToken, setSdkToken] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [recargar, setRecargar] = useState(0);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

  // 1. Consultar estado KYC actual del tutor
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
        const res = await fetch(`${API_URL}/api/kyc/mi-estado`, {
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

  // 2. Montar el verificador visual de Sumsub WebSDK cuando exista sdkToken
  useEffect(() => {
    if (!sdkToken) return;

    let activo = true;

    const montarSumsubSdk = async () => {
      try {
        const snsWebSdk = (await import("@sumsub/websdk")).default;
        if (!activo) return;

        const contenedor = document.getElementById("sumsub-websdk-container");
        if (!contenedor) return;
        contenedor.innerHTML = "";

        const renovarToken = async (): Promise<string> => {
          const jwt = localStorage.getItem("token");
          if (!jwt) return "";
          const res = await fetch("http://localhost:3001/api/kyc/sdk-token", {
            method: "POST",
            headers: { Authorization: `Bearer ${jwt}` },
          });
          const data = await res.json();
          return data.sdkToken || "";
        };
        
        const usuarioLocal = JSON.parse(localStorage.getItem("usuario") || "{}");

        const instancia = snsWebSdk
          .init(sdkToken, renovarToken)
          .withConf({ lang: "es", email: usuarioLocal.email || undefined })
          .withOptions({ addViewportTag: false, adaptIframeHeight: true })
          .onMessage((type: string, payload: unknown) => {
            if (!activo) return;

            if (type === "idCheck.onApplicantSubmitted") {
              setMensaje({
                tipo: "exito",
                texto:
                  "Documentos y selfie enviados a Sumsub Sandbox. Presiona 'Sincronizar Resultado' cuando finalice la revisión.",
              });
            }

            if (type === "idCheck.onApplicantStatusChanged") {
              const info = payload as { reviewStatus?: string } | null;
              if (info?.reviewStatus === "completed") {
                setMensaje({
                  tipo: "exito",
                  texto:
                    "Sumsub completó la revisión en Sandbox. Presiona 'Sincronizar Resultado' para actualizar tu perfil.",
                });
              }
            }
          })
          .build();

        instancia.launch("#sumsub-websdk-container");
      } catch {
        if (activo) {
          setMensaje({
            tipo: "error",
            texto: "No se pudo inicializar el verificador visual de Sumsub.",
          });
        }
      }
    };

    montarSumsubSdk();

    return () => {
      activo = false;
      const contenedor = document.getElementById("sumsub-websdk-container");
      if (contenedor) contenedor.innerHTML = "";
    };
  }, [sdkToken]);

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
        if (data.sdkToken) {
          setSdkToken(data.sdkToken);
        }
        setRecargar((prev) => prev + 1);
      } else {
        setMensaje({
          tipo: "error",
          texto: data.detalle ? `${data.error} (${data.detalle})` : data.error || "No se pudo enviar la solicitud.",
        });
      }
    } catch {
      setMensaje({ tipo: "error", texto: "Error de conexión al enviar tus antecedentes." });
    } finally {
      setEnviando(false);
    }
  };

  const abrirVerificadorSumsub = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    setEnviando(true);
    setMensaje(null);

    try {
      const res = await fetch("http://localhost:3001/api/kyc/sdk-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (res.status === 401 || data.error?.includes("Token")) {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        router.push("/login");
        return;
      }

      if (res.ok && data.sdkToken) {
        setSdkToken(data.sdkToken);
      } else {
        setMensaje({
          tipo: "error",
          texto: data.detalle ? `${data.error} (${data.detalle})` : data.error || "No se pudo abrir el verificador.",
        });
      }
    } catch {
      setMensaje({ tipo: "error", texto: "Error de conexión al solicitar el token de Sumsub." });
    } finally {
      setEnviando(false);
    }
  };

  const sincronizarConSumsub = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    setSincronizando(true);
    setMensaje(null);

    try {
      const res = await fetch("http://localhost:3001/api/kyc/sincronizar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (res.status === 401 || data.error?.includes("Token")) {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        router.push("/login");
        return;
      }

      if (res.ok) {
        setMensaje({
          tipo: data.estado_kyc === "rechazado" ? "error" : "exito",
          texto: data.mensaje,
        });
        if (data.estado_kyc === "aprobado" || data.sumsub_veredicto === "GREEN") {
          setSdkToken(null);
        }
        setRecargar((prev) => prev + 1);
      } else {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo sincronizar el estado." });
      }
    } catch {
      setMensaje({ tipo: "error", texto: "Error de conexión al sincronizar con Sumsub." });
    } finally {
      setSincronizando(false);
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
  const esModoReal = estado?.modo_sumsub === "real";

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-blue-700">Validación de Identidad (KYC)</h1>
              <span className="text-xs font-mono bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-full font-semibold">
                {esModoReal ? "Sumsub Sandbox En Vivo" : "Modo Prueba Local"}
              </span>
            </div>
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
          <>
            <section className="bg-white rounded-2xl shadow-md border border-gray-100 p-8 space-y-6">
              {/* Banner de estado actual */}
              <div className="flex items-center justify-between flex-wrap gap-3 pb-5 border-b border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-500">Estado de Verificación</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">
                    {estadoActual === "aprobado"
                      ? "Identidad Validada"
                      : estadoActual === "pendiente"
                      ? esModoReal
                        ? "Pendiente de Verificación Biométrica / Revisión"
                        : "En Revisión por Administración"
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
                <div className="p-6 rounded-xl bg-amber-50 border border-amber-200 space-y-4">
                  <div className="space-y-1">
                    <p className="text-amber-900 font-bold">Antecedentes registrados</p>
                    <p className="text-amber-800 text-sm">
                      {esModoReal
                        ? "Completa la captura de documento y selfie en el verificador de Sumsub, y luego sincroniza tu resultado."
                        : "Tu solicitud está en cola de validación administrativa."}
                    </p>
                    <p className="text-amber-900 text-sm pt-1">
                      <strong>RUT:</strong> {estado?.rut}
                    </p>
                    {estado?.sumsub_applicant_id && (
                      <p className="text-amber-900 text-xs font-mono">
                        ID Candidato Sumsub: {estado.sumsub_applicant_id}
                      </p>
                    )}
                  </div>

                  {esModoReal && (
                    <div className="flex flex-wrap gap-3 pt-2">
                      {!sdkToken && (
                        <button
                          onClick={abrirVerificadorSumsub}
                          disabled={enviando}
                          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                        >
                          {enviando ? "Cargando Sumsub..." : "Abrir Verificador Biométrico (Sumsub)"}
                        </button>
                      )}

                      <button
                        onClick={sincronizarConSumsub}
                        disabled={sincronizando}
                        className="bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                      >
                        {sincronizando ? "Consultando Sumsub..." : "Sincronizar Resultado desde Sumsub"}
                      </button>
                    </div>
                  )}
                    {estado?.sumsub_veredicto === "GREEN" && (
                      <p className="text-sm font-semibold text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2">
                        ✓ Biometría verificada por Sumsub (GREEN). Pendiente de aprobación académica en Administración.
                      </p>
                    )}
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
                      Enlace a Certificado de Título / Antecedentes (Drive / PDF)
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
                    {enviando
                      ? "Conectando con Sumsub..."
                      : esModoReal
                      ? "Registrar y Abrir Verificador Biométrico Sumsub"
                      : "Enviar Antecedentes para Validación"}
                  </button>
                </form>
              )}
            </section>

            {/* Contenedor embebido de Sumsub WebSDK */}
            {sdkToken && (
              <section className="bg-white rounded-2xl shadow-md border-2 border-blue-200 overflow-hidden">
                <div className="bg-blue-700 px-6 py-4 text-white flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold">Verificación Biométrica Sumsub (Sandbox)</h2>
                    <p className="text-blue-100 text-xs">
                      Nivel activo: id-and-liveness · Documento de identidad + prueba de vivacidad
                    </p>
                  </div>
                  <button
                    onClick={() => setSdkToken(null)}
                    className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
                <div id="sumsub-websdk-container" className="min-h-[540px] w-full p-2 bg-white" />
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}