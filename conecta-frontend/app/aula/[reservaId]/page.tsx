"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import { API_URL } from "@/app/lib/api";

interface DatosAccesoAula {
  clase: {
    reserva_id: number;
    especialidad: string | null;
    nombre_estudiante: string;
    nombre_tutor: string;
    fecha: string;
    hora_inicio: string;
    hora_fin: string;
    mi_rol: "tutor" | "estudiante";
  };
  agora: {
    modo: "simulado" | "real";
    appId: string | null;
    token: string | null;
    canal: string;
    uid: number;
  };
}

function ContenidoAulaVirtual() {
  const params = useParams();
  const router = useRouter();
  const reservaId = params.reservaId;

  const [datos, setDatos] = useState<DatosAccesoAula | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorMedia, setErrorMedia] = useState("");

  const [enLlamada, setEnLlamada] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [micActivo, setMicActivo] = useState(true);
  const [camActiva, setCamActiva] = useState(true);
  const [remotoConectado, setRemotoConectado] = useState(false);

  const videoLocalRef = useRef<HTMLVideoElement | null>(null);
  const agoraLocalRef = useRef<HTMLDivElement | null>(null);
  const agoraRemotoRef = useRef<HTMLDivElement | null>(null);

  const streamSimuladoRef = useRef<MediaStream | null>(null);
  const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
  const agoraTracksRef = useRef<{
    audio: IMicrophoneAudioTrack | null;
    video: ICameraVideoTrack | null;
  }>({ audio: null, video: null });

  const limpiarRecursos = async () => {
    if (streamSimuladoRef.current) {
      streamSimuladoRef.current.getTracks().forEach((track) => track.stop());
      streamSimuladoRef.current = null;
    }

    if (videoLocalRef.current) {
      videoLocalRef.current.srcObject = null;
    }

    if (agoraTracksRef.current.audio) {
      agoraTracksRef.current.audio.stop();
      agoraTracksRef.current.audio.close();
      agoraTracksRef.current.audio = null;
    }

    if (agoraTracksRef.current.video) {
      agoraTracksRef.current.video.stop();
      agoraTracksRef.current.video.close();
      agoraTracksRef.current.video = null;
    }

    if (agoraClientRef.current) {
      await agoraClientRef.current.leave();
      agoraClientRef.current = null;
    }
  };

  useEffect(() => {
    if (!reservaId) return;

    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    let activo = true;

    const validarAcceso = async () => {
      try {
        const res = await fetch(`${API_URL}/api/aula/acceso/${reservaId}`, {
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
          setDatos(data);
        } else {
          setError(data.error || "No se pudo ingresar al aula virtual.");
        }
      } catch {
        if (activo) {
          setError("Error de conexión al validar el acceso a la clase.");
        }
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    };

    validarAcceso();

    return () => {
      activo = false;
      void limpiarRecursos();
    };
  }, [reservaId, router]);

  const unirseALlamada = async () => {
    if (!datos) return;
    setConectando(true);
    setErrorMedia("");

    try {
      if (datos.agora.modo === "simulado") {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        streamSimuladoRef.current = stream;

        if (videoLocalRef.current) {
          videoLocalRef.current.srcObject = stream;
          await videoLocalRef.current.play();
        }

        setMicActivo(true);
        setCamActiva(true);
        setEnLlamada(true);
      } else {
        // Importación dinámica para evitar errores SSR en Next.js / Vercel
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        agoraClientRef.current = client;

        client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === "video" && agoraRemotoRef.current) {
            user.videoTrack?.play(agoraRemotoRef.current);
            setRemotoConectado(true);
          }
          if (mediaType === "audio") {
            user.audioTrack?.play();
          }
        });

        client.on("user-unpublished", (_user, mediaType) => {
          if (mediaType === "video") {
            setRemotoConectado(false);
          }
        });

        client.on("user-left", () => {
          setRemotoConectado(false);
        });

        await client.join(
          datos.agora.appId!,
          datos.agora.canal,
          datos.agora.token,
          datos.agora.uid
        );

        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        agoraTracksRef.current = { audio: audioTrack, video: videoTrack };

        if (agoraLocalRef.current) {
          videoTrack.play(agoraLocalRef.current);
        }

        await client.publish([audioTrack, videoTrack]);
        setMicActivo(true);
        setCamActiva(true);
        setEnLlamada(true);
      }
    } catch {
      setErrorMedia(
        "No se pudo acceder a tu cámara o micrófono. Revisa los permisos del navegador o verifica si tienes cámara conectada."
      );
      await limpiarRecursos();
    } finally {
      setConectando(false);
    }
  };

  const salirDeLlamada = async () => {
    await limpiarRecursos();
    setEnLlamada(false);
    setRemotoConectado(false);
  };

  const alternarMicrofono = async () => {
    const nuevoEstado = !micActivo;
    if (datos?.agora.modo === "simulado" && streamSimuladoRef.current) {
      streamSimuladoRef.current.getAudioTracks().forEach((t) => {
        t.enabled = nuevoEstado;
      });
    } else if (agoraTracksRef.current.audio) {
      await agoraTracksRef.current.audio.setEnabled(nuevoEstado);
    }
    setMicActivo(nuevoEstado);
  };

  const alternarCamara = async () => {
    const nuevoEstado = !camActiva;
    if (datos?.agora.modo === "simulado" && streamSimuladoRef.current) {
      streamSimuladoRef.current.getVideoTracks().forEach((t) => {
        t.enabled = nuevoEstado;
      });
    } else if (agoraTracksRef.current.video) {
      await agoraTracksRef.current.video.setEnabled(nuevoEstado);
    }
    setCamActiva(nuevoEstado);
  };

  const formatearFecha = (fechaIso: string) => {
    const [anio, mes, dia] = fechaIso.split("T")[0].split("-");
    return new Date(Number(anio), Number(mes) - 1, Number(dia)).toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  if (cargando) {
    return (
      <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-xl">Verificando acceso al aula virtual...</p>
      </main>
    );
  }

  if (error || !datos) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-md border border-gray-200 max-w-md">
          <h1 className="text-2xl font-bold text-red-700 mb-3">Acceso Restringido</h1>
          <p className="text-gray-700 mb-6">{error || "No fue posible cargar esta sala."}</p>
          <Link
            href="/perfil"
            className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Volver a mi Perfil
          </Link>
        </div>
      </main>
    );
  }

  const contraparte =
    datos.clase.mi_rol === "estudiante"
      ? `Tutor: ${datos.clase.nombre_tutor}`
      : `Estudiante: ${datos.clase.nombre_estudiante}`;

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Barra superior del Aula */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">
              Aula Virtual · {datos.clase.especialidad || "Tutoría Conecta"}
            </h1>
            <span className="text-xs font-mono bg-blue-900/60 text-blue-200 border border-blue-700 px-2.5 py-0.5 rounded-full">
              {datos.agora.modo === "real" ? "Agora.io En Vivo" : "Modo Prueba Local"}
            </span>
          </div>
          <p className="text-sm text-gray-300 mt-1 capitalize">
            {contraparte} · {formatearFecha(datos.clase.fecha)} ({datos.clase.hora_inicio.slice(0, 5)} -{" "}
            {datos.clase.hora_fin.slice(0, 5)} hrs)
          </p>
        </div>

        <Link
          href="/perfil"
          onClick={() => void limpiarRecursos()}
          className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-100 px-4 py-2 rounded-lg font-semibold transition-colors w-max"
        >
          ← Volver a mi Perfil
        </Link>
      </header>

      {/* Área principal de video */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-6 flex flex-col justify-center">
        {errorMedia && (
          <div className="mb-6 p-4 rounded-xl bg-red-900/50 border border-red-500 text-red-100 text-sm">
            {errorMedia}
          </div>
        )}

        {/* Pantalla previa antes de encender cámara */}
        {!enLlamada && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center max-w-xl mx-auto space-y-5">
            <div className="w-16 h-16 bg-blue-600/20 text-blue-400 rounded-full mx-auto flex items-center justify-center text-2xl font-bold">
              ▶
            </div>
            <h2 className="text-2xl font-bold">Sala Lista · Reserva #{datos.clase.reserva_id}</h2>
            <p className="text-gray-300 text-sm">
              Canal asignado: <span className="font-mono text-blue-300">{datos.agora.canal}</span>
            </p>
            <p className="text-gray-400 text-sm">
              Al unirte, tu navegador solicitará permiso para usar la cámara y el micrófono.
            </p>
            <button
              onClick={unirseALlamada}
              disabled={conectando}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-8 py-3.5 rounded-xl font-bold text-lg transition-colors shadow-lg"
            >
              {conectando ? "Conectando a la sala..." : "Unirse a la Videollamada"}
            </button>
          </div>
        )}

        {/* Grilla de Cámaras (siempre montada para vincular refs sin desfase) */}
        <div
          className={
            enLlamada ? "grid grid-cols-1 md:grid-cols-2 gap-6 w-full" : "hidden"
          }
        >
          {/* Video Local */}
          <div className="relative bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 aspect-video flex items-center justify-center">
            {datos.agora.modo === "simulado" ? (
              <video
                ref={videoLocalRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${camActiva ? "" : "hidden"}`}
              />
            ) : (
              <div
                ref={agoraLocalRef}
                className={`w-full h-full ${camActiva ? "" : "hidden"}`}
              />
            )}

            {!camActiva && (
              <p className="text-gray-400 font-semibold">Cámara desactivada</p>
            )}

            <span className="absolute bottom-3 left-3 bg-black/70 text-white text-xs font-semibold px-3 py-1 rounded-lg">
              Tú ({datos.clase.mi_rol === "tutor" ? datos.clase.nombre_tutor : datos.clase.nombre_estudiante})
            </span>
          </div>

          {/* Video Remoto (Contraparte) */}
          <div className="relative bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 aspect-video flex items-center justify-center">
            <div
              ref={agoraRemotoRef}
              className={`w-full h-full ${remotoConectado ? "" : "hidden"}`}
            />

            {!remotoConectado && (
              <div className="text-center px-6">
                <p className="text-gray-200 font-semibold text-lg">{contraparte}</p>
                <p className="text-gray-400 text-sm mt-2">
                  {datos.agora.modo === "simulado"
                    ? "En modo prueba local solo se previsualiza tu cámara. Activa AGORA_MODO=real para transmisión bidireccional."
                    : "Esperando que el otro participante se una a la sala..."}
                </p>
              </div>
            )}

            <span className="absolute bottom-3 left-3 bg-black/70 text-white text-xs font-semibold px-3 py-1 rounded-lg">
              {contraparte}
            </span>
          </div>
        </div>
      </div>

      {/* Controles de la Videollamada */}
      {enLlamada && (
        <footer className="bg-gray-900 border-t border-gray-800 py-5 px-6 flex items-center justify-center gap-4 flex-wrap">
          <button
            onClick={alternarMicrofono}
            className={`px-5 py-3 rounded-xl font-semibold transition-colors ${
              micActivo
                ? "bg-gray-800 hover:bg-gray-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            {micActivo ? "Silenciar Micrófono" : "Activar Micrófono"}
          </button>

          <button
            onClick={alternarCamara}
            className={`px-5 py-3 rounded-xl font-semibold transition-colors ${
              camActiva
                ? "bg-gray-800 hover:bg-gray-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            {camActiva ? "Apagar Cámara" : "Encender Cámara"}
          </button>

          <button
            onClick={salirDeLlamada}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold transition-colors"
          >
            Salir de la Clase
          </button>
        </footer>
      )}
    </main>
  );
}

export default function PaginaAulaVirtual() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
          <p className="text-xl">Cargando aula virtual...</p>
        </main>
      }
    >
      <ContenidoAulaVirtual />
    </Suspense>
  );
}