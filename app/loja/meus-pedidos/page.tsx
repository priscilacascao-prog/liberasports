'use client';

import React, { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, getDocs } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Loader2, Package, ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const appId = 'libera-sports-v1';
const salesPath = `artifacts/${appId}/public/data/vendas`;

const statusColor = (status: string) => {
    if (status === 'PEDIDO ENTREGUE') return 'bg-green-100 text-green-700';
    if (status === 'AGUARDANDO APROVAÇÃO') return 'bg-yellow-100 text-yellow-700';
    if (status === 'PENDÊNCIA') return 'bg-red-100 text-red-700';
    return 'bg-blue-100 text-blue-700';
};

export default function MeusPedidosPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState<any[]>([]);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            if (!u) { router.push('/loja/login'); return; }
            setUser(u);

            const snap = await getDocs(query(collection(db, salesPath)));
            const myOrders = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter((s: any) => s.client_uid === u.uid)
                .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setOrders(myOrders);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [router]);

    if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="animate-spin text-black" size={40} /></div>;

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
                <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/loja" className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></Link>
                        <h1 className="text-lg font-black uppercase">Meus Pedidos</h1>
                    </div>
                    <div className="relative w-8 h-8 rounded-full overflow-hidden border border-black">
                        <Image src="/logo.png" alt="Libera Sports" fill className="object-cover" />
                    </div>
                </div>
            </header>

            <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
                {orders.length === 0 ? (
                    <div className="text-center py-20">
                        <Package size={48} className="text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-400 font-bold">Nenhum pedido realizado</p>
                        <Link href="/loja" className="inline-block mt-4 bg-black text-white px-6 py-2 rounded-xl text-sm font-bold">Ir para a Loja</Link>
                    </div>
                ) : (
                    orders.map((order: any) => (
                        <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <p className="text-xs text-gray-400 font-bold uppercase">{order.order_number}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
                                </div>
                                <span className={`text-[11px] font-bold uppercase px-3 py-1 rounded-full ${statusColor(order.status)}`}>
                                    {order.status}
                                </span>
                            </div>
                            <div className="space-y-1 mb-3">
                                {order.items && order.items.length > 0 ? (
                                    order.items.map((item: any, idx: number) => (
                                        <p key={idx} className="text-sm text-gray-600">{item.quantity}x {item.name}</p>
                                    ))
                                ) : (
                                    order.description && <p className="text-sm text-gray-600">{order.description}</p>
                                )}
                            </div>
                            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                                <p className="text-lg font-black">R$ {(order.total || order.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                {order.status !== 'AGUARDANDO APROVAÇÃO' && (
                                    <Link href={`/rastreio?id=${order.id}`} className="flex items-center gap-1 text-sm font-bold text-black hover:underline">
                                        Rastrear <ExternalLink size={14} />
                                    </Link>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
