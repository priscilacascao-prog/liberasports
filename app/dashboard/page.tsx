'use client';

import React, { useEffect, useState } from 'react';
import {
    LayoutDashboard, Plus, Search, Calendar, Package,
    ArrowRight, Check, AlertCircle, Clock, X, LogOut,
    TrendingUp, Truck, User, History, MessageSquare, Info, Filter,
    Loader2, ChevronDown, ChevronUp, MessageCircle, Pencil, FileText, Trash2
} from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection, doc, addDoc, updateDoc, deleteDoc,
    onSnapshot, query, orderBy, serverTimestamp,
    getDoc, setDoc, getDocs
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const workflow = ["PEDIDO FEITO", "GRÁFICA", "CORTE", "COSTURA", "REVISÃO", "EM FASE DE ENTREGA", "PEDIDO ENTREGUE"];
const displayWorkflow = ["PEDIDO FEITO", "GRÁFICA", "CORTE", "COSTURA", "REVISÃO", "EM FASE DE ENTREGA", "PENDÊNCIA", "PEDIDO ENTREGUE"];

const addBusinessDays = (startDate: Date, days: number) => {
    let date = new Date(startDate);
    let addedDays = 0;
    while (addedDays < days) {
        date.setDate(date.getDate() + 1);
        if (date.getDay() !== 0 && date.getDay() !== 6) {
            addedDays++;
        }
    }
    return date.toISOString().split('T')[0];
};

