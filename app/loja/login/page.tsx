'use client';

import React, { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';

const appId = 'libera-sports-v1';
const clientesPath = `artifacts/${appId}/public/data/clientes`;

export default function LojaLoginPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [authLoading, setAuthLoading] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [cpfCnpj, setCpfCnpj] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                const clientDoc = await getDoc(doc(db, clientesPath, user.uid));
                if (clientDoc.exists()) {
                    router.push('/loja');
                }
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [router]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !password.trim()) { toast.error('Preencha todos os campos'); return; }
        if (isRegistering && !name.trim()) { toast.error('Informe seu nome'); return; }

        setAuthLoading(true);
        try {
            if (isRegistering) {
                const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
                await setDoc(doc(db, clientesPath, cred.user.uid), {
                    name: name.trim().toUpperCase(),
                    email: email.trim().toLowerCase(),
                    whatsapp: whatsapp.trim(),
                    cpf_cnpj: cpfCnpj.replace(/\D/g, ''),
                    created_at: new Date().toISOString(),
                });
                toast.success('Conta criada com sucesso!');
                router.push('/loja');
            } else {
                await signInWithEmailAndPassword(auth, email.trim(), password);
                toast.success('Login realizado!');
                router.push('/loja');
            }
        } catch (error: any) {
            let message = 'Erro na autenticação.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') message = 'E-mail ou senha incorretos.';
            else if (error.code === 'auth/email-already-in-use') message = 'Este e-mail já está em uso.';
            else if (error.code === 'auth/weak-password') message = 'Senha deve ter pelo menos 6 caracteres.';
            toast.error(message);
        } finally {
            setAuthLoading(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="animate-spin text-black" size={40} /></div>;

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-xl border border-gray-100">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-4">
                        <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-black">
                            <Image src="/logo.png" alt="Libera Sports" fill className="object-cover" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-black uppercase italic text-black">Libera Sports</h1>
                    <p className="text-gray-500 text-sm mt-1">{isRegistering ? 'Crie sua conta para comprar' : 'Entre na sua conta'}</p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                    {isRegistering && (
                        <>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Seu Nome</label>
                                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo"
                                    className="w-full border border-gray-200 rounded-xl p-3 text-black outline-none focus:border-black transition-colors text-sm font-medium" required />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1">WhatsApp</label>
                                    <input type="text" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="(00) 00000-0000"
                                        className="w-full border border-gray-200 rounded-xl p-3 text-black outline-none focus:border-black transition-colors text-sm font-medium" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1">CPF/CNPJ</label>
                                    <input type="text" value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} placeholder="000.000.000-00"
                                        className="w-full border border-gray-200 rounded-xl p-3 text-black outline-none focus:border-black transition-colors text-sm font-medium" />
                                </div>
                            </div>
                        </>
                    )}
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">E-mail</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com"
                            className="w-full border border-gray-200 rounded-xl p-3 text-black outline-none focus:border-black transition-colors text-sm font-medium" required />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Senha</label>
                        <div className="relative">
                            <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••"
                                className="w-full border border-gray-200 rounded-xl p-3 pr-12 text-black outline-none focus:border-black transition-colors text-sm font-medium" required />
                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors">
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    {!isRegistering && (
                        <button type="button" onClick={async () => {
                            if (!email.trim()) { toast.error('Digite seu e-mail primeiro'); return; }
                            try {
                                await sendPasswordResetEmail(auth, email.trim());
                                toast.success('E-mail de redefinição de senha enviado!');
                            } catch {
                                toast.error('E-mail não encontrado');
                            }
                        }} className="text-sm text-gray-500 hover:text-black font-medium transition-colors">
                            Esqueci minha senha
                        </button>
                    )}
                    <button type="submit" disabled={authLoading}
                        className="w-full bg-black text-white py-3 rounded-xl font-bold uppercase text-sm hover:bg-gray-900 transition-colors disabled:opacity-50">
                        {authLoading ? 'Aguarde...' : isRegistering ? 'Criar Conta' : 'Entrar'}
                    </button>
                </form>

                <p className="text-center text-sm text-gray-500 mt-6">
                    {isRegistering ? 'Já tem conta?' : 'Não tem conta?'}{' '}
                    <button onClick={() => setIsRegistering(!isRegistering)} className="text-black font-bold hover:underline">
                        {isRegistering ? 'Faça login' : 'Cadastre-se'}
                    </button>
                </p>
            </div>
        </div>
    );
}
