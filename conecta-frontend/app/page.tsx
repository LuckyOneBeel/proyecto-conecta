export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <div className="text-center max-w-3xl">
        <h1 className="text-5xl font-bold text-blue-700 mb-6">
          Bienvenido a Conecta
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          La plataforma web para encontrar apoyo académico personalizado. Conecta con tutores, agenda tus clases y aprende en línea de forma segura.
        </p>
        <div className="flex gap-4 justify-center">
          <button className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md">
            Buscar un Tutor
          </button>
          <button className="bg-white text-blue-600 border-2 border-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors shadow-sm">
            Quiero ser Tutor
          </button>
        </div>
      </div>
    </main>
  );
}