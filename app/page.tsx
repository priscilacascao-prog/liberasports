'use client';

import React, { useState } from 'react';
import { LogIn, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [operatorName, setOperatorName] = useState('');

  const handleLogin = async () => {
    if (!operatorName.trim()) {
      toast.error('Por favor, informe seu nome de operador.');
      return;
    }

    setLoading(true);
    // Para simplificar e manter o padrão do libera.html, vamos usar login anônimo ou 
    // pedir para o usuário configurar o Supabase.
    // Como Supabase não tem "Anonymous Auth" por padrão da mesma forma que Firebase (precisa ativar),
    // vamos tentar um login simples ou apenas redirecionar se o usuário já estiver logado.

    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      console.error('Login error:', error);
      toast.error('Erro ao acessar o sistema. Verifique as configurações do Supabase.');
    } else {
      localStorage.setItem('libera_operator_name', operatorName.trim());
      toast.success(`Bem-vindo, ${operatorName}! Acesso concedido.`);
      router.push('/dashboard');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black z-[200] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Logo Image */}
        <div className="mb-6 flex justify-center">
          <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-[#39FF14] shadow-[0_0_30px_rgba(57,255,20,0.3)]">
            <Image
              src="/logo.png"
              alt="Libera Sports Logo"
              fill
              className="object-cover"
            />
          </div>
        </div>

        {/* Brand Text */}
        <h1 className="text-4xl font-black flex items-center justify-center gap-3 text-white mb-2 uppercase tracking-[2px] italic">
          LIBERA SPORTS
        </h1>

        <p className="text-zinc-500 mb-8 font-semibold italic">
          Vista Libera e viva a liberdade
        </p>

        {/* Auth Card */}
        <div className="bg-[#0a0a0a] p-8 rounded-3xl border border-[#39FF14] shadow-[0_0_15px_rgba(57,255,20,0.1)]">
          <div className="mb-6">
            <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500 text-left">
              Nome do Operador
            </label>
            <input
              type="text"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              placeholder="Digite seu nome..."
              className="w-full bg-[#111] border border-zinc-800 rounded-xl p-4 text-white outline-none focus:border-[#39FF14] transition-all text-sm font-bold uppercase"
            />
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-[#39FF14] text-black py-4 rounded-xl font-bold flex items-center justify-center gap-3 hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_20px_rgba(57,255,20,0.2)] disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <LogIn size={20} />}
            ACESSAR FÁBRICA
          </button>
        </div>

        {/* Footer Info */}
        <div className="mt-12 space-y-1">
          <p className="text-zinc-500 text-sm uppercase font-bold tracking-widest">
            De Goiânia-GO para o mundo
          </p>
          <p className="text-zinc-600 text-[10px] uppercase font-bold tracking-[0.2em]">
            Confecção de produtos personalizados
          </p>
        </div>
      </div>
    </div>
  );
}
