'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LayoutDashboard, Plus, Search, Calendar, Package,
    ArrowRight, Check, AlertCircle, Clock, X, LogOut,
    TrendingUp, Truck, User, History, MessageSquare, Info, Filter,
    Loader2, ChevronDown, ChevronUp, MessageCircle, Pencil, FileText, Trash2,
    Store, ShoppingCart, Wallet, BarChart3, Settings, Layers, Box, DollarSign,
    ArrowUpCircle, ArrowDownCircle, ArrowUpRight, ArrowDownLeft, PlusCircle, Home
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
    const [activeTab, setActiveTabState] = useState<'HOME' | 'PRODUÇÃO' | 'VENDAS' | 'ESTOQUE' | 'FINANCEIRO' | 'CAIXA'>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('libera_active_tab') as any) || 'HOME';
        }
        return 'HOME';
    });
    const setActiveTab = (tab: typeof activeTab) => {
        setActiveTabState(tab);
        localStorage.setItem('libera_active_tab', tab);
    };
    const [financeView, setFinanceView] = useState<'A PAGAR' | 'A RECEBER'>('A PAGAR');
    const [searchTerm, setSearchTerm] = useState('');

    // Form State
    const [client, setClient] = useState('');
    const [clientWhatsapp, setClientWhatsapp] = useState('');
    const [value, setValue] = useState('');
    const [deadline, setDeadline] = useState<string>(addBusinessDays(new Date(), 20));
    const [deliveryMethod, setDeliveryMethod] = useState<'MOTOBOY' | 'TRANSPORTADORA' | 'RETIRADA'>('MOTOBOY');
    const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'BOLETO' | 'CARTÃO CRÉDITO' | 'CARTÃO DÉBITO' | 'OUTROS'>('PIX');
    const [description, setDescription] = useState('');
    const [linkSale, setLinkSale] = useState(false);
    const [linkedSaleId, setLinkedSaleId] = useState('');

    // Configurações do AppId para o caminho solicitado
    const appId = 'libera-sports-v1';
    const ordersCollectionPath = `artifacts/${appId}/public/data/pedidos`;
    const productsCollectionPath = `artifacts/${appId}/public/data/produtos`;
    const salesCollectionPath = `artifacts/${appId}/public/data/vendas`;
    const financeCollectionPath = `artifacts/${appId}/public/data/financeiro`;

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
    const [nextOrderNumber, setNextOrderNumber] = useState('');
    const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0]);
    const [installments, setInstallments] = useState(1);

    // Novos Estados para o Híbrido
    const [products, setProducts] = useState<any[]>([]);
    const [sales, setSales] = useState<any[]>([]);
    const [financialItems, setFinancialItems] = useState<any[]>([]);
    const [stockLoading, setStockLoading] = useState(true);

    // Form Estado - Vendas (PDV)
    const [cart, setCart] = useState<any[]>([]);
    const [cartTotal, setCartTotal] = useState(0);

    // Form Estado - Produtos
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [prodName, setProdName] = useState('');
    const [prodSalePrice, setProdSalePrice] = useState('');
    const [prodCostPrice, setProdCostPrice] = useState('');
    const [prodStock, setProdStock] = useState('');

    // Form Estado - Financeiro
    const [finAmount, setFinAmount] = useState('');
    const [finDesc, setFinDesc] = useState('');
    const [finType, setFinType] = useState<'INFLOW' | 'OUTFLOW'>('INFLOW');
    const [finStatus, setFinStatus] = useState<'PAGO' | 'A PAGAR' | 'A RECEBER' | 'RECEBIDO' | 'ATRASADO'>('A PAGAR');
    const [finDueDate, setFinDueDate] = useState(new Date().toISOString().split('T')[0]);
    const [finPayMethod, setFinPayMethod] = useState<'PIX' | 'BOLETO' | 'CARTÃO CRÉDITO' | 'CARTÃO DÉBITO' | 'OUTRO'>('PIX');
    const [finObs, setFinObs] = useState('');
    const [finInstallments, setFinInstallments] = useState(1);
    const [finInstallmentDates, setFinInstallmentDates] = useState<string[]>([]);
    const [finDebitDay, setFinDebitDay] = useState(new Date().getDate());
    const [finDebitRecurrent, setFinDebitRecurrent] = useState(false);
    const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false);
    const [editingFinanceItem, setEditingFinanceItem] = useState<any>(null);
    const [expandedSaleIds, setExpandedSaleIds] = useState<Record<string, boolean>>({});

    // Finance View State
    const [financeFilterYear, setFinanceFilterYear] = useState(new Date().getFullYear());
    const [financeFilterMonth, setFinanceFilterMonth] = useState(-1);
    const [financeGrouping, setFinanceGrouping] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('DAILY');
    const [editingFinanceId, setEditingFinanceId] = useState<string | null>(null);
    const [editFinAmount, setEditFinAmount] = useState('');
    const [editFinDate, setEditFinDate] = useState('');

    // ========================================
    // CONTAS A PAGAR – CONFECÇÃO
    // ========================================
    const contasAPagarPath = `artifacts/${appId}/public/data/contas_a_pagar`;

    const CONFECCAO_GROUPS = [
        { group: 'Operacionais', emoji: '🚚', color: '#F97316', items: ['Frete e Entrega', 'Serviços de Entregador', 'Facção'] },
        { group: 'Equipe e Dia a Dia', emoji: '👥', color: '#3B82F6', items: ['Folha de Pagamento', 'Lanche/Almoço', 'Hora Extra'] },
        { group: 'Produção', emoji: '✂️', color: '#8B5CF6', items: ['Produtos de Limpeza', 'Custos da Confecção', 'Gastos com Peça Piloto'] },
        { group: 'Adm. e Marketing', emoji: '📢', color: '#EC4899', items: ['Marketing', 'Serviços Gráficos'] },
        { group: 'Despesas Fixas', emoji: '🏠', color: '#6B7280', items: ['Água', 'Luz', 'IPTU'] },
        { group: 'Financeiro', emoji: '💳', color: '#10B981', items: ['Parcelamentos de Boletos', 'Faturas de Cartão'] },
    ];

    const [contasAPagar, setContasAPagar] = useState<any[]>([]);
    const [contaModalOpen, setContaModalOpen] = useState(false);
    const [editingConta, setEditingConta] = useState<any | null>(null);
    const [contaDesc, setContaDesc] = useState('');
    const [contaGroup, setContaGroup] = useState('');
    const [contaCategory, setContaCategory] = useState('');
    const [contaAmount, setContaAmount] = useState('');
    const [contaDueDay, setContaDueDay] = useState('');
    const [contaPayMethod, setContaPayMethod] = useState<string>('PIX');
    const [contaRecurrence, setContaRecurrence] = useState<'FIXA' | 'VARIAVEL' | 'UNICA'>('UNICA');
    const [contaNotes, setContaNotes] = useState('');
    const [contaStatusFilter, setContaStatusFilter] = useState<'TODAS' | 'PENDENTES' | 'PAGAS'>('TODAS');
    const [contaGroupFilter, setContaGroupFilter] = useState('TODOS');
    const [contaMonthFilter, setContaMonthFilter] = useState(new Date().getMonth());
    const [contaYearFilter, setContaYearFilter] = useState(new Date().getFullYear());
    const [confirmDeleteContaId, setConfirmDeleteContaId] = useState<string | null>(null);

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

    // Real-time Products Fetching
    useEffect(() => {
        if (authChecking) return;
        const q = query(collection(db, productsCollectionPath), orderBy('name', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
            setProducts(data);
            setStockLoading(false);
        });
        return () => unsubscribe();
    }, [authChecking]);

    // Real-time Sales Fetching
    useEffect(() => {
        if (authChecking) return;
        const q = query(collection(db, salesCollectionPath), orderBy('created_at', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
            setSales(data);
        });
        return () => unsubscribe();
    }, [authChecking]);

    // Real-time Finance Fetching
    useEffect(() => {
        if (authChecking) return;
        const q = query(collection(db, financeCollectionPath), orderBy('created_at', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
            setFinancialItems(data);
        });
        return () => unsubscribe();
    }, [authChecking]);

    // Auto-mark overdue financial items as ATRASADO (runs once on load)
    const overdueCheckedRef = React.useRef(false);
    useEffect(() => {
        if (overdueCheckedRef.current || financialItems.length === 0) return;
        overdueCheckedRef.current = true;
        const today = new Date().toISOString().split('T')[0];
        financialItems.forEach(item => {
            if ((item.status === 'A PAGAR' || item.status === 'A RECEBER' || item.status === 'PENDENTE') && item.due_date) {
                const dueDatePart = item.due_date.split('T')[0];
                if (dueDatePart < today) {
                    handleUpdateFinanceEntry(item.id, { status: 'ATRASADO' });
                }
            }
        });
    }, [financialItems]);

    // Real-time Contas a Pagar Fetching
    useEffect(() => {
        if (authChecking) return;
        const q = query(collection(db, contasAPagarPath), orderBy('created_at', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
            setContasAPagar(data);
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
        setLoading(false);
    };

    const handleAddProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId) return;
        setLoading(true);
        try {
            const newProduct = {
                name: prodName.toUpperCase(),
                sale_price: parseBRL(prodSalePrice),
                cost_price: parseBRL(prodCostPrice),
                stock: parseInt(prodStock),
                created_at: new Date().toISOString(),
                user_id: userId
            };
            await addDoc(collection(db, productsCollectionPath), newProduct);
            toast.success('Produto adicionado ao estoque!');
            setIsProductModalOpen(false);
            setProdName('');
            setProdSalePrice('');
            setProdCostPrice('');
            setProdStock('');
        } catch (err) {
            console.error(err);
            toast.error('Erro ao adicionar produto');
        } finally {
            setLoading(false);
        }
    };

    const addToCart = (product: any) => {
        const existing = cart.find(item => item.id === product.id);
        if (existing) {
            if (existing.quantity >= product.stock) {
                toast.error('Estoque insuficiente');
                return;
            }
            setCart(cart.map(item =>
                item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
            ));
        } else {
            setCart([...cart, { ...product, quantity: 1 }]);
        }
        toast.success(`${product.name} adicionado!`);
    };

    const removeFromCart = (id: string) => {
        setCart(cart.filter(item => item.id !== id));
    };

    useEffect(() => {
        const total = cart.reduce((acc, item) => acc + (item.sale_price * item.quantity), 0);
        setCartTotal(total);
    }, [cart]);

    const handleCheckout = async () => {
        if (cart.length === 0 || !userId) return;
        setLoading(true);
        try {
            // 0. Gerar Número da Venda
            const maxSaleNumber = Math.max(...sales.map(s => parseInt((s.sale_number || '').replace('VENDA-', '') || '0')), 0);
            const newSaleNumber = `VENDA-${String(maxSaleNumber + 1).padStart(4, '0')}`;

            // 1. Criar Venda
            const saleData = {
                sale_number: newSaleNumber,
                items: cart,
                total: cartTotal,
                created_at: new Date().toISOString(),
                user_id: userId,
                payment_method: paymentMethod // Reutilizando estado de pagamento do pedido ou definindo novo
            };
            await addDoc(collection(db, salesCollectionPath), saleData);

            // 2. Registrar no Financeiro
            await generateFinancialEntries(
                null,
                '',
                `Venda PDV: ${newSaleNumber} - ${cart.length} itens`,
                cartTotal,
                paymentMethod,
                transactionDate,
                installments,
                userId
            );

            // 3. Baixar Estoque
            for (const item of cart) {
                const productRef = doc(db, productsCollectionPath, item.id);
                await updateDoc(productRef, {
                    stock: item.stock - item.quantity
                });
            }

            toast.success('Venda concluída com sucesso!');
            setCart([]);
            setPaymentMethod('PIX');
            setTransactionDate(new Date().toISOString().split('T')[0]);
            setInstallments(1);
        } catch (err) {
            console.error(err);
            toast.error('Erro ao processar venda');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSale = async (id: string) => {
        if (!confirm('Deseja realmente excluir esta venda? Os itens voltarão para o estoque, mas o lançamento NÃO será removido automaticamente do Financeiro. Você deve apagá-lo por lá!')) return;
        setLoading(true);
        try {
            const sale = sales.find(s => s.id === id);
            if (!sale) return;

            // Retornar itens ao estoque
            for (const item of sale.items || []) {
                if (item.id) {
                    const productRef = doc(db, productsCollectionPath, item.id);
                    const pSnap = await getDoc(productRef);
                    if (pSnap.exists()) {
                        await updateDoc(productRef, { stock: (pSnap.data().stock || 0) + item.quantity });
                    }
                }
            }

            // Deletar documento da venda
            await deleteDoc(doc(db, salesCollectionPath, id));
            toast.success('Venda excluída e estoque estornado!');
        } catch (err) {
            console.error(err);
            toast.error('Erro ao excluir venda.');
        } finally {
            setLoading(false);
        }
    };

    const resetFinanceForm = () => {
        setFinAmount('');
        setFinDesc('');
        setFinDueDate(new Date().toISOString().split('T')[0]);
        setFinPayMethod('PIX');
        setFinObs('');
        setFinInstallments(1);
        setFinInstallmentDates([]);
        setFinDebitDay(new Date().getDate());
        setFinDebitRecurrent(false);
    };

    const calcInstallmentDates = (startDate: string, count: number) => {
        const dates: string[] = [];
        const base = new Date(startDate + 'T12:00:00');
        for (let i = 0; i < count; i++) {
            const d = new Date(base);
            d.setMonth(d.getMonth() + i);
            dates.push(d.toISOString().split('T')[0]);
        }
        return dates;
    };

    const getNextDebitDate = (day: number) => {
        const now = new Date();
        let d = new Date(now.getFullYear(), now.getMonth(), day);
        if (d <= now) d.setMonth(d.getMonth() + 1);
        return d.toISOString().split('T')[0];
    };

    const handleAddFinance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId) return;
        setLoading(true);
        try {
            const totalAmount = parseBRL(finAmount);
            const baseDoc = {
                type: 'OUTFLOW' as const,
                description: finDesc.toUpperCase(),
                payment_method: finPayMethod,
                observations: finObs,
                created_at: new Date().toISOString(),
                user_id: userId
            };

            if (finPayMethod === 'BOLETO' && finInstallments > 1) {
                const installmentAmount = totalAmount / finInstallments;
                for (let i = 0; i < finInstallments; i++) {
                    await addDoc(collection(db, financeCollectionPath), {
                        ...baseDoc,
                        amount: Math.round(installmentAmount * 100) / 100,
                        description: `${finDesc.toUpperCase()} (${i + 1}/${finInstallments})`,
                        status: 'A PAGAR',
                        due_date: finInstallmentDates[i] || finDueDate,
                    });
                }
            } else if (finPayMethod === 'CARTÃO CRÉDITO' && finInstallments > 1) {
                const installmentAmount = totalAmount / finInstallments;
                for (let i = 0; i < finInstallments; i++) {
                    await addDoc(collection(db, financeCollectionPath), {
                        ...baseDoc,
                        amount: Math.round(installmentAmount * 100) / 100,
                        description: `${finDesc.toUpperCase()} (${i + 1}/${finInstallments})`,
                        status: 'A PAGAR',
                        due_date: '',
                    });
                }
            } else {
                const entry: any = {
                    ...baseDoc,
                    amount: totalAmount,
                    status: 'A PAGAR',
                    due_date: finPayMethod === 'CARTÃO CRÉDITO' ? '' : finDueDate,
                };
                if (finPayMethod === 'CARTÃO DÉBITO') {
                    entry.debit_recurrent = finDebitRecurrent;
                }
                await addDoc(collection(db, financeCollectionPath), entry);
            }

            toast.success(finInstallments > 1 ? `${finInstallments} parcelas registradas!` : 'Conta a pagar registrada!');
            setIsFinanceModalOpen(false);
            resetFinanceForm();
        } catch (err) {
            console.error(err);
            toast.error('Erro ao lançar financeiro');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateFinanceEntry = async (itemId: string, updates: any) => {
        try {
            const itemRef = doc(db, financeCollectionPath, itemId);
            await updateDoc(itemRef, updates);
            if (!updates.status) toast.success('Lançamento atualizado!');
        } catch (err) {
            console.error(err);
            toast.error('Erro ao atualizar lançamento');
        }
    };

    // ========================================
    // CONTAS A PAGAR – HANDLERS
    // ========================================

    const resetContaForm = () => {
        setContaDesc(''); setContaGroup(''); setContaCategory('');
        setContaAmount(''); setContaDueDay(''); setContaPayMethod('PIX');
        setContaRecurrence('UNICA'); setContaNotes('');
        setEditingConta(null);
    };

    const handleSaveConta = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId) return;
        const day = parseInt(contaDueDay);
        if (!contaDesc.trim() || !contaGroup || !contaCategory || !contaAmount || !contaDueDay || day < 1 || day > 31) {
            toast.error('Preencha todos os campos obrigatórios');
            return;
        }
        const amount = parseBRL(contaAmount);
        if (isNaN(amount) || amount <= 0) { toast.error('Valor inválido'); return; }

        const buildEntry = (year: number, month: number) => {
            const lastDay = new Date(year, month + 1, 0).getDate();
            const safeDay = Math.min(day, lastDay);
            const dueDate = new Date(year, month, safeDay).toISOString().split('T')[0];
            const isVariable = contaRecurrence === 'VARIAVEL';
            return {
                description: contaDesc.trim().toUpperCase(),
                category_group: contaGroup,
                category: contaCategory,
                amount: isVariable && month !== contaMonthFilter ? 0 : amount,
                due_date: dueDate,
                payment_method: contaPayMethod,
                recurrence: contaRecurrence,
                notes: contaNotes.trim() || null,
                status: 'PENDENTE',
                created_at: new Date().toISOString(),
                user_id: userId,
            };
        };

        try {
            if (editingConta) {
                // Edit single
                await updateDoc(doc(db, contasAPagarPath, editingConta.id), {
                    description: contaDesc.trim().toUpperCase(),
                    category_group: contaGroup,
                    category: contaCategory,
                    amount,
                    due_date: (() => {
                        const d = new Date(contaYearFilter, contaMonthFilter, Math.min(day, new Date(contaYearFilter, contaMonthFilter + 1, 0).getDate()));
                        return d.toISOString().split('T')[0];
                    })(),
                    payment_method: contaPayMethod,
                    recurrence: contaRecurrence,
                    notes: contaNotes.trim() || null,
                });
                toast.success('Conta atualizada!');
            } else if (contaRecurrence === 'FIXA' || contaRecurrence === 'VARIAVEL') {
                // Create for all 12 months of current year
                const year = contaYearFilter;
                const promises = Array.from({ length: 12 }, (_, m) => addDoc(collection(db, contasAPagarPath), buildEntry(year, m)));
                await Promise.all(promises);
                toast.success(contaRecurrence === 'FIXA' ? '🔄 Conta fixa criada para o ano todo!' : '📊 Conta variável criada para o ano todo!');
            } else {
                await addDoc(collection(db, contasAPagarPath), buildEntry(contaYearFilter, contaMonthFilter));
                toast.success('✅ Conta registrada!');
            }
            setContaModalOpen(false);
            resetContaForm();
        } catch (err) {
            console.error(err);
            toast.error('Erro ao salvar conta');
        }
    };

    const handleMarkContaPaid = async (id: string) => {
        try {
            await updateDoc(doc(db, contasAPagarPath, id), {
                status: 'PAGO',
                paid_date: new Date().toISOString().split('T')[0],
            });
            toast.success('✅ Conta marcada como paga!');
        } catch (err) { toast.error('Erro ao marcar como pago'); }
    };

    const handleUndoContaPaid = async (id: string) => {
        try {
            await updateDoc(doc(db, contasAPagarPath, id), { status: 'PENDENTE', paid_date: null });
            toast.info('Pagamento desfeito.');
        } catch (err) { toast.error('Erro ao desfazer'); }
    };

    const handleDeleteConta = async () => {
        if (!confirmDeleteContaId) return;
        try {
            await deleteDoc(doc(db, contasAPagarPath, confirmDeleteContaId));
            setConfirmDeleteContaId(null);
            toast.success('Conta removida!');
        } catch (err) { toast.error('Erro ao excluir'); }
    };

    // Filtros e Agrupamentos Financeiros
    const filteredFinancialItems = useMemo(() => {
        return financialItems.filter(item => {
            const dateStr = item.due_date || item.transaction_date || item.created_at;
            const date = new Date(dateStr);
            const itemYear = date.getFullYear();
            const itemMonth = date.getMonth();

            if (financeGrouping === 'YEARLY') {
                return itemYear === financeFilterYear;
            } else {
                return itemYear === financeFilterYear && itemMonth === financeFilterMonth;
            }
        }).sort((a, b) => {
            const dateA = new Date(a.due_date || a.transaction_date || a.created_at).getTime();
            const dateB = new Date(b.due_date || b.transaction_date || b.created_at).getTime();
            return dateA - dateB; // Sort ascending by due date
        });
    }, [financialItems, financeFilterYear, financeFilterMonth, financeGrouping]);

    const financeStats = {
        balance: financialItems.reduce((acc: number, item: any) => {
            if (item.status === 'PAGO' || item.status === 'RECEBIDO') {
                return item.type === 'INFLOW' ? acc + item.amount : acc - item.amount;
            }
            return acc;
        }, 0),
        todaySales: filteredFinancialItems
            .filter((item: any) => {
                const itemDateStr = item.transaction_date || item.created_at;
                const itemDate = new Date(itemDateStr).toISOString().split('T')[0];
                const today = new Date().toISOString().split('T')[0];
                return itemDate === today && item.type === 'INFLOW' && (item.status === 'PAGO' || item.status === 'RECEBIDO');
            })
            .reduce((acc: number, item: any) => acc + item.amount, 0),
        pendingReceivables: filteredFinancialItems
            .filter((item: any) => item.type === 'INFLOW' && (item.status === 'A RECEBER' || item.status === 'PENDENTE' || item.status === 'ATRASADO'))
            .reduce((acc: number, item: any) => acc + item.amount, 0)
    };

    const groupedFinancialItems = useMemo(() => {
        const groups: Record<string, any[]> = {};

        filteredFinancialItems.forEach((item: any) => {
            const dateStr = item.due_date || item.transaction_date || item.created_at;
            const date = new Date(dateStr);
            let groupKey = '';

            switch (financeGrouping) {
                case 'DAILY':
                    groupKey = date.toLocaleDateString('pt-BR');
                    break;
                case 'WEEKLY':
                    const weekNum = Math.ceil((date.getDate() - 1 - date.getDay()) / 7) + 1;
                    groupKey = `Semana ${Math.max(1, weekNum)} de ${date.toLocaleString('pt-BR', { month: 'long' })}`;
                    break;
                case 'MONTHLY':
                    groupKey = date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
                    break;
                case 'YEARLY':
                    groupKey = date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
                    break;
                default:
                    groupKey = 'Geral';
            }

            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(item);
        });

        return Object.entries(groups).map(([group, items]) => ({
            group,
            items,
            total: items.reduce((acc, item: any) => item.type === 'INFLOW' ? acc + item.amount : acc - item.amount, 0)
        }));
    }, [filteredFinancialItems, financeGrouping]);

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

    const parseBRL = (val: string): number => {
        return parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0;
    };

    const formatCurrency = (val: string): string => {
        const cleanValue = val.replace(/\D/g, '');
        if (!cleanValue) return '';
        const numericValue = parseInt(cleanValue) / 100;
        return numericValue.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    const handleValueChange = (val: string) => {
        const formattedValue = formatCurrency(val);
        if (!formattedValue) {
            setValue('');
            return;
        }

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

    const generateFinancialEntries = async (orderId: string | null, orderNumber: string, desc: string, totalValue: number, payMethod: string, transDate: string, installmentsCount: number, uid: string) => {
        let baseDate = new Date(transDate);
        baseDate = new Date(baseDate.getTime() + Math.abs(baseDate.getTimezoneOffset() * 60000));

        let prefix = orderNumber ? `[${orderNumber}] ` : '';

        if (payMethod === 'PIX' || payMethod === 'CARTÃO DÉBITO' || payMethod === 'DINHEIRO') {
            await addDoc(collection(db, financeCollectionPath), {
                type: 'INFLOW',
                amount: totalValue,
                description: `${prefix}${desc}`,
                status: 'RECEBIDO',
                created_at: new Date().toISOString(),
                transaction_date: baseDate.toISOString(),
                due_date: baseDate.toISOString(),
                order_id: orderId,
                user_id: uid
            });
        } else if (payMethod === 'CARTÃO CRÉDITO') {
            const installmentValue = totalValue / installmentsCount;
            for (let i = 1; i <= installmentsCount; i++) {
                let dueDate = new Date(baseDate);
                dueDate.setDate(dueDate.getDate() + (30 * i));

                await addDoc(collection(db, financeCollectionPath), {
                    type: 'INFLOW',
                    amount: installmentValue,
                    description: installmentsCount > 1 ? `${prefix}${desc} (Parcela ${i}/${installmentsCount})` : `${prefix}${desc}`,
                    status: 'A RECEBER',
                    created_at: new Date().toISOString(),
                    transaction_date: baseDate.toISOString(),
                    due_date: installmentsCount > 1 ? dueDate.toISOString() : (new Date(baseDate.setDate(baseDate.getDate() + 30)).toISOString()),
                    order_id: orderId,
                    user_id: uid
                });
            }
        } else {
            await addDoc(collection(db, financeCollectionPath), {
                type: 'INFLOW',
                amount: totalValue,
                description: `${prefix}${desc}`,
                status: 'A RECEBER',
                created_at: new Date().toISOString(),
                transaction_date: baseDate.toISOString(),
                due_date: baseDate.toISOString(),
                order_id: orderId,
                user_id: uid
            });
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
                payment_method: paymentMethod,
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

            const docRef = await addDoc(collection(db, ordersCollectionPath), newOrder);
            await generateFinancialEntries(docRef.id, nextOrderNumber, description, parseFloat(normalizedValue), paymentMethod, transactionDate, installments, userId);

            toast.success('Pedido criado com sucesso!');
            setIsModalOpen(false);
            setPaymentMethod('PIX');
            setDescription('');
            setTransactionDate(new Date().toISOString().split('T')[0]);
            setInstallments(1);
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
                            <div class="info-block">
                                <div class="info-label">💰 Forma de Pagamento</div>
                                <div class="info-value">${order.payment_method || 'PIX'}</div>
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
        setPaymentMethod('PIX');
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
            <nav className="px-6 py-4 border-b border-zinc-900 bg-black sticky top-0 z-50 flex justify-between items-center">
                <button
                    onClick={() => setActiveTab('HOME')}
                    className="font-black text-xl italic uppercase flex items-center gap-2 tracking-tighter text-white pl-1 hover:text-[#39FF14] transition-colors"
                >
                    LIBERA SPORTS
                </button>
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

            <style>{`
                .mask-fade {
                    mask-image: linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent);
                    -webkit-mask-image: linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent);
                }
                .overflow-x-auto::-webkit-scrollbar {
                    display: none;
                }
                .overflow-x-auto {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(16px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up {
                    animation: fadeInUp 0.8s ease-out forwards;
                }
                .animate-fade-in-up-delay {
                    animation: fadeInUp 0.8s ease-out 0.3s forwards;
                    opacity: 0;
                }
            `}</style>

            {/* HOME */}
            {activeTab === 'HOME' && (() => {
                const phrases = [
                    "O sucesso é a soma de pequenos esforços repetidos dia após dia.",
                    "Quem veste Libera, veste atitude.",
                    "A disciplina é a ponte entre metas e conquistas.",
                    "Cada peça costurada carrega uma história.",
                    "O extraordinário nasce do compromisso com o ordinário.",
                    "Não espere pela oportunidade. Crie-a.",
                    "A excelência não é um ato, é um hábito.",
                    "Grandes confecções começam com grandes decisões.",
                    "O trabalho duro vence o talento quando o talento não trabalha duro.",
                    "Vista Libera. Viva a liberdade.",
                    "A persistência é o caminho do êxito.",
                    "Cada corte, cada costura, cada detalhe importa.",
                    "Sonhe grande. Comece agora. Não pare.",
                    "O melhor momento para começar foi ontem. O segundo melhor é agora.",
                    "Produzir com excelência é uma forma de respeito ao cliente.",
                    "A diferença entre o possível e o impossível está na determinação.",
                    "Transformamos tecido em identidade.",
                    "Seja a energia que você quer atrair.",
                    "Quando parece impossível, é porque está perto de acontecer.",
                    "De Goiânia para o mundo. Sem limites."
                ];
                const todayIndex = Math.floor(Date.now() / 86400000) % phrases.length;
                const phrase = phrases[todayIndex];

                return (
                    <div className="max-w-5xl mx-auto px-6 flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 65px)' }}>
                        {/* Módulos */}
                        <div className="w-full mb-12 md:mb-16 animate-fade-in-up">
                            <div className="grid grid-cols-3 gap-2.5 md:gap-3 max-w-md md:max-w-2xl mx-auto">
                                {[
                                    { id: 'HOME', icon: Home, label: 'Início', color: 'group-hover:text-white' },
                                    { id: 'VENDAS', icon: ShoppingCart, label: 'Vendas', color: 'group-hover:text-blue-400' },
                                    { id: 'PRODUÇÃO', icon: Layers, label: 'Fábrica', color: 'group-hover:text-[#39FF14]' },
                                    { id: 'ESTOQUE', icon: Box, label: 'Estoque', color: 'group-hover:text-purple-400' },
                                    { id: 'FINANCEIRO', icon: Wallet, label: 'Financeiro', color: 'group-hover:text-orange-400' },
                                    { id: 'CAIXA', icon: DollarSign, label: 'Caixa', color: 'group-hover:text-emerald-400' },
                                ].map((mod) => {
                                    const Icon = mod.icon;
                                    return (
                                        <button
                                            key={mod.id}
                                            onClick={() => setActiveTab(mod.id as any)}
                                            className="group bg-zinc-950 border border-zinc-900 rounded-2xl py-4 px-2 flex flex-col items-center gap-2 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all hover:scale-[1.03] active:scale-95"
                                        >
                                            <Icon size={20} className={`text-zinc-600 transition-colors ${mod.color}`} />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 group-hover:text-white transition-colors">
                                                {mod.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Frase motivacional */}
                        <div className="text-center max-w-lg animate-fade-in-up-delay">
                            <p className="text-zinc-600 text-lg md:text-2xl font-light italic leading-relaxed tracking-wide">
                                &ldquo;{phrase}&rdquo;
                            </p>
                            <div className="mt-6 w-12 h-[2px] bg-zinc-800 mx-auto rounded-full" />
                            <p className="mt-4 text-zinc-800 text-[9px] font-black uppercase tracking-[0.3em]">
                                Libera Sports
                            </p>
                        </div>
                    </div>
                );
            })()}

            {/* Tab Navigation (visible when NOT on HOME) */}
            {activeTab !== 'HOME' && (
                <div className="max-w-5xl mx-auto px-4 md:px-6 mt-4 md:mt-6">
                    <div className="flex gap-1.5 p-1 bg-zinc-950 rounded-2xl border border-zinc-900 overflow-x-auto mask-fade">
                        <button
                            onClick={() => setActiveTab('HOME')}
                            className="flex items-center gap-1 px-3 py-2.5 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all text-zinc-500 hover:text-white hover:bg-zinc-900 shrink-0"
                        >
                            <Home size={12} />
                        </button>
                        {[
                            { id: 'VENDAS', icon: ShoppingCart, label: 'Vendas' },
                            { id: 'PRODUÇÃO', icon: Layers, label: 'Fábrica' },
                            { id: 'ESTOQUE', icon: Box, label: 'Estoque' },
                            { id: 'FINANCEIRO', icon: Wallet, label: 'Financeiro' },
                            { id: 'CAIXA', icon: DollarSign, label: 'Caixa' }
                        ].map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`
                                        flex items-center gap-1.5 px-3.5 md:px-5 py-2.5 rounded-xl font-black uppercase text-[10px] md:text-[11px] tracking-wider transition-all shrink-0
                                        ${isActive
                                            ? 'bg-[#39FF14] text-black shadow-lg shadow-[#39FF14]/20'
                                            : 'text-zinc-500 hover:text-white hover:bg-zinc-900'
                                        }
                                    `}
                                >
                                    <Icon size={12} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <main className="max-w-5xl mx-auto px-4 py-5 md:p-8">
                {activeTab === 'PRODUÇÃO' && (
                    <>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6">
                            <div className="pl-1">
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
                                        <div key={order.id} className={`bg-[#0a0a0a] rounded-2xl md:rounded-[32px] p-4 md:p-6 border transition-all group relative overflow-hidden ${order.status === 'PENDÊNCIA' ? 'border-red-500/30' : 'border-zinc-900 hover:border-zinc-800'}`}>
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
                                                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                                                        <span className="text-zinc-600 text-[9px] font-black uppercase tracking-widest">
                                                            {order.order_number || `#${order.id.slice(0, 5).toUpperCase()}`}
                                                        </span>
                                                        <span className="bg-zinc-900 text-zinc-400 px-1.5 py-0.5 rounded text-[8px] font-bold flex items-center gap-1">
                                                            <Clock size={8} /> {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                                        </span>
                                                        <span className="bg-zinc-900 text-zinc-400 px-1.5 py-0.5 rounded text-[8px] font-bold flex items-center gap-1">
                                                            <Calendar size={8} /> {order.deadline.split('-').reverse().join('/')}
                                                        </span>
                                                        <span className="bg-zinc-900 text-[#39FF14] px-1.5 py-0.5 rounded text-[8px] font-bold flex items-center gap-1 uppercase">
                                                            <Truck size={8} /> {order.delivery_method}
                                                        </span>
                                                        <span className="bg-zinc-900 text-orange-500 px-1.5 py-0.5 rounded text-[8px] font-bold flex items-center gap-1 uppercase">
                                                            <TrendingUp size={8} /> {order.payment_method || 'PIX'}
                                                        </span>
                                                    </div>

                                                    <div className="flex-1">
                                                        <div className="flex items-center justify-between mb-4 gap-2">
                                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-900 group-hover:border-white/30 transition-all shadow-inner shrink-0">
                                                                    <User className="text-[#39FF14]" size={18} />
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <h3 className="text-sm md:text-2xl font-black tracking-tighter text-white uppercase italic break-words">
                                                                            {order.client}
                                                                        </h3>
                                                                        <div className="flex items-center gap-1 shrink-0">
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
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                <button
                                                                    onClick={() => handlePrintOrder(order)}
                                                                    className="p-2 md:p-3 rounded-lg md:rounded-xl bg-zinc-950 border border-zinc-900 text-zinc-700 hover:text-[#39FF14] hover:border-[#39FF14]/30 transition-all"
                                                                    title="Gerar PDF / Imprimir"
                                                                >
                                                                    <FileText size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteOrder(order.id, order.order_number)}
                                                                    className="p-2 md:p-3 rounded-lg md:rounded-xl bg-zinc-950 border border-zinc-900 text-zinc-700 hover:text-[#FF3D00] hover:border-[#FF3D00]/30 transition-all"
                                                                    title="Excluir Pedido"
                                                                >
                                                                    <Trash2 size={14} />
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
                                                    <div className="mb-8 mt-4 md:mt-6 px-0 overflow-x-auto pb-6 mask-fade">
                                                        <div className="relative flex justify-between items-center h-1 bg-zinc-900 rounded-full min-w-[550px] mx-2">
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
                    </>
                )}

                {activeTab === 'ESTOQUE' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-end mb-6">
                            <div>
                                <h1 className="text-4xl font-black italic uppercase tracking-tighter">ESTOQUE DE VAREJO</h1>
                                <p className="text-zinc-500 text-sm mt-1">Gestão de produtos e preços</p>
                            </div>
                            <button
                                onClick={() => setIsProductModalOpen(true)}
                                className="bg-[#39FF14] text-black px-6 py-3 rounded-xl font-black uppercase text-[10px] hover:scale-105 transition-all"
                            >
                                + Novo Produto
                            </button>
                        </div>

                        {stockLoading ? (
                            <div className="flex justify-center py-20">
                                <Loader2 className="animate-spin text-[#39FF14]" size={40} />
                            </div>
                        ) : products.length === 0 ? (
                            <div className="bg-zinc-950 rounded-3xl border border-zinc-900 p-8 text-center border-dashed">
                                <Box size={40} className="text-zinc-800 mx-auto mb-4" />
                                <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest">Nenhum produto cadastrado no estoque.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {products.map((p) => (
                                    <div key={p.id} className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-[32px] hover:border-[#39FF14]/30 transition-all">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-800">
                                                <Box size={20} className="text-[#39FF14]" />
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Em Estoque</p>
                                                <p className={`text-xl font-black ${p.stock <= 5 ? 'text-orange-500' : 'text-white'}`}>{p.stock} un</p>
                                            </div>
                                        </div>
                                        <h3 className="text-xl font-black italic uppercase text-white mb-2">{p.name}</h3>
                                        <div className="grid grid-cols-2 gap-4 mt-6">
                                            <div>
                                                <p className="text-[9px] text-zinc-600 font-bold uppercase">Preço Venda</p>
                                                <p className="text-lg font-black text-[#39FF14]">R$ {p.sale_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] text-zinc-600 font-bold uppercase">Preço Custo</p>
                                                <p className="text-lg font-black text-zinc-400">R$ {p.cost_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'VENDAS' && (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
                            <div className="pl-1">
                                <h1 className="text-2xl md:text-4xl font-black italic uppercase tracking-tighter">CHECKOUT</h1>
                                <p className="text-zinc-500 text-sm mt-1">Registro rápido de vendas</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Product Selection List */}
                            <div className="lg:col-span-2 space-y-4">
                                <h3 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                    <Plus size={12} className="text-[#39FF14]" /> Selecione os Produtos
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {products.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => addToCart(p)}
                                            disabled={p.stock <= 0}
                                            className="bg-zinc-950 border border-zinc-900 p-4 rounded-2xl flex items-center justify-between hover:border-[#39FF14]/30 transition-all group disabled:opacity-50"
                                        >
                                            <div className="text-left">
                                                <p className="text-sm font-black text-white group-hover:text-[#39FF14] transition-colors">{p.name}</p>
                                                <p className="text-[10px] text-zinc-500 font-bold uppercase">R$ {p.sale_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} • {p.stock} un</p>
                                            </div>
                                            <Plus size={16} className="text-zinc-700 group-hover:text-[#39FF14]" />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Cart / Checkout Summary */}
                            <div className="bg-zinc-950 border border-zinc-900 rounded-[32px] p-6 h-fit sticky top-24">
                                <h3 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <ShoppingCart size={12} className="text-[#39FF14]" /> Resumo da Venda
                                </h3>

                                <div className="space-y-4 mb-8">
                                    {cart.length === 0 ? (
                                        <p className="text-zinc-700 text-[10px] font-bold uppercase text-center py-6">Carrinho vazio</p>
                                    ) : (
                                        cart.map(item => (
                                            <div key={item.id} className="flex justify-between items-center group">
                                                <div>
                                                    <p className="text-[11px] font-black text-white uppercase">{item.name}</p>
                                                    <p className="text-[9px] text-zinc-500 font-bold uppercase">{item.quantity}x R$ {item.sale_price.toLocaleString('pt-BR')}</p>
                                                </div>
                                                <button onClick={() => removeFromCart(item.id)} className="text-zinc-800 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="space-y-4 mb-6">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-[#39FF14] mb-2 font-bold italic">Forma de Pagamento</label>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {['PIX', 'BOLETO', 'CARTÃO CRÉDITO', 'CARTÃO DÉBITO', 'OUTROS'].map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => {
                                                    setPaymentMethod(m as any);
                                                    if (m !== 'CARTÃO CRÉDITO') setInstallments(1);
                                                }}
                                                className={`p-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${paymentMethod === m
                                                    ? 'border-[#39FF14] bg-[#39FF14]/10 text-[#39FF14]'
                                                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700'
                                                    }`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[9px] font-black uppercase tracking-widest mb-1 text-zinc-500">
                                                Data
                                            </label>
                                            <input
                                                type="date"
                                                value={transactionDate}
                                                onChange={e => setTransactionDate(e.target.value)}
                                                required
                                                className="w-full bg-zinc-950/80 border border-zinc-900 rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] transition-all [color-scheme:dark] text-xs"
                                            />
                                        </div>
                                        {paymentMethod === 'CARTÃO CRÉDITO' && (
                                            <div>
                                                <label className="block text-[9px] font-black uppercase tracking-widest mb-1 text-[#39FF14]">
                                                    Parcelas
                                                </label>
                                                <select
                                                    value={installments}
                                                    onChange={e => setInstallments(parseInt(e.target.value))}
                                                    className="w-full bg-zinc-950/80 border border-zinc-900 rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] transition-all appearance-none text-center text-xs"
                                                >
                                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(num => (
                                                        <option key={num} value={num}>
                                                            {num}x
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="border-t border-zinc-900 pt-6 mt-6">
                                    <div className="flex justify-between items-end mb-6">
                                        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Total</p>
                                        <p className="text-2xl font-black text-[#39FF14]">R$ {cartTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    <button
                                        onClick={handleCheckout}
                                        disabled={cart.length === 0 || loading}
                                        className="w-full bg-[#39FF14] text-black py-4 rounded-2xl font-black uppercase text-sm tracking-widest hover:scale-105 transition-all shadow-xl shadow-[#39FF14]/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? 'Processando...' : 'Finalizar Venda'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Histórico de Vendas */}
                        <div className="mt-12 space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                    <History size={12} className="text-[#39FF14]" /> Histórico Recente de Vendas
                                </h3>
                                {sales.length > 0 && (
                                    <button
                                        onClick={() => {
                                            const printContent = `
                                                <html><head><title>Relatório de Vendas - Libera Sports</title>
                                                <style>
                                                    * { margin: 0; padding: 0; box-sizing: border-box; }
                                                    body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
                                                    h1 { font-size: 20px; margin-bottom: 4px; }
                                                    .sub { font-size: 11px; color: #888; margin-bottom: 20px; }
                                                    table { width: 100%; border-collapse: collapse; font-size: 11px; }
                                                    th { background: #111; color: #fff; text-align: left; padding: 8px 10px; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; }
                                                    td { padding: 8px 10px; border-bottom: 1px solid #eee; }
                                                    .total-row { font-weight: bold; background: #f5f5f5; }
                                                    .total-row td { border-top: 2px solid #111; }
                                                    .right { text-align: right; }
                                                    .green { color: #16a34a; }
                                                </style></head><body>
                                                <h1>LIBERA SPORTS</h1>
                                                <p class="sub">Relatório de Vendas • Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
                                                <table>
                                                    <thead><tr><th>Venda</th><th>Data</th><th>Itens</th><th>Pagamento</th><th class="right">Valor</th></tr></thead>
                                                    <tbody>
                                                        ${sales.map((s: any) => `<tr>
                                                            <td>${s.sale_number}</td>
                                                            <td>${new Date(s.created_at).toLocaleDateString('pt-BR')}</td>
                                                            <td>${s.items?.map((i: any) => `${i.quantity}x ${i.name}`).join('<br>')}</td>
                                                            <td>${s.payment_method || '-'}</td>
                                                            <td class="right">R$ ${s.total?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                        </tr>`).join('')}
                                                        <tr class="total-row">
                                                            <td colspan="4">TOTAL (${sales.length} vendas)</td>
                                                            <td class="right green">R$ ${sales.reduce((a: number, s: any) => a + (s.total || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                </body></html>`;
                                            const w = window.open('', '_blank');
                                            if (w) { w.document.write(printContent); w.document.close(); w.print(); }
                                        }}
                                        className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-[#39FF14] transition-colors flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-800 hover:border-[#39FF14]/50"
                                    >
                                        <FileText size={12} /> Relatório PDF
                                    </button>
                                )}
                            </div>
                            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl md:rounded-[32px] overflow-hidden">
                                {sales.length === 0 ? (
                                    <div className="p-12 text-center text-zinc-700 font-bold uppercase text-[10px] tracking-widest italic">Nenhuma venda registrada até o momento</div>
                                ) : (
                                    <div className="divide-y divide-zinc-900">
                                        {sales.map(sale => {
                                            const isExpanded = expandedSaleIds[sale.id];
                                            const summary = sale.items?.map((i: any) => `${i.quantity}x ${i.name}`).join(', ') || '';
                                            return (
                                                <div key={sale.id} className="p-4 md:p-6 hover:bg-zinc-900/30 transition-colors">
                                                    <div className="flex justify-between items-start gap-3">
                                                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedSaleIds(prev => prev[sale.id] ? {} : { [sale.id]: true })}>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-[#39FF14]">{sale.sale_number}</span>
                                                                <span className="text-[10px] text-zinc-600 font-bold">•</span>
                                                                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{new Date(sale.created_at).toLocaleDateString('pt-BR')}</span>
                                                                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">{sale.payment_method}</span>
                                                            </div>
                                                            {!isExpanded ? (
                                                                <p className="text-[11px] font-bold text-zinc-300 italic mt-1 line-clamp-1">
                                                                    {summary}
                                                                </p>
                                                            ) : (
                                                                <div className="mt-2 space-y-1.5">
                                                                    {sale.items?.map((item: any, idx: number) => (
                                                                        <div key={idx} className="flex flex-wrap justify-between text-[11px] bg-zinc-900/50 rounded-xl px-3 py-2 gap-x-4">
                                                                            <span className="font-bold text-white">{item.quantity}x {item.name}</span>
                                                                            <span className="font-bold text-zinc-400 ml-auto">R$ {((item.sale_price || item.price || 0) * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <p className="text-[9px] text-zinc-600 mt-1">
                                                                {isExpanded ? 'Toque para fechar' : 'Toque para ver detalhes'}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <p className="text-base md:text-xl font-black text-white tabular-nums">
                                                                R$ {sale.total?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </p>
                                                            <button
                                                                onClick={() => handleDeleteSale(sale.id)}
                                                                disabled={loading}
                                                                className="bg-red-500/10 text-red-500 p-2.5 rounded-xl hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                                                                title="Excluir Venda"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                )}

                {/* =================== FINANCEIRO - Contas a Pagar / Receber =================== */}
                {activeTab === 'FINANCEIRO' && (
                    <div className="space-y-4 md:space-y-6">
                        <div className="flex justify-between items-start gap-3">
                            <div>
                                <h1 className="text-2xl md:text-4xl font-black italic uppercase tracking-tighter">FINANCEIRO</h1>
                                <p className="text-zinc-500 text-[11px] md:text-sm mt-0.5">Gestão de contas a pagar e a receber</p>
                            </div>
                            {financeView === 'A PAGAR' && (
                                <button
                                    onClick={() => setIsFinanceModalOpen(true)}
                                    className="bg-[#39FF14] text-black px-4 md:px-6 py-2.5 md:py-3 rounded-2xl font-black uppercase text-[9px] md:text-[10px] tracking-widest hover:scale-105 transition-all shadow-lg shadow-[#39FF14]/20 flex items-center gap-1.5 shrink-0"
                                >
                                    <Plus size={14} /> Nova Conta
                                </button>
                            )}
                        </div>

                        {/* Toggle Contas a Pagar / Receber */}
                        <div className="flex gap-2 p-1 bg-zinc-950 rounded-2xl">
                            <button
                                onClick={() => setFinanceView('A PAGAR')}
                                className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 ${financeView === 'A PAGAR' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-zinc-500 hover:text-white'}`}
                            >
                                <ArrowDownLeft size={14} /> Contas a Pagar
                            </button>
                            <button
                                onClick={() => setFinanceView('A RECEBER')}
                                className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 ${financeView === 'A RECEBER' ? 'bg-[#39FF14] text-black shadow-lg shadow-[#39FF14]/20' : 'text-zinc-500 hover:text-white'}`}
                            >
                                <ArrowUpRight size={14} /> Contas a Receber
                            </button>
                        </div>

                        {/* Cards resumo */}
                        <div className="grid grid-cols-3 gap-2 md:gap-4">
                            {financeView === 'A PAGAR' ? (
                                <>
                                    <div className="bg-zinc-950 p-3 md:p-6 rounded-2xl md:rounded-[32px] border border-zinc-900">
                                        <p className="text-zinc-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest mb-0.5">Total a Pagar</p>
                                        <p className="text-lg md:text-3xl font-black text-red-500 tabular-nums">
                                            R$ {financialItems.filter(i => i.type === 'OUTFLOW' && (i.status === 'A PAGAR' || i.status === 'ATRASADO')).reduce((a: number, i: any) => a + i.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="bg-zinc-950 p-3 md:p-6 rounded-2xl md:rounded-[32px] border border-zinc-900">
                                        <p className="text-zinc-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest mb-0.5">Atrasadas</p>
                                        <p className="text-lg md:text-3xl font-black text-orange-500 tabular-nums">
                                            {financialItems.filter(i => i.type === 'OUTFLOW' && i.status === 'ATRASADO').length}
                                        </p>
                                    </div>
                                    <div className="bg-zinc-950 p-3 md:p-6 rounded-2xl md:rounded-[32px] border border-zinc-900">
                                        <p className="text-zinc-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest mb-0.5">Pagas este mês</p>
                                        <p className="text-lg md:text-3xl font-black text-[#39FF14] tabular-nums">
                                            R$ {financialItems.filter(i => {
                                                if (i.type !== 'OUTFLOW' || i.status !== 'PAGO' || !i.paid_at) return false;
                                                const d = new Date(i.paid_at);
                                                return d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
                                            }).reduce((a: number, i: any) => a + i.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="bg-zinc-950 p-3 md:p-6 rounded-2xl md:rounded-[32px] border border-zinc-900">
                                        <p className="text-zinc-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest mb-0.5">Total a Receber</p>
                                        <p className="text-lg md:text-3xl font-black text-[#39FF14] tabular-nums">
                                            R$ {financialItems.filter(i => i.type === 'INFLOW' && (i.status === 'A RECEBER' || i.status === 'PENDENTE' || i.status === 'ATRASADO')).reduce((a: number, i: any) => a + i.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="bg-zinc-950 p-3 md:p-6 rounded-2xl md:rounded-[32px] border border-zinc-900">
                                        <p className="text-zinc-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest mb-0.5">Atrasadas</p>
                                        <p className="text-lg md:text-3xl font-black text-orange-500 tabular-nums">
                                            {financialItems.filter(i => i.type === 'INFLOW' && i.status === 'ATRASADO').length}
                                        </p>
                                    </div>
                                    <div className="bg-zinc-950 p-3 md:p-6 rounded-2xl md:rounded-[32px] border border-zinc-900">
                                        <p className="text-zinc-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest mb-0.5">Recebidas este mês</p>
                                        <p className="text-3xl font-black text-[#39FF14] tabular-nums">
                                            R$ {financialItems.filter(i => {
                                                if (i.type !== 'INFLOW' || (i.status !== 'RECEBIDO' && i.status !== 'PAGO') || !i.paid_at) return false;
                                                const d = new Date(i.paid_at);
                                                return d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
                                            }).reduce((a: number, i: any) => a + i.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Lista de contas */}
                        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl md:rounded-[32px] overflow-hidden">
                            <div className="p-4 md:p-6 border-b border-zinc-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                <h3 className="text-zinc-500 text-[9px] md:text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                    {financeView === 'A PAGAR' ? <><ArrowDownLeft size={11} /> Contas a Pagar</> : <><ArrowUpRight size={11} /> Contas a Receber</>}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2">
                                    <select
                                        value={financeFilterYear}
                                        onChange={e => setFinanceFilterYear(parseInt(e.target.value))}
                                        className="bg-zinc-900 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] transition-colors appearance-none"
                                    >
                                        {[financeFilterYear - 1, financeFilterYear, financeFilterYear + 1].map(y => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={financeFilterMonth}
                                        onChange={e => setFinanceFilterMonth(parseInt(e.target.value))}
                                        className="bg-zinc-900 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] transition-colors appearance-none"
                                    >
                                        <option value={-1}>Ano todo</option>
                                        {Array.from({ length: 12 }, (_, i) => {
                                            const date = new Date(2000, i, 1);
                                            return <option key={i} value={i}>{date.toLocaleString('pt-BR', { month: 'long' })}</option>;
                                        })}
                                    </select>
                                </div>
                            </div>

                            <div className="divide-y divide-zinc-900">
                                {(() => {
                                    const filtered = financialItems.filter(item => {
                                        const isCorrectType = financeView === 'A PAGAR' ? item.type === 'OUTFLOW' : item.type === 'INFLOW';
                                        if (!isCorrectType) return false;
                                        const dateStr = item.due_date || item.transaction_date || item.created_at;
                                        const datePart = dateStr.split('T')[0];
                                        const [y, m] = datePart.split('-').map(Number);
                                        if (y !== financeFilterYear) return false;
                                        if (financeFilterMonth === -1) return true;
                                        return (m - 1) === financeFilterMonth;
                                    }).sort((a: any, b: any) => {
                                        const priority: Record<string, number> = { ATRASADO: 0, 'A PAGAR': 1, 'A RECEBER': 1, PENDENTE: 1, PAGO: 2, RECEBIDO: 2 };
                                        return (priority[a.status] ?? 1) - (priority[b.status] ?? 1);
                                    });

                                    if (filtered.length === 0) {
                                        return <div className="p-12 text-center text-zinc-700 font-bold uppercase text-[10px] tracking-widest italic">Nenhuma conta no período</div>;
                                    }

                                    return filtered.map(item => (
                                        <div key={item.id} className="p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between hover:bg-zinc-900/50 transition-colors gap-3 md:gap-4">
                                            <div className="flex items-center gap-3 w-full md:w-auto">
                                                <div className={`p-2 md:p-3 rounded-xl md:rounded-2xl shrink-0 ${item.type === 'INFLOW' ? 'bg-[#39FF14]/10 text-[#39FF14]' : 'bg-red-500/10 text-red-500'}`}>
                                                    {item.type === 'INFLOW' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[12px] md:text-sm font-black text-white uppercase truncate">{item.description}</p>
                                                    <p className="text-[9px] md:text-[10px] text-zinc-500 font-semibold uppercase">
                                                        Venc: {new Date(item.due_date || item.transaction_date || item.created_at).toLocaleDateString('pt-BR')}
                                                        {item.payment_method && <span className="ml-1.5 text-zinc-600">• {item.payment_method}</span>}
                                                    </p>
                                                    {item.observations && <p className="text-[9px] text-zinc-600 italic mt-0.5 truncate">{item.observations}</p>}
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between w-full md:w-auto md:justify-end gap-3 shrink-0 pl-10 md:pl-0">
                                                <div className="text-right">
                                                    <p className={`text-base md:text-lg font-black ${item.type === 'INFLOW' ? 'text-[#39FF14]' : 'text-red-500'}`}>
                                                        {item.type === 'INFLOW' ? '+' : '-'} R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </p>
                                                    <div className="flex justify-end mt-1 gap-1.5 items-center">
                                                        {item.status === 'PAGO' || item.status === 'RECEBIDO' ? (
                                                            <span className="text-[8px] font-black uppercase px-3 py-1 rounded-full bg-green-500/20 text-green-400">
                                                                {item.status} {item.paid_at ? `em ${new Date(item.paid_at).toLocaleDateString('pt-BR')}` : ''}
                                                            </span>
                                                        ) : (
                                                            <>
                                                                <span className={`text-[8px] font-black uppercase px-3 py-1 rounded-full ${item.status === 'ATRASADO' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                                                    {item.status}
                                                                </span>
                                                                <button
                                                                    onClick={() => handleUpdateFinanceEntry(item.id, {
                                                                        status: item.type === 'OUTFLOW' ? 'PAGO' : 'RECEBIDO',
                                                                        paid_at: new Date().toISOString()
                                                                    })}
                                                                    className={`text-[8px] font-black uppercase px-3 py-1 rounded-full transition-all hover:scale-105 ${item.type === 'OUTFLOW' ? 'bg-green-500 text-black' : 'bg-[#39FF14] text-black'}`}
                                                                >
                                                                    {item.type === 'OUTFLOW' ? 'PAGAR' : 'RECEBER'}
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <button onClick={() => {
                                                        setEditingFinanceItem({
                                                            ...item,
                                                            editDesc: item.description,
                                                            editAmount: item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                                                            editDueDate: (item.due_date || item.transaction_date || item.created_at).split('T')[0],
                                                            editPayMethod: item.payment_method || 'PIX',
                                                            editObs: item.observations || '',
                                                        });
                                                    }} className="text-zinc-600 hover:text-[#39FF14] transition-colors p-2" title="Editar conta">
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button onClick={async () => {
                                                        try {
                                                            await deleteDoc(doc(db, financeCollectionPath, item.id));
                                                            toast.success('Conta excluída!');
                                                        } catch (err) {
                                                            console.error('Erro ao excluir:', err);
                                                            toast.error('Erro ao excluir conta');
                                                        }
                                                    }} className="text-zinc-600 hover:text-red-500 transition-colors p-2" title="Excluir conta">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal Editar Conta */}
                {editingFinanceItem && (
                    <div className="fixed inset-0 bg-black/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl">
                        <div className="bg-zinc-900 w-full max-w-xl p-8 rounded-[32px] border border-zinc-800 shadow-2xl relative text-white max-h-[90vh] overflow-y-auto">
                            <button
                                onClick={() => setEditingFinanceItem(null)}
                                className="absolute right-6 top-6 text-zinc-500 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>

                            <div className="mb-6">
                                <h3 className="text-2xl font-black italic uppercase text-white flex items-center gap-3">
                                    <Pencil size={24} className="text-[#39FF14]" /> EDITAR CONTA
                                </h3>
                            </div>

                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                try {
                                    await handleUpdateFinanceEntry(editingFinanceItem.id, {
                                        description: editingFinanceItem.editDesc.toUpperCase(),
                                        amount: parseBRL(editingFinanceItem.editAmount),
                                        due_date: editingFinanceItem.editDueDate,
                                        payment_method: editingFinanceItem.editPayMethod,
                                        observations: editingFinanceItem.editObs,
                                    });
                                    toast.success('Conta atualizada!');
                                    setEditingFinanceItem(null);
                                } catch (err) {
                                    toast.error('Erro ao atualizar');
                                }
                            }} className="space-y-5">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Descrição</label>
                                    <input
                                        type="text"
                                        value={editingFinanceItem.editDesc}
                                        onChange={e => setEditingFinanceItem({ ...editingFinanceItem, editDesc: e.target.value })}
                                        required
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Valor (R$)</label>
                                    <input
                                        type="text"
                                        value={editingFinanceItem.editAmount}
                                        onChange={e => setEditingFinanceItem({ ...editingFinanceItem, editAmount: formatCurrency(e.target.value) })}
                                        required
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Data de Vencimento</label>
                                    <input
                                        type="date"
                                        value={editingFinanceItem.editDueDate}
                                        onChange={e => setEditingFinanceItem({ ...editingFinanceItem, editDueDate: e.target.value })}
                                        required
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold [color-scheme:dark]"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Forma de Pagamento</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['PIX', 'BOLETO', 'CARTÃO CRÉDITO', 'CARTÃO DÉBITO', 'OUTRO'].map(pm => (
                                            <button
                                                key={pm}
                                                type="button"
                                                onClick={() => setEditingFinanceItem({ ...editingFinanceItem, editPayMethod: pm })}
                                                className={`px-4 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${editingFinanceItem.editPayMethod === pm ? 'bg-[#39FF14] text-black shadow-lg shadow-[#39FF14]/20' : 'bg-zinc-950 text-zinc-500 hover:text-white'}`}
                                            >
                                                {pm}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Observação</label>
                                    <textarea
                                        value={editingFinanceItem.editObs}
                                        onChange={e => setEditingFinanceItem({ ...editingFinanceItem, editObs: e.target.value })}
                                        placeholder="Informações adicionais..."
                                        rows={2}
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-700 resize-none"
                                    />
                                </div>

                                <div className="flex gap-4 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditingFinanceItem(null)}
                                        className="flex-1 bg-zinc-800 py-4 rounded-xl font-bold uppercase text-xs hover:bg-zinc-700 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 bg-[#39FF14] text-black py-4 rounded-xl font-black uppercase text-xs hover:scale-105 transition-all shadow-lg shadow-[#39FF14]/10"
                                    >
                                        Salvar Alterações
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* =================== FLUXO DE CAIXA =================== */}
                {activeTab === 'CAIXA' && (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
                            <div className="pl-1">
                                <h1 className="text-4xl font-black italic uppercase tracking-tighter">FLUXO DE CAIXA</h1>
                                <p className="text-zinc-500 text-sm mt-1">Visão geral de entradas e saídas</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div className="bg-zinc-950 p-8 rounded-[32px] border border-zinc-900 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                    <Wallet size={40} className="text-[#39FF14]" />
                                </div>
                                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">Saldo em Caixa</p>
                                <p className="text-4xl font-black text-[#39FF14] tabular-nums">R$ {financeStats.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="bg-zinc-950 p-8 rounded-[32px] border border-zinc-900 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                    <ArrowUpCircle size={40} className="text-blue-500" />
                                </div>
                                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">Vendas Hoje</p>
                                <p className="text-4xl font-black text-white tabular-nums">R$ {financeStats.todaySales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="bg-zinc-950 p-8 rounded-[32px] border border-zinc-900 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                    <ArrowDownCircle size={40} className="text-orange-500" />
                                </div>
                                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">Previsão Recebiveis</p>
                                <p className="text-4xl font-black text-orange-500 tabular-nums">R$ {financeStats.pendingReceivables.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                        </div>

                        <div className="bg-zinc-950 border border-zinc-900 rounded-[32px] overflow-hidden">
                            <div className="p-6 border-b border-zinc-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <h3 className="text-zinc-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                    <Clock size={12} /> Movimentações por Período
                                </h3>
                                <div className="flex flex-wrap items-center gap-2">
                                    <select
                                        value={financeGrouping}
                                        onChange={e => setFinanceGrouping(e.target.value as any)}
                                        className="bg-zinc-900 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] transition-colors appearance-none"
                                    >
                                        <option value="DAILY">Diário</option>
                                        <option value="WEEKLY">Semanal</option>
                                        <option value="MONTHLY">Mensal</option>
                                        <option value="YEARLY">Anual</option>
                                    </select>

                                    {financeGrouping !== 'YEARLY' && (
                                        <select
                                            value={financeFilterMonth}
                                            onChange={e => setFinanceFilterMonth(parseInt(e.target.value))}
                                            className="bg-zinc-900 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] transition-colors appearance-none"
                                        >
                                            {Array.from({ length: 12 }, (_, i) => {
                                                const date = new Date(2000, i, 1);
                                                return <option key={i} value={i}>{date.toLocaleString('pt-BR', { month: 'long' })}</option>;
                                            })}
                                        </select>
                                    )}

                                    <select
                                        value={financeFilterYear}
                                        onChange={e => setFinanceFilterYear(parseInt(e.target.value))}
                                        className="bg-zinc-900 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] transition-colors appearance-none"
                                    >
                                        {[financeFilterYear - 1, financeFilterYear, financeFilterYear + 1].map(y => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="divide-y divide-zinc-900">
                                {groupedFinancialItems.length === 0 ? (
                                    <div className="p-12 text-center text-zinc-700 font-bold uppercase text-[10px] tracking-widest italic">Nenhuma movimentação no período</div>
                                ) : (
                                    groupedFinancialItems.map(({ group, items, total }: { group: string, items: any[], total: number }) => (
                                        <div key={group}>
                                            <div className="bg-zinc-900/40 px-6 py-3 flex justify-between items-center text-[10px] font-black uppercase tracking-widest border-y border-zinc-900">
                                                <span className="text-zinc-400">{group}</span>
                                                <span className={total >= 0 ? 'text-[#39FF14]' : 'text-red-500'}>
                                                    R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                            {items.map(item => (
                                                <div key={item.id} className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between hover:bg-zinc-900/50 transition-colors gap-4">
                                                    <div className="flex items-center gap-4 w-full md:w-auto">
                                                        <div className={`p-3 rounded-2xl shrink-0 ${item.type === 'INFLOW' ? 'bg-[#39FF14]/10 text-[#39FF14]' : 'bg-red-500/10 text-red-500'}`}>
                                                            {item.type === 'INFLOW' ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-sm font-black text-white uppercase">{item.description}</p>
                                                            <p className="text-[10px] text-zinc-500 font-bold uppercase">
                                                                {new Date(item.due_date || item.transaction_date || item.created_at).toLocaleDateString('pt-BR')}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-4 shrink-0">
                                                        <div className="text-right">
                                                            <p className={`text-lg font-black ${item.type === 'INFLOW' ? 'text-[#39FF14]' : 'text-red-500'}`}>
                                                                {item.type === 'INFLOW' ? '+' : '-'} R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </p>
                                                            <span className={`text-[8px] font-black uppercase px-3 py-1 rounded-full ${
                                                                item.status === 'PAGO' || item.status === 'RECEBIDO' ? 'bg-green-500/20 text-green-400' :
                                                                item.status === 'ATRASADO' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
                                                            }`}>
                                                                {item.status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Seção antiga removida */}
                {false && (() => {
                    const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                    const today = new Date().toISOString().split('T')[0];

                    const monthContas = contasAPagar.filter(c => {
                        const d = new Date(c.due_date + 'T12:00:00');
                        return d.getFullYear() === contaYearFilter && d.getMonth() === contaMonthFilter;
                    });

                    const visibleContas = monthContas
                        .filter(c => contaStatusFilter === 'TODAS' || c.status === (contaStatusFilter === 'PAGAS' ? 'PAGO' : 'PENDENTE'))
                        .filter(c => contaGroupFilter === 'TODOS' || c.category_group === contaGroupFilter)
                        .sort((a: any, b: any) => {
                            const priority: Record<string, number> = { ATRASADO: 0, PENDENTE: 1, PAGO: 2 };
                            const sa = a.status === 'PENDENTE' && a.due_date < today ? 'ATRASADO' : a.status;
                            const sb = b.status === 'PENDENTE' && b.due_date < today ? 'ATRASADO' : b.status;
                            if (priority[sa] !== priority[sb]) return priority[sa] - priority[sb];
                            return a.due_date.localeCompare(b.due_date);
                        });

                    const totalMes = monthContas.reduce((s: number, c: any) => s + (c.amount || 0), 0);
                    const totalPago = monthContas.filter((c: any) => c.status === 'PAGO').reduce((s: number, c: any) => s + (c.amount || 0), 0);
                    const totalPendente = monthContas.filter((c: any) => c.status !== 'PAGO').reduce((s: number, c: any) => s + (c.amount || 0), 0);

                    const groupTotals = CONFECCAO_GROUPS
                        .map(g => ({ ...g, total: monthContas.filter((c: any) => c.category_group === g.group).reduce((s: number, c: any) => s + (c.amount || 0), 0) }))
                        .filter(g => g.total > 0);

                    return (
                        <div className="mt-10 border-t border-zinc-800 pt-8 space-y-6">
                            {/* Header */}
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                                <div>
                                    <h2 className="text-3xl font-black italic uppercase tracking-tighter flex items-center gap-3">✂️ Contas a Pagar</h2>
                                    <p className="text-zinc-500 text-sm mt-1">Gestão de contas a pagar da confecção</p>
                                </div>
                                <button
                                    onClick={() => { resetContaForm(); setContaModalOpen(true); }}
                                    className="bg-[#39FF14] text-black px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all shadow-lg shadow-[#39FF14]/20 flex items-center gap-2"
                                >
                                    <Plus size={16} /> Nova Conta
                                </button>
                            </div>

                            {/* Month selector */}
                            <div className="flex flex-wrap gap-2">
                                <select value={contaMonthFilter} onChange={e => setContaMonthFilter(parseInt(e.target.value))}
                                    className="bg-zinc-900 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] appearance-none">
                                    {Array.from({ length: 12 }, (_, i) => (
                                        <option key={i} value={i}>{new Date(2000, i, 1).toLocaleString('pt-BR', { month: 'long' })}</option>
                                    ))}
                                </select>
                                <select value={contaYearFilter} onChange={e => setContaYearFilter(parseInt(e.target.value))}
                                    className="bg-zinc-900 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] appearance-none">
                                    {[contaYearFilter - 1, contaYearFilter, contaYearFilter + 1].map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>

                            {/* Summary */}
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: 'Total Mês', value: totalMes, color: 'text-white' },
                                    { label: 'A Pagar', value: totalPendente, color: 'text-red-400' },
                                    { label: 'Pago', value: totalPago, color: 'text-[#39FF14]' },
                                ].map(s => (
                                    <div key={s.label} className="bg-zinc-950 rounded-[24px] border border-zinc-900 p-5 text-center">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">{s.label}</p>
                                        <p className={`text-2xl font-black tabular-nums ${s.color}`}>{fmtBRL(s.value)}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Group breakdown */}
                            {groupTotals.length > 0 && (
                                <div className="bg-zinc-950 border border-zinc-900 rounded-[24px] p-5">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-4">Por Categoria</p>
                                    <div className="space-y-2">
                                        {groupTotals.map(g => (
                                            <div key={g.group} className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ backgroundColor: g.color + '18' }}>
                                                <span className="text-sm font-bold" style={{ color: g.color }}>{g.emoji} {g.group}</span>
                                                <span className="text-sm font-black" style={{ color: g.color }}>{fmtBRL(g.total)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Filters */}
                            <div className="flex flex-wrap gap-2">
                                {(['TODAS', 'PENDENTES', 'PAGAS'] as const).map(s => (
                                    <button key={s} onClick={() => setContaStatusFilter(s)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${contaStatusFilter === s
                                            ? 'bg-[#39FF14] text-black border-[#39FF14]'
                                            : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-[#39FF14]/50'}`}
                                    >{s}</button>
                                ))}
                                <div className="w-px bg-zinc-800 mx-1" />
                                <button onClick={() => setContaGroupFilter('TODOS')}
                                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${contaGroupFilter === 'TODOS' ? 'bg-zinc-700 text-white border-zinc-600' : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-600'}`}
                                >Todos</button>
                                {CONFECCAO_GROUPS.map(g => (
                                    <button key={g.group} onClick={() => setContaGroupFilter(contaGroupFilter === g.group ? 'TODOS' : g.group)}
                                        className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border"
                                        style={contaGroupFilter === g.group
                                            ? { backgroundColor: g.color, color: '#000', borderColor: g.color }
                                            : { backgroundColor: 'transparent', color: g.color, borderColor: g.color + '40' }}
                                    >{g.emoji} {g.group}</button>
                                ))}
                            </div>

                            {/* List */}
                            <div className="bg-zinc-950 border border-zinc-900 rounded-[32px] overflow-hidden">
                                {visibleContas.length === 0 ? (
                                    <div className="p-12 text-center text-zinc-700 font-bold uppercase text-[10px] tracking-widest italic">
                                        {monthContas.length === 0 ? 'Nenhuma conta neste mês — clique em "Nova Conta" para começar.' : 'Nenhuma conta com esse filtro.'}
                                    </div>
                                ) : (
                                    <div className="divide-y divide-zinc-900">
                                        {visibleContas.map((conta: any) => {
                                            const isOverdue = conta.status === 'PENDENTE' && conta.due_date < today;
                                            const grp = CONFECCAO_GROUPS.find(g => g.group === conta.category_group);
                                            return (
                                                <div key={conta.id} className={`p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-zinc-900/30 transition-colors border-l-4 ${isOverdue ? 'border-red-500' : conta.status === 'PAGO' ? 'border-[#39FF14]' : 'border-zinc-700'}`}>
                                                    <div className="flex items-start gap-4 flex-1">
                                                        <div className="p-2 rounded-xl shrink-0 mt-0.5" style={{ backgroundColor: (grp?.color || '#6B7280') + '20' }}>
                                                            <span className="text-lg">{grp?.emoji || '📋'}</span>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                                <span className="text-sm font-black text-white uppercase">{conta.description}</span>
                                                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: (grp?.color || '#6B7280') + '20', color: grp?.color || '#6B7280' }}>
                                                                    {conta.category}
                                                                </span>
                                                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${conta.recurrence === 'FIXA' ? 'bg-blue-500/10 text-blue-400' : conta.recurrence === 'VARIAVEL' ? 'bg-orange-500/10 text-orange-400' : 'bg-zinc-800 text-zinc-400'}`}>
                                                                    {conta.recurrence === 'FIXA' ? '🔄 Fixa' : conta.recurrence === 'VARIAVEL' ? '📊 Variável' : '1️⃣ Única'}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-zinc-500 font-bold uppercase">
                                                                <span>Venc: {new Date(conta.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                                                <span>{conta.payment_method}</span>
                                                                {conta.status === 'PAGO' && conta.paid_date && (
                                                                    <span className="text-[#39FF14]">✅ Pago em {new Date(conta.paid_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                                                )}
                                                                {isOverdue && <span className="text-red-400">⚠️ ATRASADO</span>}
                                                            </div>
                                                            {conta.notes && <p className="text-[10px] text-zinc-600 mt-1 italic">{conta.notes}</p>}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0 justify-between md:justify-end">
                                                        <p className={`text-xl font-black tabular-nums ${conta.status === 'PAGO' ? 'text-[#39FF14]' : isOverdue ? 'text-red-400' : 'text-white'}`}>
                                                            {fmtBRL(conta.amount || 0)}
                                                        </p>
                                                        <div className="flex items-center gap-1">
                                                            {conta.status !== 'PAGO' ? (
                                                                <button onClick={() => handleMarkContaPaid(conta.id)}
                                                                    className="bg-[#39FF14] text-black px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-1">
                                                                    <Check size={12} /> Pagar
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => handleUndoContaPaid(conta.id)}
                                                                    className="text-zinc-600 hover:text-orange-400 transition-colors px-2 py-2 rounded-xl text-[9px] font-black uppercase">
                                                                    Desfazer
                                                                </button>
                                                            )}
                                                            <button onClick={() => {
                                                                setEditingConta(conta);
                                                                setContaDesc(conta.description);
                                                                setContaGroup(conta.category_group);
                                                                setContaCategory(conta.category);
                                                                setContaAmount(conta.amount.toString());
                                                                const d = new Date(conta.due_date + 'T12:00:00');
                                                                setContaDueDay(d.getDate().toString());
                                                                setContaPayMethod(conta.payment_method);
                                                                setContaRecurrence(conta.recurrence);
                                                                setContaNotes(conta.notes || '');
                                                                setContaModalOpen(true);
                                                            }} className="text-zinc-600 hover:text-white transition-colors p-2 rounded-xl">
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button onClick={() => setConfirmDeleteContaId(conta.id)} className="text-zinc-600 hover:text-red-500 transition-colors p-2 rounded-xl">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </main>

            {/* Modal Cadastro de Pedido */}
            {
                isModalOpen && (
                    <div className="fixed inset-0 bg-black/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl animate-in fade-in duration-300 overflow-y-auto">
                        <div className="bg-zinc-900 w-full max-w-xl p-6 md:p-8 rounded-[32px] border border-zinc-800 shadow-2xl relative my-auto">
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
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-[#39FF14] mb-2 font-bold italic">
                                                Valor Total {linkedSaleId && <span className="text-zinc-500 normal-case">(via venda vinculada)</span>}
                                            </label>
                                            <input
                                                type="text"
                                                value={value}
                                                onChange={e => handleValueChange(e.target.value)}
                                                disabled={!!linkedSaleId}
                                                className={`w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-700 ${linkedSaleId ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                placeholder="0,00"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">
                                            Data de Entrega
                                        </label>
                                        <input
                                            type="date"
                                            value={deadline}
                                            onChange={e => setDeadline(e.target.value)}
                                            required
                                            className="w-full max-w-[200px] bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all [color-scheme:dark]"
                                        />
                                    </div>
                                    <div>
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

                                    {/* Forma de Pagamento */}
                                    <div className="space-y-4">
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-[#39FF14] mb-2 font-bold italic">Forma de Pagamento</label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                            {['PIX', 'BOLETO', 'CARTÃO CRÉDITO', 'CARTÃO DÉBITO', 'OUTROS'].map((m) => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => {
                                                        setPaymentMethod(m as any);
                                                        if (m !== 'CARTÃO CRÉDITO') setInstallments(1);
                                                    }}
                                                    className={`p-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${paymentMethod === m
                                                        ? 'border-[#39FF14] bg-[#39FF14]/10 text-[#39FF14]'
                                                        : 'border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700'
                                                        }`}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">
                                            Data da Transação
                                        </label>
                                        <input
                                            type="date"
                                            value={transactionDate}
                                            onChange={e => setTransactionDate(e.target.value)}
                                            required
                                            className="w-full max-w-[200px] bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all [color-scheme:dark]"
                                        />
                                    </div>
                                    {paymentMethod === 'CARTÃO CRÉDITO' && (
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-[#39FF14]">
                                                Parcelas
                                            </label>
                                            <select
                                                value={installments}
                                                onChange={e => setInstallments(parseInt(e.target.value))}
                                                className="w-full max-w-[200px] bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all appearance-none"
                                            >
                                                {Array.from({ length: 12 }, (_, i) => i + 1).map(num => (
                                                    <option key={num} value={num}>
                                                        {num}x {num === 1 ? '(À Vista - 30 dias)' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                                Grade / Descrição
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={linkSale}
                                                    onChange={e => {
                                                        setLinkSale(e.target.checked);
                                                        if (!e.target.checked) {
                                                            setLinkedSaleId('');
                                                            setValue('');
                                                        }
                                                    }}
                                                    className="w-3 h-3 appearance-none border border-zinc-700 rounded-sm bg-zinc-900 checked:bg-[#39FF14] checked:border-[#39FF14] transition-colors"
                                                />
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-white transition-colors">
                                                    Vincular Venda PDV
                                                </span>
                                            </label>
                                        </div>

                                        {linkSale && (
                                            <div className="mb-2">
                                                <select
                                                    value={linkedSaleId}
                                                    onChange={e => {
                                                        const saleId = e.target.value;
                                                        setLinkedSaleId(saleId);

                                                        if (saleId) {
                                                            const sale = sales.find(s => s.id === saleId);
                                                            if (sale) {
                                                                const descToAppend = `[Vinculado à ${sale.sale_number}]`;
                                                                if (!description.includes(descToAppend)) {
                                                                    setDescription(prev => prev ? `${prev}\n${descToAppend}` : descToAppend);
                                                                }
                                                                // Preencher valor automaticamente da venda vinculada
                                                                if (sale.total != null) {
                                                                    const formatted = sale.total.toLocaleString('pt-BR', {
                                                                        minimumFractionDigits: 2,
                                                                        maximumFractionDigits: 2
                                                                    });
                                                                    setValue(formatted);
                                                                }
                                                            }
                                                        } else {
                                                            setValue('');
                                                        }
                                                    }}
                                                    className="w-full bg-zinc-950/80 border text-[10px] font-black uppercase tracking-widest border-zinc-800 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all appearance-none"
                                                >
                                                    <option value="">Selecione uma Venda Recente...</option>
                                                    {sales.slice(0, 50).map(s => (
                                                        <option key={s.id} value={s.id}>
                                                            {s.sale_number} - R$ {s.total?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - {new Date(s.created_at).toLocaleDateString('pt-BR')}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

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
            {isPendingModalOpen && (
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
            )}

            {/* Modal Cadastro de Produto */}
            {isProductModalOpen && (
                <div className="fixed inset-0 bg-black/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-zinc-900 w-full max-w-xl p-8 rounded-[32px] border border-zinc-800 shadow-2xl relative max-h-[90vh] overflow-y-auto text-white">
                        <button
                            onClick={() => setIsProductModalOpen(false)}
                            className="absolute right-6 top-6 text-zinc-500 hover:text-white transition-colors"
                        >
                            <X size={24} />
                        </button>

                        <div className="mb-8">
                            <h3 className="text-3xl font-black italic uppercase text-white flex items-center gap-3">
                                <Box size={28} className="text-[#39FF14]" /> NOVO PRODUTO
                            </h3>
                            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                                Cadastro de item para o estoque de varejo
                            </p>
                        </div>

                        <form onSubmit={handleAddProduct} className="space-y-6">
                            <div className="grid grid-cols-1 gap-6 text-left">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Nome do Produto</label>
                                    <input
                                        type="text"
                                        value={prodName}
                                        onChange={e => setProdName(e.target.value)}
                                        placeholder="Ex: Camiseta Libera Basic"
                                        required
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-700"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Preço de Venda (R$)</label>
                                        <input
                                            type="text"
                                            value={prodSalePrice}
                                            onChange={e => setProdSalePrice(formatCurrency(e.target.value))}
                                            placeholder="0,00"
                                            required
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-700"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Preço de Custo (R$)</label>
                                        <input
                                            type="text"
                                            value={prodCostPrice}
                                            onChange={e => setProdCostPrice(formatCurrency(e.target.value))}
                                            placeholder="0,00"
                                            required
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-zinc-500 focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-700"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Quantidade em Estoque</label>
                                    <input
                                        type="number"
                                        value={prodStock}
                                        onChange={e => setProdStock(e.target.value)}
                                        placeholder="0"
                                        required
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-700"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsProductModalOpen(false)}
                                    className="flex-1 bg-zinc-800 py-4 rounded-xl font-bold uppercase text-xs hover:bg-zinc-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 bg-[#39FF14] text-black py-4 rounded-xl font-black uppercase text-xs hover:scale-105 transition-all shadow-lg shadow-[#39FF14]/10 disabled:opacity-50"
                                >
                                    {loading ? 'Salvando...' : 'Cadastrar Produto'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* =============================== */}
            {/* Modal Conta a Pagar              */}
            {/* =============================== */}
            {contaModalOpen && (
                <div className="fixed inset-0 bg-black/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl animate-in fade-in duration-300 overflow-y-auto">
                    <div className="bg-zinc-900 w-full max-w-xl p-8 rounded-[32px] border border-zinc-800 shadow-2xl relative text-white my-auto">
                        <button onClick={() => { setContaModalOpen(false); resetContaForm(); }} className="absolute right-6 top-6 text-zinc-500 hover:text-white transition-colors">
                            <X size={24} />
                        </button>

                        <div className="mb-8">
                            <h3 className="text-3xl font-black italic uppercase text-[#39FF14] flex items-center gap-3">
                                ✂️ {editingConta ? 'EDITAR CONTA' : 'NOVA CONTA A PAGAR'}
                            </h3>
                            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">Contas a Pagar – Confecção</p>
                        </div>

                        <form onSubmit={handleSaveConta} className="space-y-5">
                            {/* Descrição */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Descrição *</label>
                                <input type="text" value={contaDesc} onChange={e => setContaDesc(e.target.value)}
                                    placeholder="Ex: Frete Correios, Costureira Lena..."
                                    className="w-full bg-zinc-950/80 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-700 uppercase" required />
                            </div>

                            {/* Categoria */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Grupo *</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {CONFECCAO_GROUPS.map(g => (
                                        <button key={g.group} type="button"
                                            onClick={() => { setContaGroup(g.group); setContaCategory(''); }}
                                            className="p-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all text-left border"
                                            style={contaGroup === g.group
                                                ? { backgroundColor: g.color, color: '#000', borderColor: g.color }
                                                : { backgroundColor: 'transparent', color: g.color, borderColor: g.color + '30' }}
                                        >{g.emoji} {g.group}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Sub-categoria */}
                            {contaGroup && (
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Categoria *</label>
                                    <div className="flex flex-wrap gap-2">
                                        {CONFECCAO_GROUPS.find(g => g.group === contaGroup)?.items.map(item => (
                                            <button key={item} type="button"
                                                onClick={() => setContaCategory(item)}
                                                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border"
                                                style={contaCategory === item
                                                    ? { backgroundColor: CONFECCAO_GROUPS.find(g => g.group === contaGroup)?.color, color: '#000', borderColor: CONFECCAO_GROUPS.find(g => g.group === contaGroup)?.color }
                                                    : { backgroundColor: 'transparent', color: '#a1a1aa', borderColor: '#3f3f46' }}
                                            >{item}</button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                {/* Valor */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-[#39FF14]">Valor (R$) *</label>
                                    <input type="text" value={contaAmount} onChange={e => setContaAmount(formatCurrency(e.target.value))}
                                        placeholder="0,00"
                                        className="w-full bg-zinc-950/80 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-700" required />
                                </div>
                                {/* Dia de vencimento */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Dia Vencimento *</label>
                                    <input type="number" min="1" max="31" value={contaDueDay} onChange={e => setContaDueDay(e.target.value)}
                                        placeholder="Ex: 10"
                                        className="w-full bg-zinc-950/80 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-700" required />
                                </div>
                            </div>

                            {/* Recorrência */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Tipo de Conta *</label>
                                <div className="flex gap-2">
                                    {([['UNICA', '1️⃣ Única'], ['FIXA', '🔄 Fixa (ano todo)'], ['VARIAVEL', '📊 Variável (ano todo)']] as const).map(([val, label]) => (
                                        <button key={val} type="button" onClick={() => setContaRecurrence(val)}
                                            className={`flex-1 p-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${contaRecurrence === val ? 'bg-zinc-700 text-white border-zinc-600' : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-600'}`}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Forma de pagamento */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Forma de Pagamento</label>
                                <div className="flex flex-wrap gap-2">
                                    {['PIX', 'DINHEIRO', 'BOLETO', 'CARTÃO CRÉDITO', 'CARTÃO DÉBITO'].map(pm => (
                                        <button key={pm} type="button" onClick={() => setContaPayMethod(pm)}
                                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${contaPayMethod === pm ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-600'}`}>
                                            {pm}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Observações */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Observações</label>
                                <textarea value={contaNotes} onChange={e => setContaNotes(e.target.value)}
                                    placeholder="Notas adicionais..."
                                    rows={2}
                                    className="w-full bg-zinc-950/80 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-700 resize-none" />
                            </div>

                            <button type="submit"
                                className="w-full bg-[#39FF14] text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-[#39FF14]/20"
                            >
                                {editingConta ? '✅ Salvar Alterações' : '✅ Registrar Conta'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation – Contas a Pagar */}
            {confirmDeleteContaId && (
                <div className="fixed inset-0 bg-black/80 z-[700] flex items-center justify-center p-4 backdrop-blur-xl">
                    <div className="bg-zinc-900 w-full max-w-sm p-8 rounded-[32px] border border-red-500/30 shadow-2xl text-center">
                        <p className="text-4xl mb-4">🗑️</p>
                        <h3 className="text-xl font-black italic uppercase text-red-400 mb-2">Apagar conta?</h3>
                        <p className="text-zinc-500 text-sm mb-6">Essa ação não pode ser desfeita.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmDeleteContaId(null)}
                                className="flex-1 py-3 rounded-2xl border border-zinc-700 text-zinc-400 font-black uppercase text-[10px] tracking-widest hover:border-zinc-500 transition-all">
                                Cancelar
                            </button>
                            <button onClick={handleDeleteConta}
                                className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-black uppercase text-[10px] tracking-widest hover:bg-red-600 transition-all">
                                Sim, apagar!
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Lançamento Financeiro */}
            {isFinanceModalOpen && (

                <div className="fixed inset-0 bg-black/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-zinc-900 w-full max-w-xl p-8 rounded-[32px] border border-zinc-800 shadow-2xl relative text-white">
                        <button
                            onClick={() => setIsFinanceModalOpen(false)}
                            className="absolute right-6 top-6 text-zinc-500 hover:text-white transition-colors"
                        >
                            <X size={24} />
                        </button>

                        <div className="mb-6">
                            <h3 className="text-3xl font-black italic uppercase text-white flex items-center gap-3">
                                <PlusCircle size={28} className="text-red-500" /> NOVA CONTA A PAGAR
                            </h3>
                            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                                Registro de despesas e saídas de caixa
                            </p>
                        </div>

                        <form onSubmit={handleAddFinance} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
                            {/* Descrição */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Descrição</label>
                                <input
                                    type="text"
                                    value={finDesc}
                                    onChange={e => setFinDesc(e.target.value)}
                                    placeholder="Ex: Compra de Tecido, Conta de Luz..."
                                    required
                                    className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-700"
                                />
                            </div>

                            {/* Valor */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Valor (R$)</label>
                                <input
                                    type="text"
                                    value={finAmount}
                                    onChange={e => setFinAmount(formatCurrency(e.target.value))}
                                    placeholder="0,00"
                                    required
                                    className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-700"
                                />
                            </div>

                            {/* Forma de Pagamento */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Forma de Pagamento</label>
                                <div className="flex flex-wrap gap-2">
                                    {(['PIX', 'BOLETO', 'CARTÃO CRÉDITO', 'CARTÃO DÉBITO', 'OUTRO'] as const).map(pm => (
                                        <button
                                            key={pm}
                                            type="button"
                                            onClick={() => {
                                                setFinPayMethod(pm);
                                                setFinInstallments(1);
                                                setFinInstallmentDates([]);
                                                setFinDebitRecurrent(false);
                                                if (pm === 'PIX') {
                                                    setFinDueDate(new Date().toISOString().split('T')[0]);
                                                } else if (pm === 'CARTÃO DÉBITO') {
                                                    setFinDueDate(getNextDebitDate(finDebitDay));
                                                } else {
                                                    setFinDueDate(new Date().toISOString().split('T')[0]);
                                                }
                                            }}
                                            className={`px-4 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${finPayMethod === pm ? 'bg-[#39FF14] text-black shadow-lg shadow-[#39FF14]/20' : 'bg-zinc-950 text-zinc-500 hover:text-white'}`}
                                        >
                                            {pm}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* === CAMPOS DINÂMICOS POR FORMA DE PAGAMENTO === */}

                            {/* PIX */}
                            {finPayMethod === 'PIX' && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Data de Vencimento</label>
                                        <input
                                            type="date"
                                            value={finDueDate}
                                            onChange={e => setFinDueDate(e.target.value)}
                                            required
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold [color-scheme:dark]"
                                        />
                                    </div>
                                    <p className="text-[10px] text-zinc-600 italic px-1">O pagamento via PIX normalmente ocorre no mesmo dia.</p>
                                </div>
                            )}

                            {/* BOLETO */}
                            {finPayMethod === 'BOLETO' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Número de Parcelas</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={48}
                                            value={finInstallments}
                                            onChange={e => {
                                                const count = Math.max(1, parseInt(e.target.value) || 1);
                                                setFinInstallments(count);
                                                if (count > 1 && finDueDate) {
                                                    setFinInstallmentDates(calcInstallmentDates(finDueDate, count));
                                                }
                                            }}
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">
                                            {finInstallments > 1 ? 'Vencimento do 1º Boleto' : 'Data de Vencimento'}
                                        </label>
                                        <input
                                            type="date"
                                            value={finDueDate}
                                            onChange={e => {
                                                setFinDueDate(e.target.value);
                                                if (finInstallments > 1) {
                                                    setFinInstallmentDates(calcInstallmentDates(e.target.value, finInstallments));
                                                }
                                            }}
                                            required
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold [color-scheme:dark]"
                                        />
                                    </div>
                                    {finInstallments > 1 && finInstallmentDates.length > 0 && (
                                        <div className="bg-zinc-950 rounded-2xl p-4 border border-zinc-800">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">Preview dos Vencimentos</p>
                                            <div className="space-y-2">
                                                {finInstallmentDates.map((date, i) => (
                                                    <div key={i} className="flex items-center justify-between gap-2">
                                                        <span className="text-[10px] font-black text-zinc-400 uppercase shrink-0">
                                                            {i + 1}ª parcela
                                                        </span>
                                                        <input
                                                            type="date"
                                                            value={date}
                                                            onChange={e => {
                                                                const updated = [...finInstallmentDates];
                                                                updated[i] = e.target.value;
                                                                setFinInstallmentDates(updated);
                                                            }}
                                                            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[11px] font-bold text-white outline-none focus:border-[#39FF14] [color-scheme:dark]"
                                                        />
                                                        <span className="text-[10px] text-zinc-600 font-bold shrink-0">
                                                            R$ {(parseBRL(finAmount || '0') / finInstallments).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* CARTÃO CRÉDITO */}
                            {finPayMethod === 'CARTÃO CRÉDITO' && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Número de Parcelas</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={12}
                                            value={finInstallments}
                                            onChange={e => setFinInstallments(Math.max(1, parseInt(e.target.value) || 1))}
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold"
                                        />
                                    </div>
                                    {finInstallments > 1 && finAmount && (
                                        <p className="text-[10px] text-zinc-400 font-bold px-1">
                                            {finInstallments}x de R$ {(parseBRL(finAmount || '0') / finInstallments).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    )}
                                    <p className="text-[10px] text-zinc-600 italic px-1">O pagamento seguirá o ciclo de faturamento do cartão.</p>
                                </div>
                            )}

                            {/* CARTÃO DÉBITO */}
                            {finPayMethod === 'CARTÃO DÉBITO' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Dia do Débito</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={31}
                                            value={finDebitDay}
                                            onChange={e => {
                                                const day = Math.min(31, Math.max(1, parseInt(e.target.value) || 1));
                                                setFinDebitDay(day);
                                                setFinDueDate(getNextDebitDate(day));
                                            }}
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Tipo de Pagamento</label>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => setFinDebitRecurrent(false)}
                                                className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${!finDebitRecurrent ? 'bg-[#39FF14] text-black shadow-lg shadow-[#39FF14]/20' : 'bg-zinc-950 text-zinc-500 hover:text-white'}`}>
                                                Único
                                            </button>
                                            <button type="button" onClick={() => setFinDebitRecurrent(true)}
                                                className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${finDebitRecurrent ? 'bg-[#39FF14] text-black shadow-lg shadow-[#39FF14]/20' : 'bg-zinc-950 text-zinc-500 hover:text-white'}`}>
                                                Recorrente
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Próximo Débito</label>
                                        <input
                                            type="date"
                                            value={finDueDate}
                                            onChange={e => setFinDueDate(e.target.value)}
                                            required
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold [color-scheme:dark]"
                                        />
                                    </div>
                                    {finDebitRecurrent && (
                                        <p className="text-[10px] text-zinc-600 italic px-1">O débito será repetido mensalmente no dia {finDebitDay}.</p>
                                    )}
                                </div>
                            )}

                            {/* OUTRO */}
                            {finPayMethod === 'OUTRO' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Data de Vencimento</label>
                                        <input
                                            type="date"
                                            value={finDueDate}
                                            onChange={e => setFinDueDate(e.target.value)}
                                            required
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold [color-scheme:dark]"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Observação */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">
                                    Observação {finPayMethod === 'OUTRO' && <span className="text-red-400">*</span>}
                                </label>
                                <textarea
                                    value={finObs}
                                    onChange={e => setFinObs(e.target.value)}
                                    placeholder={finPayMethod === 'OUTRO' ? 'Descreva a forma de pagamento...' : 'Informações adicionais...'}
                                    rows={2}
                                    required={finPayMethod === 'OUTRO'}
                                    className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-700 resize-none"
                                />
                            </div>

                            {/* Status */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 text-zinc-500">Status</label>
                                <div className="py-3 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest text-center bg-red-500/20 text-red-400 border border-red-500/30">
                                    A PAGAR
                                </div>
                            </div>

                            {/* Botões */}
                            <div className="flex gap-4 pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setIsFinanceModalOpen(false); resetFinanceForm(); }}
                                    className="flex-1 bg-zinc-800 py-4 rounded-xl font-bold uppercase text-xs hover:bg-zinc-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 bg-[#39FF14] text-black py-4 rounded-xl font-black uppercase text-xs hover:scale-105 transition-all shadow-lg shadow-[#39FF14]/10 disabled:opacity-50"
                                >
                                    {loading ? 'Salvando...' : finInstallments > 1 ? `Registrar ${finInstallments} Parcelas` : 'Registrar Conta a Pagar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
