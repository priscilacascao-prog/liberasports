'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Package, Loader2, Truck, Calendar, Clock, Check, AlertCircle, History } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const workflow = ['PEDIDO FEITO', 'GRAFICA', 'CORTE', 'COSTURA', 'REVISAO', 'EM FASE DE ENTREGA', 'PEDIDO ENTREGUE'];
const workflowOriginal = ['PEDIDO FEITO', 'GRÁFICA', 'CORTE', 'COSTURA', 'REVISÃO', 'EM FASE DE ENTREGA', 'PEDIDO ENTREGUE'];
const stepLabels: Record<string, string> = {
    'PEDIDO FEITO': 'PEDIDO',
    'GRÁFICA': 'GRÁFICA',
    'CORTE': 'CORTE',
    'COSTURA': 'COSTURA',
    'REVISÃO': 'REVISÃO',
    'EM FASE DE ENTREGA': 'SAIU P/ ENTREGA',
    'PEDIDO ENTREGUE': 'ENTREGUE',
};

function TrackingContent() {
    const searchParams = useSearchParams();
    const orderId = searchParams.get('id');
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const appId = 'libera-sports-v1';
    const ordersCollectionPath = `artifacts/${appId}/public/data/pedidos`;

    useEffect(() => {
        const fetchOrder = async () => {
            if (!orderId) {
                setError('Link inválido');
                setLoading(false);
                return;
            }

            try {
                const q = query(collection(db, ordersCollectionPath));
                const snapshot = await getDocs(q);
                const found = snapshot.docs.find(doc => doc.id === orderId);

                if (found) {
                    setOrder({ id: found.id, ...found.data() });
                } else {
                    setError('Pedido não encontrado');
                }
            } catch (err) {
                console.error(err);
                setError('Erro ao carregar pedido');
            } finally {
                setLoading(false);
            }
        };

        fetchOrder();
        const interval = setInterval(fetchOrder, 30000);
        return () => clearInterval(interval);
    }, [orderId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
                <Loader2 className="animate-spin text-[#39FF14] mb-4" size={48} />
                <p className="text-white font-black uppercase italic tracking-widest text-sm">Carregando pedido...</p>
            </div>
        );
    }

    if (error || !order) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
                <Package size={60} className="text-zinc-700 mb-6" />
                <h1 className="text-2xl font-black text-white uppercase italic mb-2">Pedido não encontrado</h1>
                <p className="text-zinc-400 text-sm">{error || 'Verifique o link e tente novamente.'}</p>
            </div>
        );
    }

    const currentIdx = workflowOriginal.indexOf(order.status);
    const isPending = order.status === 'PENDÊNCIA';
    const isDelivered = order.status === 'PEDIDO ENTREGUE';

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-8">
            <div className="max-w-lg mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-4">
                        <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-[#39FF14] shadow-[0_0_20px_rgba(57,255,20,0.2)]">
                            <Image src="/logo.png" alt="Libera Sports" fill className="object-cover" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-black uppercase italic tracking-tight">LIBERA SPORTS</h1>
                    <p className="text-white/70 text-sm uppercase tracking-widest mt-1">Acompanhamento de Pedido</p>
                </div>

                {/* Client greeting */}
                <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 mb-6">
                    <p className="text-white/70 text-base mb-1">Olá,</p>
                    <h2 className="text-2xl font-black uppercase italic text-[#39FF14] tracking-tight">{order.client}</h2>
                    <p className="text-white/70 text-base mt-2">Aqui está o status do seu pedido:</p>
                </div>

                {/* Order info */}
                <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 mb-6">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-white/70 text-sm font-bold uppercase">Pedido</p>
                            <p className="text-xl font-black text-white">{order.order_number}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-white/70 text-sm font-bold uppercase">Valor</p>
                            <p className="text-xl font-black text-[#39FF14]">
                                R$ {Number(order.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-zinc-900">
                        <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-[#39FF14]" />
                            <div>
                                <p className="text-white/70 text-xs font-bold uppercase">Entrega prevista</p>
                                <p className="text-base font-bold text-white">{order.deadline?.split('-').reverse().join('/')}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Truck size={16} className="text-[#39FF14]" />
                            <div>
                                <p className="text-white/70 text-xs font-bold uppercase">Envio</p>
                                <p className="text-base font-bold text-white">{order.delivery_method}</p>
                            </div>
                        </div>
                    </div>

                    {order.description && (
                        <div className="mt-4 pt-4 border-t border-zinc-900">
                            <p className="text-white/70 text-xs font-bold uppercase mb-1">Descrição</p>
                            <p className="text-base text-white">{order.description}</p>
                        </div>
                    )}
                </div>

                {/* Status badge */}
                <div className={`rounded-2xl p-5 mb-6 text-center ${
                    isDelivered ? 'bg-[#39FF14]/10 border border-[#39FF14]/30' :
                    isPending ? 'bg-red-500/10 border border-red-500/30' :
                    'bg-zinc-950 border border-zinc-900'
                }`}>
                    <p className="text-white/70 text-sm font-bold uppercase mb-2">Status atual</p>
                    <p className={`text-2xl font-black uppercase italic ${
                        isDelivered ? 'text-[#39FF14]' :
                        isPending ? 'text-red-500' :
                        'text-white'
                    }`}>
                        {order.status}
                    </p>
                    {isPending && order.pending_reason && (
                        <p className="text-red-400 text-sm mt-2">{order.pending_reason}</p>
                    )}
                    {isDelivered && (
                        <div className="flex items-center justify-center gap-2 mt-2 text-[#39FF14]">
                            <Check size={18} />
                            <span className="text-sm font-bold">Seu pedido foi entregue!</span>
                        </div>
                    )}
                </div>

                {/* Stepper */}
                {!isPending && (
                    <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 mb-6">
                        <p className="text-white/70 text-sm font-bold uppercase mb-6 text-center">Evolução do Pedido</p>
                        <div className="space-y-0">
                            {workflowOriginal.map((step, idx) => {
                                const isCompleted = idx < currentIdx;
                                const isCurrent = idx === currentIdx;
                                const isFuture = idx > currentIdx;

                                return (
                                    <div key={step} className="flex items-start gap-4">
                                        <div className="flex flex-col items-center">
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                                isCompleted ? 'bg-[#39FF14] border-[#39FF14]' :
                                                isCurrent ? 'bg-orange-500 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]' :
                                                'bg-zinc-900 border-zinc-700'
                                            }`}>
                                                {isCompleted && <Check size={10} className="text-black" />}
                                            </div>
                                            {idx < workflowOriginal.length - 1 && (
                                                <div className={`w-0.5 h-8 ${isCompleted ? 'bg-[#39FF14]' : 'bg-zinc-800'}`} />
                                            )}
                                        </div>
                                        <div className="pb-6">
                                            <p className={`text-base font-black uppercase ${
                                                isCurrent ? 'text-orange-500' :
                                                isCompleted ? 'text-[#39FF14]' :
                                                'text-white'
                                            }`}>
                                                {stepLabels[step] || step}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Historico button */}
                <Link
                    href={`/rastreio/historico?id=${orderId}`}
                    className="block bg-zinc-950 border border-zinc-900 rounded-2xl p-5 mb-6 text-center hover:border-zinc-700 transition-colors"
                >
                    <div className="flex items-center justify-center gap-3">
                        <History size={20} className="text-[#39FF14]" />
                        <span className="text-sm font-black uppercase italic tracking-widest text-white">Ver histórico de pedidos</span>
                    </div>
                    <p className="text-white text-sm mt-2">Veja todos os seus pedidos anteriores</p>
                </Link>

                {/* Voltar / Fechar */}
                <button
                    onClick={() => window.close()}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-2xl p-4 mb-6 text-center hover:border-zinc-700 transition-colors"
                >
                    <span className="text-sm font-black uppercase tracking-widest text-white">Fechar</span>
                </button>

                {/* Footer */}
                <div className="text-center mt-8 space-y-1">
                    <p className="text-white/60 text-xs uppercase font-bold tracking-widest">
                        Libera Sports
                    </p>
                    <p className="text-white/50 text-[11px] uppercase tracking-[0.2em]">
                        Vista Libera e viva a liberdade
                    </p>
                    <p className="text-white/40 text-[10px] mt-3">
                        Atualiza automaticamente a cada 30 segundos
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function RastreioPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-black flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-[#39FF14]" size={48} />
            </div>
        }>
            <TrackingContent />
        </Suspense>
    );
}
