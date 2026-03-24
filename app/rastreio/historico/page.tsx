'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Package, Loader2, ArrowLeft, Calendar, Truck, Check, AlertCircle, Clock } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const statusColor = (status: string) => {
    if (status === 'PEDIDO ENTREGUE') return 'bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/30';
    if (status === 'PENDÊNCIA') return 'bg-red-500/10 text-red-500 border-red-500/30';
    return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
};

function HistoricoContent() {
    const searchParams = useSearchParams();
    const orderId = searchParams.get('id');
    const [orders, setOrders] = useState<any[]>([]);
    const [clientName, setClientName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const appId = 'libera-sports-v1';
    const ordersCollectionPath = `artifacts/${appId}/public/data/pedidos`;

    useEffect(() => {
        const fetchHistory = async () => {
            if (!orderId) {
                setError('Link inválido');
                setLoading(false);
                return;
            }

            try {
                // Buscar o pedido original para obter o client_whatsapp
                const allDocs = await getDocs(query(collection(db, ordersCollectionPath)));
                const originalDoc = allDocs.docs.find(d => d.id === orderId);

                if (!originalDoc) {
                    setError('Pedido não encontrado');
                    setLoading(false);
                    return;
                }

                const originalData = originalDoc.data();
                const whatsapp = originalData.client_whatsapp;
                setClientName(originalData.client);

                if (!whatsapp) {
                    setError('WhatsApp do cliente não encontrado');
                    setLoading(false);
                    return;
                }

                // Buscar todos os pedidos com o mesmo client_whatsapp
                const clientOrders = allDocs.docs
                    .filter(d => d.data().client_whatsapp === whatsapp)
                    .map(d => ({ id: d.id, ...d.data() }))
                    .sort((a: any, b: any) => {
                        const dateA = new Date(a.created_at || '').getTime();
                        const dateB = new Date(b.created_at || '').getTime();
                        return dateB - dateA;
                    });

                setOrders(clientOrders);
            } catch (err) {
                console.error(err);
                setError('Erro ao carregar histórico');
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [orderId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
                <Loader2 className="animate-spin text-[#39FF14] mb-4" size={48} />
                <p className="text-white font-black uppercase italic tracking-widest text-sm">Carregando histórico...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
                <Package size={60} className="text-zinc-700 mb-6" />
                <h1 className="text-2xl font-black text-white uppercase italic mb-2">Erro</h1>
                <p className="text-zinc-400 text-sm">{error}</p>
            </div>
        );
    }

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
                    <h1 className="text-xl font-black uppercase italic tracking-tight">LIBERA SPORTS</h1>
                    <p className="text-zinc-400 text-xs uppercase tracking-widest mt-1">Histórico de Pedidos</p>
                </div>

                {/* Client info */}
                <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 mb-6">
                    <p className="text-zinc-400 text-sm mb-1">Cliente</p>
                    <h2 className="text-2xl font-black uppercase italic text-[#39FF14] tracking-tight">{clientName}</h2>
                    <p className="text-zinc-400 text-sm mt-2">{orders.length} pedido{orders.length !== 1 ? 's' : ''} encontrado{orders.length !== 1 ? 's' : ''}</p>
                </div>

                {/* Voltar ao pedido */}
                <Link
                    href={`/rastreio?id=${orderId}`}
                    className="flex items-center gap-2 text-zinc-400 hover:text-[#39FF14] transition-colors mb-6 text-sm font-bold uppercase tracking-widest"
                >
                    <ArrowLeft size={16} />
                    Voltar ao pedido
                </Link>

                {/* Orders list */}
                <div className="space-y-4">
                    {orders.map((order: any) => (
                        <Link
                            key={order.id}
                            href={`/rastreio?id=${order.id}`}
                            className="block bg-zinc-950 border border-zinc-900 rounded-2xl p-5 hover:border-zinc-700 transition-colors"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <p className="text-xs text-zinc-400 font-bold uppercase">{order.order_number}</p>
                                    <p className="text-sm font-black text-white uppercase mt-0.5 break-words">{order.description}</p>
                                </div>
                                <p className="text-lg font-black text-[#39FF14] shrink-0 ml-3">
                                    R$ {Number(order.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>

                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-900">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar size={12} className="text-zinc-500" />
                                        <span className="text-xs text-zinc-400 font-semibold">
                                            {order.deadline?.split('-').reverse().join('/')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Truck size={12} className="text-zinc-500" />
                                        <span className="text-xs text-zinc-400 font-semibold">{order.delivery_method}</span>
                                    </div>
                                </div>
                                <span className={`text-[11px] font-black uppercase px-3 py-1 rounded-full border ${statusColor(order.status)}`}>
                                    {order.status === 'PEDIDO ENTREGUE' ? 'ENTREGUE' : order.status}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>

                {/* Footer */}
                <div className="text-center mt-8 space-y-1">
                    <p className="text-zinc-500 text-xs uppercase font-bold tracking-widest">
                        Libera Sports
                    </p>
                    <p className="text-zinc-600 text-[10px] uppercase tracking-[0.2em]">
                        Vista Libera e viva a liberdade
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function HistoricoPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-black flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-[#39FF14]" size={48} />
            </div>
        }>
            <HistoricoContent />
        </Suspense>
    );
}
