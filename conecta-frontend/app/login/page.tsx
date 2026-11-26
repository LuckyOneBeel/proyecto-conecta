"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/app/lib/api";

export default function Login() {
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  
  const [mensaje, setMensaje] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje("Verificando credenciales...");

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        setMensaje("¡Bienvenido! Entrando a la plataforma...");
        
        // Guardamos el token en el almacenamiento local del navegador
        localStorage.setItem("token", data.token);
        localStorage.setItem("usuario", JSON.stringify(data.usuario));
        window.dispatchEvent(new Event("conecta-auth"));
        
        // Redirigir al usuario al catálogo principal después de un momento
        setTimeout(() => {
          router.push("/"); 
        }, 1500);

      } else {
        setMensaje(`Error: ${data.error}`);
      }
    } catch (error) {
      setMensaje("Error al conectar con el servidor.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-3xl font-bold text-center text-blue-700 mb-6">Iniciar Sesión</h2>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <input
            type="email"
            name="email"
            placeholder="Correo electrónico"
            onChange={handleChange}
            required
            className="text-gray-900 placeholder-gray-500 bg-gray-50 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            name="password"
            placeholder="Contraseña"
            onChange={handleChange}
            required
            className="text-gray-900 placeholder-gray-500 bg-gray-50 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          
          <button 
            type="submit" 
            className="bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors mt-2 shadow-md"
          >
            Entrar
          </button>
        </form>
        
        {mensaje && (
          <p className="mt-6 text-center font-medium text-gray-700 bg-gray-100 p-3 rounded-lg">
            {mensaje}
          </p>
        )}
      </div>
    </main>
  );
}