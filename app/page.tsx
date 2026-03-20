'use client';

import React, { useState, useEffect } from 'react';
import { LogIn, UserPlus, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [operatorName, setOperatorName] = useState('');

  // Check initial session
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/dashboard');
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Por favor, preencha todos os campos.');
      return;
    }

    if (isRegistering && !operatorName.trim()) {
      toast.error('Por favor, informe seu nome de operador.');
      return;
    }

    setAuthLoading(true);

    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        localStorage.setItem('libera_operator_name', operatorName.trim());
        toast.success(`Conta criada com sucesso! Bem-vindo, ${operatorName}.`);
        router.push('/dashboard');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        toast.success('Login realizado com sucesso!');
        router.push('/dashboard');
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      let message = 'Ocorreu um erro na autenticação.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        message = 'E-mail ou senha incorretos.';
      } else if (error.code === 'auth/email-already-in-use') {
        message = 'Este e-mail já está em uso.';
      } else if (error.code === 'auth/weak-password') {
        message = 'A senha deve ter pelo menos 6 caracteres.';
      }
      toast.error(message);
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black z-[200] flex flex-col items-center justify-center p-4">
        <Loader2 className="animate-spin text-[#39FF14] mb-4" size={48} />
        <p className="text-[#39FF14] font-black uppercase italic tracking-widest text-xs">Preparando Fábrica...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-[200] flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full text-center py-8">
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
        <form onSubmit={handleAuth} className="bg-[#0a0a0a] p-8 rounded-3xl border border-[#39FF14] shadow-[0_0_15px_rgba(57,255,20,0.1)] text-left">
          <h2 className="text-white font-black uppercase italic mb-6 text-xl tracking-tighter">
            {isRegistering ? 'Criar Nova Conta' : 'Acessar Fábrica'}
          </h2>

          <div className="space-y-4">
            {isRegistering && (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">
                  Nome do Operador
                </label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="Seu nome..."
                  className="w-full bg-[#111] border border-zinc-800 rounded-xl p-4 text-white outline-none focus:border-[#39FF14] transition-all text-sm font-bold uppercase"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="exemplo@email.com"
                className="w-full bg-[#111] border border-zinc-800 rounded-xl p-4 text-white outline-none focus:border-[#39FF14] transition-all text-sm font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#111] border border-zinc-800 rounded-xl p-4 text-white outline-none focus:border-[#39FF14] transition-all text-sm font-bold"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={authLoading}
            className="w-full bg-[#39FF14] text-black py-4 rounded-xl font-bold flex items-center justify-center gap-3 hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_20px_rgba(57,255,20,0.2)] disabled:opacity-50 mt-8"
          >
            {authLoading ? <Loader2 className="animate-spin" size={20} /> : (isRegistering ? <UserPlus size={20} /> : <LogIn size={20} />)}
            {isRegistering ? 'CRIAR CONTA' : 'ENVIAR ACESSO'}
          </button>

          <button
            type="button"
            onClick={() => setIsRegistering(!isRegistering)}
            className="w-full text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-6 hover:text-white transition-colors text-center"
          >
            {isRegistering ? 'Já tenho uma conta? Faça Login' : 'Não tem conta? Crie uma aqui'}
          </button>
        </form>

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
