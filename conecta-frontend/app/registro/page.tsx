"use client";

import { useState } from "react";

export default function Registro() {
  const [formData, setFormData] = useState({
    nombre: "",
    email: "",
    password: "",
    rol: "estudiante",
  });
  
  const [mensaje, setMensaje] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje("Cargando...");

    try {
      const res = await fetch("http://localhost:3001/api/auth/registro", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        setMensaje("¡Usuario registrado con éxito! 🎉");
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
        <h2 className="text-3xl font-bold text-center text-blue-700 mb-6">Crear Cuenta</h2>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <input
            type="text"
            name="nombre"
            placeholder="Nombre completo"
            onChange={handleChange}
            required
            className="text-gray-900 placeholder-gray-500 bg-gray-50 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
          <select 
            name="rol" 
            onChange={handleChange} 
            className="text-gray-900 bg-gray-50 border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="estudiante">Quiero aprender (Estudiante)</option>
            <option value="tutor">Quiero enseñar (Tutor)</option>
          </select>
          
          <button 
            type="submit" 
            className="bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors mt-2 shadow-md"
          >
            Registrarse
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