export default function DashboardPage() {
    const router = useRouter();

    // Core App State
    const [operatorName, setOperatorName] = useState('');
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [authChecking, setAuthChecking] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Form State
    const [client, setClient] = useState('');
    const [clientWhatsapp, setClientWhatsapp] = useState('');
    const [value, setValue] = useState('');
    const [deadline, setDeadline] = useState<string>(addBusinessDays(new Date(), 20));
    const [deliveryMethod, setDeliveryMethod] = useState<'MOTOBOY' | 'TRANSPORTADORA' | 'RETIRADA'>('MOTOBOY');
    const [description, setDescription] = useState('');

    // Configurações do AppId para o caminho solicitado
    const appId = 'libera-sports-v1';
    const ordersCollectionPath = `artifacts/${appId}/public/data/pedidos`;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);
    const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
    const [pendingReason, setPendingReason] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<string | null>(null);
    const [editingObsId, setEditingObsId] = useState<string | null>(null);
    const [obsValue, setObsValue] = useState('');
    const [expandedObs, setExpandedObs] = useState<Record<string, boolean>>({});
    const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});
    const [expandedHistoryIds, setExpandedHistoryIds] = useState<Record<string, boolean>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [nextOrderNumber, setNextOrderNumber] = useState('');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user: any) => {
            if (!user) {
                router.push('/');
            } else {
                setUserId(user.uid);
                const storedName = localStorage.getItem('libera_operator_name');
                setOperatorName(storedName || 'Operador');
                setAuthChecking(false);
            }
        });

        return () => unsubscribe();
    }, [router]);

    // Real-time Orders Fetching
    useEffect(() => {
        if (authChecking) return;

        const q = query(collection(db, ordersCollectionPath), orderBy('created_at', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const ordersData = snapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data()
            }));
            setOrders(ordersData);
            setLoading(false);
        }, (error: any) => {
            console.error("Firestore error:", error);
            toast.error("Erro ao sincronizar dados em tempo real.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [authChecking]);

    useEffect(() => {
        if (isModalOpen) {
            updateNextOrderNumber();
        }
    }, [isModalOpen]);

    const updateNextOrderNumber = async () => {
        try {
            const lastOrderQuery = query(collection(db, ordersCollectionPath), orderBy('order_number', 'desc'), orderBy('created_at', 'desc'));
            const querySnapshot = await getDocs(lastOrderQuery); // Use getDocs for a one-time fetch
            if (!querySnapshot.empty) {
                const lastOrder = querySnapshot.docs[0].data();
                const lastNumber = parseInt(lastOrder.order_number.replace('LIBERA-', ''));
                setNextOrderNumber(`LIBERA-${String(lastNumber + 1).padStart(4, '0')}`);
            } else {
                setNextOrderNumber('LIBERA-0001');
            }
        } catch (error) {
            console.error('Error getting next order number:', error);
            setNextOrderNumber('LIBERA-0001');
        }
    };

    const fetchOrders = async () => {
        setLoading(true);
        // This function is no longer used directly for fetching, as onSnapshot handles real-time.
        // It might be kept for manual refresh if needed, but for now, it's a placeholder.
        // The real-time listener in useEffect handles updates.
        setLoading(false);
    };

    const handleUpdateObservations = async (id: string) => {
        setLoading(true);
        try {
            const orderRef = doc(db, ordersCollectionPath, id);
            await updateDoc(orderRef, { observations: obsValue });
            setEditingObsId(null);
            toast.success('Observações atualizadas!');
        } catch (error) {
            console.error('Error updating observations:', error);
            toast.error('Erro ao atualizar observações');
        } finally {
            setLoading(false);
        }
    };

    const generateOrderNumber = async () => {
        const year = new Date().getFullYear().toString().slice(-2);
        // Fetch orders from this year to count
        const q = query(collection(db, ordersCollectionPath), orderBy('created_at', 'desc'));
        const querySnapshot = await getDocs(q); // Use getDocs for a one-time fetch
        const count = querySnapshot.docs.filter(doc => new Date(doc.data().created_at?.toDate()).getFullYear() === new Date().getFullYear()).length;

        const sequence = count + 1;
        const paddedSequence = sequence.toString().padStart(2, '0');
        return `#${year}${paddedSequence}`;
    };

    const advanceStep = async (orderId: string, currentStatus: string) => {
        const currentIndex = workflow.indexOf(currentStatus);
        if (currentIndex < workflow.length - 1) {
            const nextStatus = workflow[currentIndex + 1];
            setLoading(true);
            try {
                const orderRef = doc(db, ordersCollectionPath, orderId);
                const orderSnap = await getDoc(orderRef);
                const orderData = orderSnap.data();

                const newLog = {
                    id: crypto.randomUUID(),
                    old_status: currentStatus,
                    new_status: nextStatus,
                    operator_name: operatorName,
                    created_at: new Date().toISOString()
                };

                await updateDoc(orderRef, {
                    status: nextStatus,
                    order_logs: [...(orderData?.order_logs || []), newLog]
                });

                toast.success(`Pedido avançado para ${nextStatus}`);
            } catch (error) {
                console.error('Error advancing step:', error);
                toast.error('Erro ao atualizar status');
            } finally {
                setLoading(false);
            }
        }
    };

    const updateStatus = async (id: string, nextStatus: string, currentStatus: string, reason?: string) => {
        setLoading(true);
        try {
            const orderRef = doc(db, ordersCollectionPath, id);
            const orderSnap = await getDoc(orderRef);
            const orderData = orderSnap.data();

            const newLog = {
                id: crypto.randomUUID(),
                old_status: currentStatus,
                new_status: nextStatus,
                operator_name: operatorName,
                created_at: new Date().toISOString(),
                reason: reason || null
            };

            const updateData: any = {
                status: nextStatus,
                order_logs: [...(orderData?.order_logs || []), newLog]
            };

            await updateDoc(orderRef, updateData);

            toast.success(`Pedido movido para ${nextStatus}`);
            if (nextStatus === 'PEDIDO ENTREGUE') toast.success('Pedido finalizado com sucesso! 🚀');
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Erro ao atualizar status');
        } finally {
            setLoading(false);
        }
    };

    const handleValueChange = (val: string) => {
        // Remove tudo que não é dígito
        const cleanValue = val.replace(/\D/g, '');
        if (!cleanValue) {
            setValue('');
            return;
        }

        // Converte para centavos e então para decimal com vírgula
        const numericValue = parseInt(cleanValue) / 100;
        const formattedValue = numericValue.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        setValue(formattedValue);
    };

    const handlePendingSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pendingOrderId || !pendingReason.trim()) return;

        setLoading(true);
        try {
            const orderRef = doc(db, ordersCollectionPath, pendingOrderId);
            const orderSnap = await getDoc(orderRef);
            const orderData = orderSnap.data();

            const newLog = {
                id: crypto.randomUUID(),
                old_status: orderData?.status || 'UNKNOWN',
                new_status: 'PENDÊNCIA',
                operator_name: operatorName,
                created_at: new Date().toISOString(),
                reason: pendingReason
            };

            await updateDoc(orderRef, {
                status: 'PENDÊNCIA',
                order_logs: [...(orderData?.order_logs || []), newLog]
            });

            toast.warning('Pedido movido para PENDÊNCIA');
            setIsPendingModalOpen(false);
            setPendingOrderId(null);
            setPendingReason('');
        } catch (error) {
            console.error('Error setting pending:', error);
            toast.error('Erro ao registrar pendência');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!client || !value || !deadline) {
            toast.error('Preencha todos os campos obrigatórios');
            return;
        }

        if (!userId) {
            toast.error('Sessão expirada. Por favor, entre novamente.');
            router.push('/');
            return;
        }

        setLoading(true);

        try {
            // Remove pontos de milhar e troca vírgula por ponto para o Firestore
            const normalizedValue = value.replace(/\./g, '').replace(',', '.');

            const newOrder = {
                order_number: nextOrderNumber,
                client,
                client_whatsapp: clientWhatsapp,
                value: parseFloat(normalizedValue),
                deadline: deadline,
                delivery_method: deliveryMethod,
                status: 'PEDIDO FEITO',
                description,
                user_id: userId,
                operator_name: operatorName,
                created_at: new Date().toISOString(),
                order_logs: [
                    {
                        id: crypto.randomUUID(),
                        old_status: 'INÍCIO',
                        new_status: 'PEDIDO FEITO',
                        operator_name: operatorName,
                        created_at: new Date().toISOString()
                    }
                ]
            };

            await addDoc(collection(db, ordersCollectionPath), newOrder);

            toast.success('Pedido criado com sucesso!');
            setIsModalOpen(false);
            resetForm();
        } catch (err: any) {
            console.error('Unexpected save error:', err);
            toast.error('Ocorreu um erro inesperado ao salvar');
        } finally {
            setLoading(false);
        }
    };

    const handlePrintOrder = (order: any) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const html = `
            <html>
                <head>
                    <title>Pedido ${order.order_number} - Libera Sports</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
                        body { 
                            font-family: 'Inter', sans-serif; 
                            padding: 40px; 
                            color: #111;
                            background: white;
                        }
                        .header { 
                            display: flex; 
                            justify-content: space-between; 
                            align-items: center;
                            border-bottom: 4px solid #39FF14;
                            padding-bottom: 20px;
                            margin-bottom: 40px;
                        }
                        .logo { 
                            font-size: 32px; 
                            font-weight: 900; 
                            font-style: italic;
                            color: black;
                        }
                        .os-title {
                            text-align: right;
                        }
                        .os-title h1 { margin: 0; font-size: 24px; font-weight: 900; }
                        .os-title p { margin: 5px 0 0; font-size: 12px; color: #666; font-weight: 700; }
                        
                        .section { margin-bottom: 30px; }
                        .section-title { 
                            font-size: 10px; 
                            font-weight: 900; 
                            text-transform: uppercase; 
                            letter-spacing: 0.1em;
                            color: #666;
                            margin-bottom: 10px;
                            border-bottom: 1px solid #eee;
                            padding-bottom: 5px;
                        }
                        
                        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                        .info-block { margin-bottom: 15px; }
                        .info-label { font-size: 10px; font-weight: 700; color: #999; text-transform: uppercase; }
                        .info-value { font-size: 16px; font-weight: 700; margin-top: 2px; }
                        
                        .description-box {
                            background: #f9f9f9;
                            padding: 20px;
                            border-radius: 10px;
                            white-space: pre-wrap;
                            font-size: 14px;
                            line-height: 1.6;
                            border: 1px solid #eee;
                        }
                        
                        .footer {
                            margin-top: 60px;
                            padding-top: 20px;
                            border-top: 1px solid #eee;
                            font-size: 10px;
                            color: #999;
                            text-align: center;
                        }

                        @media print {
                            body { padding: 20px; }
                            button { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="logo">LIBERA SPORTS</div>
                        <div class="os-title">
                            <h1>ORDEM DE SERVIÇO</h1>
                            <p>${order.order_number}</p>
                        </div>
                    </div>

                    <div class="section">
                        <div class="section-title">Informações do Cliente</div>
                        <div class="grid">
                            <div class="info-block">
                                <div class="info-label">Cliente</div>
                                <div class="info-value">${order.client}</div>
                            </div>
                            <div class="info-block">
                                <div class="info-label">WhatsApp</div>
                                <div class="info-value">${order.client_whatsapp || 'Não informado'}</div>
                            </div>
                        </div>
                    </div>

                    <div class="section">
                        <div class="section-title">Detalhes da Entrega</div>
                        <div class="grid">
                            <div class="info-block">
                                <div class="info-label">📅 Data de Entrega</div>
                                <div class="info-value">${new Date(order.deadline).toLocaleDateString('pt-BR')}</div>
                            </div>
                            <div class="info-block">
                                <div class="info-label">🚚 Método de Entrega</div>
                                <div class="info-value">${order.delivery_method}</div>
                            </div>
                        </div>
                    </div>

                    <div class="section">
                        <div class="section-title">Grade e Descrição do Pedido</div>
                        <div class="description-box">${order.description}</div>
                    </div>

                    ${order.observations ? `
                    <div class="section">
                        <div class="section-title">Observações Internas</div>
                        <div class="description-box" style="background: #fff8f8; border-color: #ffeaea;">${order.observations}</div>
                    </div>
                    ` : ''}

                    <div class="grid" style="margin-top: 40px; border-top: 2px solid #eee; pt-20">
                        <div class="info-block">
                            <div class="info-label">Status Atual</div>
                            <div class="info-value" style="color: #000; font-weight: bold;">${order.status}</div>
                        </div>
                        <div class="info-block">
                            <div class="info-label">Valor Total</div>
                            <div class="info-value">R$ ${parseFloat(order.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        </div>
                    </div>

                    <div class="footer">
                        Documento gerado em ${new Date().toLocaleString('pt-BR')} por Libera Sports Production System
                    </div>

                    <script>
                        window.onload = () => {
                            window.print();
                            // window.close(); // Opcional: fecha a janela após imprimir
                        };
                    </script>
                </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    const handleDeleteOrder = async (id: string, number: string) => {
        if (!window.confirm(`Tem certeza que deseja EXCLUIR o pedido ${number}? Esta ação não pode ser desfeita.`)) return;

        setLoading(true);
        try {
            await deleteDoc(doc(db, ordersCollectionPath, id));
            toast.success('Pedido excluído com sucesso');
        } catch (error) {
            console.error('Error deleting order:', error);
            toast.error('Erro ao excluir pedido');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setClient('');
        setClientWhatsapp('');
        setValue('');
        setDeadline(addBusinessDays(new Date(), 20));
        setDescription('');
    };

    const logout = async () => {
        await signOut(auth);
        localStorage.removeItem('libera_operator_name');
        router.push('/');
    };

    const getStatusCount = (status: string) => {
        return orders.filter(o => o.status === status).length;
    };

    const filteredOrders = orders.filter(order => {
        const matchesFilter = activeFilter ? order.status === activeFilter : true;
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch =
            (order.order_number?.toLowerCase().includes(searchLower)) ||
            (order.client?.toLowerCase().includes(searchLower));

        return matchesFilter && matchesSearch;
    });

    return (
        <div className="min-h-screen bg-black text-white selection:bg-[#39FF14] selection:text-black font-sans pb-20">
            {/* Navbar */}
            <nav className="p-4 border-b border-zinc-900 bg-black sticky top-0 z-50 flex justify-between items-center">
                <div className="font-black text-xl italic uppercase flex items-center gap-2 tracking-tighter text-white">
                    LIBERA SPORTS
                </div>
                <div className="flex items-center gap-6">
                    <div className="hidden md:flex items-center gap-2 text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                        <User size={12} className="text-[#39FF14]" /> {operatorName}
                    </div>
                    <button
                        onClick={logout}
                        className="text-zinc-600 hover:text-white text-[10px] font-black uppercase transition-colors"
                    >
                        Sair
                    </button>
                </div>
            </nav>

            <main className="max-w-5xl mx-auto p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6">
                    <div>
                        <h2 className="text-4xl font-black italic uppercase leading-none tracking-tighter">PAINEL DE PRODUÇÃO</h2>
                        <p className="text-zinc-500 text-sm mt-2">Acompanhamento de etapas em tempo real</p>
                        <div className="mt-4 flex flex-col items-start gap-1">
                            <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">
                                De Goiânia-GO para o mundo
                            </p>
                            <p className="text-zinc-600 text-[8px] uppercase font-bold tracking-[0.2em]">
                                Confecção de produtos personalizados
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="bg-[#39FF14] text-black px-8 py-4 rounded-2xl font-black hover:scale-105 transition-all uppercase text-sm shadow-xl shadow-[#39FF14]/10"
                    >
                        + Novo Pedido
                    </button>
                </div>

                {/* Status Filter Grid */}
                <div className="grid grid-cols-3 gap-2 mb-10 p-2 bg-zinc-950/50 rounded-3xl border border-zinc-900/50">
                    {displayWorkflow.map((step, idx) => {
                        const count = getStatusCount(step);
                        const isActive = activeFilter === step;
                        const isBottomRow = idx >= 6;

                        return (
                            <button
                                key={step}
                                onClick={() => setActiveFilter(isActive ? null : step)}
                                className={`
                                    relative flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 group
                                    ${isBottomRow ? 'col-span-1 h-20' : 'aspect-square md:aspect-auto md:h-24'}
                                    ${isActive
                                        ? (step === 'PEDIDO ENTREGUE' ? 'bg-[#39FF14] border-[#39FF14] text-black shadow-lg shadow-[#39FF14]/20' : 'bg-white border-white text-black shadow-lg shadow-white/20')
                                        : (count === 0 ? 'bg-zinc-950/20 opacity-40 border-zinc-900/50 grayscale hover:grayscale-0 hover:opacity-100' : 'bg-zinc-950 border-zinc-900 hover:border-zinc-700 hover:bg-zinc-900')
                                    }
                                    ${!isActive && step === 'PENDÊNCIA' && count > 0 ? 'border-[#FF3D00]/40' : ''}
                                    ${!isActive && step === 'PEDIDO ENTREGUE' && count > 0 ? 'border-[#39FF14]/40' : ''}
                                    ${step === 'PEDIDO ENTREGUE' && isBottomRow ? 'col-span-2' : ''}
                                    ${step === 'PENDÊNCIA' && isBottomRow ? 'col-span-1' : ''}
                                `}
                            >
                                <span className={`text-[9px] font-black uppercase tracking-widest mb-1 transition-colors ${isActive ? (step === 'PENDÊNCIA' ? 'text-black' : 'text-black') : 'text-zinc-500 group-hover:text-white'}`}>
                                    {step}
                                </span>

                                <div className="flex items-center gap-2">
                                    <span className={`
                                        text-xl font-black transition-colors
                                        ${isActive ? 'text-black' : 'text-white'}
                                    `}>
                                        {count}
                                    </span>
                                    {step === 'PENDÊNCIA' && count > 0 && !isActive && <AlertCircle size={14} className="text-[#FF3D00] animate-pulse" />}
                                    {step === 'PEDIDO ENTREGUE' && count > 0 && !isActive && <Check size={14} className="text-[#39FF14]" />}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Search Bar */}
                <div className="mb-8 p-1 bg-zinc-950 rounded-2xl border border-zinc-900 group focus-within:border-[#39FF14]/50 transition-all">
                    <div className="flex items-center px-4 py-3 gap-3">
                        <Package size={18} className="text-zinc-500 group-focus-within:text-[#39FF14] transition-colors" />
                        <input
                            type="text"
                            placeholder="Pesquisar por número do pedido ou nome do cliente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-transparent border-none outline-none text-white text-sm w-full placeholder:text-zinc-700 font-bold"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="text-zinc-600 hover:text-white transition-colors"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Orders List */}
                <div className="space-y-6">
                    {loading && orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 animate-pulse text-zinc-700">
                            <Loader2 className="w-10 h-10 mb-4 animate-spin" />
                            <p className="font-black uppercase italic tracking-widest text-xs">Sincronizando com a fábrica...</p>
                        </div>
                    ) : filteredOrders.length === 0 ? (
                        <div className="text-center py-20 opacity-20 font-black uppercase italic border-2 border-dashed border-zinc-900 rounded-[32px]">
                            {activeFilter ? `Nenhum pedido em ${activeFilter}` : 'Sem pedidos ativos'}
                        </div>
                    ) : (
                        filteredOrders.map((order) => {
                            const currentIdx = workflow.indexOf(order.status);
                            const isCompact = order.status === 'PEDIDO ENTREGUE' && !expandedOrderIds[order.id];

                            if (isCompact) {
                                return (
                                    <div
                                        key={order.id}
                                        onClick={() => setExpandedOrderIds(prev => ({ ...prev, [order.id]: true }))}
                                        className="bg-[#0a0a0a] rounded-2xl p-4 border border-zinc-900 hover:border-[#39FF14]/30 transition-all cursor-pointer group flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-6 overflow-hidden">
                                            <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-900 group-hover:border-[#39FF14]/50 transition-all">
                                                <Package className="text-[#39FF14]/50 group-hover:text-[#39FF14]" size={16} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-zinc-600 text-[9px] font-black uppercase tracking-widest">{order.order_number}</span>
                                                <h3 className="text-sm font-black text-white group-hover:text-[#39FF14] transition-colors truncate">{order.client}</h3>
                                            </div>
                                            <div className="hidden md:flex flex-col">
                                                <span className="text-zinc-700 text-[9px] font-black uppercase tracking-widest">Entrega</span>
                                                <span className="text-[10px] text-zinc-400 font-bold">{order.deadline.split('-').reverse().join('/')}</span>
                                            </div>
                                            <div className="hidden lg:flex flex-col max-w-[200px]">
                                                <span className="text-zinc-700 text-[9px] font-black uppercase tracking-widest">Grade</span>
                                                <span className="text-[10px] text-zinc-500 font-medium truncate">{order.description}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6 shrink-0">
                                            <div className="text-right">
                                                <span className="block text-[8px] text-zinc-600 font-bold uppercase tracking-widest">Valor</span>
                                                <span className="text-xs font-black text-[#39FF14]">
                                                    R$ {Number(order.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                            <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-900 text-zinc-700 group-hover:text-white transition-all">
                                                <ChevronDown size={14} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div key={order.id} className={`bg-[#0a0a0a] rounded-[32px] p-6 border transition-all group relative overflow-hidden ${order.status === 'PENDÊNCIA' ? 'border-red-500/30' : 'border-zinc-900 hover:border-zinc-800'}`}>
                                    {order.status === 'PEDIDO ENTREGUE' && (
                                        <button
                                            onClick={() => setExpandedOrderIds(prev => ({ ...prev, [order.id]: false }))}
                                            className="absolute top-6 right-20 p-2 rounded-xl bg-zinc-950 border border-zinc-900 text-zinc-500 hover:text-white transition-all flex items-center gap-2 text-[10px] font-black uppercase"
                                        >
                                            <ChevronUp size={14} /> Resumir
                                        </button>
                                    )}
                                    <div className="flex flex-col md:flex-row justify-between gap-6">
                                        <div className="flex-grow">
                                            <div className="flex flex-wrap items-center gap-3 mb-4">
                                                <span className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">
                                                    {order.order_number || `#${order.id.slice(0, 5).toUpperCase()}`}
                                                </span>
                                                <span className="bg-zinc-900 text-zinc-400 px-2 py-1 rounded text-[9px] font-bold flex items-center gap-1">
                                                    <Clock size={10} /> CRIADO EM: {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                                </span>
                                                <span className="bg-zinc-900 text-zinc-400 px-2 py-1 rounded text-[9px] font-bold flex items-center gap-1">
                                                    <Calendar size={10} /> ENTREGA: {order.deadline.split('-').reverse().join('/')}
                                                </span>
                                                <span className="bg-zinc-900 text-[#39FF14] px-2 py-1 rounded text-[9px] font-bold flex items-center gap-1 uppercase">
                                                    <Truck size={10} /> {order.delivery_method}
                                                </span>
                                            </div>

                                            <div className="flex-1">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900 group-hover:border-white/30 transition-all shadow-inner">
                                                            <User className="text-[#39FF14]" size={24} />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-3">
                                                                <h3 className="text-2xl font-black tracking-tighter text-white uppercase italic">
                                                                    {order.client}
                                                                </h3>
                                                                <div className="flex items-center gap-1">
                                                                    {order.client_whatsapp && (
                                                                        <a
                                                                            href={`https://wa.me/${order.client_whatsapp.replace(/\D/g, '')}`}
                                                                            target="_blank"
                                                                            className="p-1.5 rounded-lg bg-zinc-900 text-[#39FF14] hover:bg-[#39FF14] hover:text-black transition-all"
                                                                            title="WhatsApp"
                                                                        >
                                                                            <MessageCircle size={14} />
                                                                        </a>
                                                                    )}
                                                                    <button
                                                                        onClick={() => {
                                                                            // Implement edit logic later if needed or just use current structure
                                                                            toast.info('Edição completa em breve');
                                                                        }}
                                                                        className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:bg-white hover:text-black transition-all"
                                                                        title="Editar Pedido"
                                                                    >
                                                                        <Pencil size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3 mt-1">
                                                                <span className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">{order.order_number}</span>
                                                                <span className="w-1 h-1 rounded-full bg-zinc-800" />
                                                                <span className="text-zinc-700 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                                                                    <Truck size={10} /> {order.delivery_method}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => handlePrintOrder(order)}
                                                            className="p-3 rounded-xl bg-zinc-950 border border-zinc-900 text-zinc-700 hover:text-[#39FF14] hover:border-[#39FF14]/30 transition-all"
                                                            title="Gerar PDF / Imprimir"
                                                        >
                                                            <FileText size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteOrder(order.id, order.order_number)}
                                                            className="p-3 rounded-xl bg-zinc-950 border border-zinc-900 text-zinc-700 hover:text-[#FF3D00] hover:border-[#FF3D00]/30 transition-all"
                                                            title="Excluir Pedido"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {order.status === 'PENDÊNCIA' && order.pending_reason && (
                                                    <div className="bg-[#FF3D00]/10 border border-[#FF3D00]/20 p-4 rounded-2xl mb-6 flex items-start gap-3 shadow-lg shadow-[#FF3D00]/5">
                                                        <AlertCircle className="text-[#FF3D00] shrink-0" size={18} />
                                                        <div>
                                                            <p className="text-[#FF3D00] text-[10px] font-black uppercase tracking-widest mb-1">Motivo da Pendência</p>
                                                            <p className="text-zinc-200 text-sm font-medium">{order.pending_reason}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Visual Stepper */}
                                            <div className="mb-10 mt-6 px-2">
                                                <div className="relative flex justify-between items-center w-full h-1 bg-zinc-900 rounded-full">
                                                    {/* Progress Line */}
                                                    <div
                                                        className="absolute left-0 top-0 h-full bg-[#39FF14] rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(57,255,20,0.5)]"
                                                        style={{ width: `${(currentIdx / (workflow.length - 1)) * 100}%` }}
                                                    />

                                                    {workflow.map((step, idx) => {
                                                        const isCompleted = idx < currentIdx;
                                                        const isCurrent = idx === currentIdx;

                                                        return (
                                                            <div key={step} className="relative flex flex-col items-center">
                                                                <div className={`
                                                                    w-3 h-3 rounded-full border-2 border-black transition-all duration-300 z-10
                                                                    ${isCompleted ? 'bg-[#39FF14] scale-110' : isCurrent ? 'bg-white scale-125 shadow-[0_0_15px_white]' : 'bg-zinc-800'}
                                                                `} />
                                                                <span className={`
                                                                    absolute top-5 text-[10px] font-black uppercase tracking-tighter whitespace-nowrap transition-colors
                                                                    ${isCurrent ? 'text-white' : isCompleted ? 'text-[#39FF14]' : 'text-zinc-700'}
                                                                `}>
                                                                    {step}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Observações Internas Collapsible */}
                                            <div className="mt-4 border-t border-zinc-900 pt-4">
                                                <button
                                                    onClick={() => setExpandedObs(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                                                    className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-[#39FF14] transition-colors"
                                                >
                                                    {expandedObs[order.id] ? <X size={12} /> : <Plus size={12} />}
                                                    {expandedObs[order.id] ? 'Fechar Observações' : 'Ver Observações Internas'}
                                                    {order.observations && !expandedObs[order.id] && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14] ml-1 animate-pulse" />
                                                    )}
                                                </button>

                                                {expandedObs[order.id] && (
                                                    <div className="mt-4 bg-black/50 border border-zinc-950 rounded-2xl p-4 animate-in slide-in-from-top-2 duration-300">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-[#39FF14]/70">Notas de Produção</label>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingObsId(order.id);
                                                                    setObsValue(order.observations || '');
                                                                }}
                                                                className="text-[9px] font-black uppercase text-zinc-500 hover:text-[#39FF14] transition-colors"
                                                            >
                                                                {order.observations ? 'Editar' : 'Adicionar'}
                                                            </button>
                                                        </div>

                                                        {editingObsId === order.id ? (
                                                            <div className="space-y-3">
                                                                <textarea
                                                                    value={obsValue}
                                                                    onChange={e => setObsValue(e.target.value)}
                                                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:border-[#39FF14] outline-none transition-all min-h-[80px]"
                                                                    placeholder="Digite aqui..."
                                                                />
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => handleUpdateObservations(order.id)}
                                                                        className="px-4 py-2 bg-[#39FF14] text-black text-[10px] font-black uppercase rounded-lg hover:scale-105 transition-all"
                                                                    >
                                                                        Salvar
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setEditingObsId(null)}
                                                                        className="px-4 py-2 bg-zinc-800 text-white text-[10px] font-black uppercase rounded-lg hover:bg-zinc-700 transition-all"
                                                                    >
                                                                        Cancelar
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm text-zinc-300 font-medium leading-relaxed italic">
                                                                {order.observations || "Nenhuma observação registrada."}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between mt-4">
                                                <p className="text-zinc-600 text-[10px] italic line-clamp-1">Grade: {order.description}</p>
                                                <div className="flex items-center gap-4">
                                                    <button
                                                        onClick={() => setExpandedHistoryIds(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                                                        className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-[#39FF14] transition-colors flex items-center gap-1"
                                                    >
                                                        <History size={10} /> {expandedHistoryIds[order.id] ? 'Ocultar Histórico' : 'Ver Histórico'}
                                                    </button>
                                                    {order.order_logs && order.order_logs.length > 0 && (
                                                        <div className="text-[8px] text-zinc-700 font-bold uppercase flex items-center gap-1">
                                                            <Info size={10} /> Ultima mov. {new Date(order.order_logs[order.order_logs.length - 1].created_at).toLocaleString('pt-BR')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* History Timeline */}
                                            {expandedHistoryIds[order.id] && (
                                                <div className="mt-4 bg-zinc-950/50 border border-zinc-900 rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-4 flex items-center gap-2">
                                                        <History size={12} className="text-[#39FF14]" /> Linha do Tempo
                                                    </h4>
                                                    <div className="space-y-4 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-zinc-900">
                                                        {order.order_logs && [...order.order_logs].reverse().map((log: any, lIdx: number) => (
                                                            <div key={log.id} className="relative pl-6">
                                                                <div className={`absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-black ${lIdx === 0 ? 'bg-[#39FF14]' : 'bg-zinc-800'}`} />
                                                                <div className="flex flex-col">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] font-black text-white uppercase tracking-tighter">
                                                                            {log.old_status} <ArrowRight size={8} className="inline mx-1 text-zinc-600" /> {log.new_status}
                                                                        </span>
                                                                        <span className="text-[8px] text-zinc-600 font-bold uppercase">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                                                                    </div>
                                                                    <span className="text-[9px] text-zinc-500 font-bold uppercase mt-0.5">Operador: <span className="text-zinc-300">{log.operator_name}</span></span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col justify-between items-end gap-4 min-w-[180px]">
                                            <div className="text-right">
                                                <span className="block text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Valor Total</span>
                                                <span className="text-xl font-black text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.2)]">
                                                    R$ {Number(order.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>

                                            <div className="flex flex-col gap-2 w-full">
                                                {order.status !== 'PEDIDO ENTREGUE' && (
                                                    <button
                                                        onClick={() => advanceStep(order.id, order.status)}
                                                        className="w-full bg-[#39FF14] text-black px-6 py-4 rounded-2xl font-black text-[11px] uppercase hover:scale-[1.02] transition-all shadow-xl shadow-[#39FF14]/10 flex items-center justify-center gap-2"
                                                    >
                                                        {order.status === 'PENDÊNCIA'
                                                            ? 'Resolver Pendência'
                                                            : order.status === 'REVISÃO'
                                                                ? 'Finalizar Produção'
                                                                : order.status === 'EM FASE DE ENTREGA'
                                                                    ? 'Confirmar Entrega'
                                                                    : `Avançar p/ ${workflow[workflow.indexOf(order.status) + 1]}`
                                                        } <ArrowRight size={14} />
                                                    </button>
                                                )}

                                                {order.status !== 'PENDÊNCIA' && order.status !== 'PEDIDO ENTREGUE' && (
                                                    <button
                                                        onClick={() => {
                                                            setPendingOrderId(order.id);
                                                            setIsPendingModalOpen(true);
                                                        }}
                                                        className="w-full bg-zinc-950 text-[#FF3D00] border border-[#FF3D00]/20 px-6 py-3 rounded-2xl font-black text-[10px] uppercase hover:bg-[#FF3D00]/10 transition-all flex items-center justify-center gap-2 shadow-sm"
                                                    >
                                                        <AlertCircle size={12} /> Mover para Pendência
                                                    </button>
                                                )}

                                                {order.status === 'PEDIDO ENTREGUE' && (
                                                    <div className="bg-zinc-950 text-[#39FF14] px-6 py-4 rounded-2xl font-black text-[11px] uppercase border border-[#39FF14]/20 flex items-center justify-center gap-2 shadow-inner">
                                                        <Check size={16} /> Pedido Entregue
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </main>

            {/* Modal Cadastro de Pedido */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-zinc-900 w-full max-w-xl p-8 rounded-[32px] border border-zinc-800 shadow-2xl relative">
                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors"
                        >
                            <X size={24} />
                        </button>

                        <div className="mb-8">
                            <h3 className="text-2xl font-black italic uppercase text-[#39FF14]">CADASTRO DE PEDIDO</h3>
                            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                                {nextOrderNumber ? `INICIAR PRODUÇÃO ${nextOrderNumber}` : 'INICIAR NOVA PRODUÇÃO'}
                            </p>
                        </div>

                        <form onSubmit={handleCreateOrder} className="space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">
                                        Nome do Cliente / Academia
                                    </label>
                                    <input
                                        type="text"
                                        value={client}
                                        onChange={e => setClient(e.target.value)}
                                        placeholder="Nome do cliente..."
                                        required
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-700"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">WhatsApp</label>
                                        <input
                                            type="text"
                                            value={clientWhatsapp}
                                            onChange={e => setClientWhatsapp(e.target.value)}
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-700"
                                            placeholder="(00) 00000-0000"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-[#39FF14] mb-2 font-bold italic">Valor Total</label>
                                        <input
                                            type="text"
                                            value={value}
                                            onChange={e => handleValueChange(e.target.value)}
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-700"
                                            placeholder="0,00"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">
                                            Data de Entrega
                                        </label>
                                        <input
                                            type="date"
                                            value={deadline}
                                            onChange={e => setDeadline(e.target.value)}
                                            required
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all [color-scheme:dark]"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">
                                            Método de Entrega
                                        </label>
                                        <select
                                            value={deliveryMethod}
                                            onChange={e => setDeliveryMethod(e.target.value as 'MOTOBOY' | 'TRANSPORTADORA' | 'RETIRADA')}
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all appearance-none"
                                        >
                                            <option value="MOTOBOY">MOTOBOY</option>
                                            <option value="TRANSPORTADORA">TRANSPORTADORA</option>
                                            <option value="RETIRADA">RETIRADA</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">
                                        Grade / Descrição
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Ex: 5P, 10M, 5G..."
                                        rows={3}
                                        required
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-700"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 bg-zinc-800 py-4 rounded-xl font-bold uppercase text-xs hover:bg-zinc-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 bg-[#39FF14] text-black py-4 rounded-xl font-black uppercase text-xs hover:scale-105 transition-all shadow-lg shadow-[#39FF14]/10 disabled:opacity-50"
                                >
                                    {loading ? 'Salvando...' : 'Salvar Pedido'}
                                </button>
                            </div>
                        </form>
                    </div >
                </div >
            )
            }
            {/* Modal de Motivo da Pendência */}
            {
                isPendingModalOpen && (
                    <div className="fixed inset-0 bg-black/95 z-[700] flex items-center justify-center p-4 backdrop-blur-xl animate-in fade-in duration-300">
                        <div className="bg-zinc-900 w-full max-w-md p-8 rounded-[32px] border border-red-500/30 shadow-2xl relative">
                            <div className="mb-8">
                                <h3 className="text-2xl font-black italic uppercase text-red-500 flex items-center gap-3">
                                    <Info size={24} /> REGISTRAR PENDÊNCIA
                                </h3>
                                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                                    Descreva o motivo do atraso ou problema
                                </p>
                            </div>

                            <form onSubmit={handlePendingSubmit} className="space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">
                                        Motivo da Pendência
                                    </label>
                                    <textarea
                                        value={pendingReason}
                                        onChange={e => setPendingReason(e.target.value)}
                                        placeholder="Ex: Falta de tecido, botão quebrado, erro na estampa..."
                                        rows={4}
                                        required
                                        className="w-full bg-zinc-950/80 border-transparent rounded-[24px] p-6 text-white outline-none focus:ring-1 focus:ring-red-500 focus:bg-zinc-900 transition-all font-semibold placeholder:text-zinc-700"
                                    />
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsPendingModalOpen(false);
                                            setPendingOrderId(null);
                                            setPendingReason('');
                                        }}
                                        className="flex-1 bg-zinc-800 py-4 rounded-xl font-bold uppercase text-xs hover:bg-zinc-700 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 bg-red-500 text-white py-4 rounded-xl font-black uppercase text-xs hover:scale-105 transition-all shadow-lg shadow-red-500/10"
                                    >
                                        Confirmar Pendência
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
