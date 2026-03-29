'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LayoutDashboard, Plus, Search, Calendar, Package,
    ArrowRight, Check, AlertCircle, Clock, X, LogOut,
    TrendingUp, Truck, User, History, MessageSquare, Info, Filter,
    Loader2, ChevronDown, ChevronUp, MessageCircle, Pencil, FileText, Trash2,
    Store, ShoppingCart, Wallet, BarChart3, Settings, Layers, Box, DollarSign,
    ArrowUpCircle, ArrowDownCircle, ArrowUpRight, ArrowDownLeft, PlusCircle, Home, Copy, Sun, Moon, Eye, Paperclip
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

// Emails autorizados a acessar o dashboard
const AUTHORIZED_EMAILS = [
    'priscilacascao@gmail.com',
    'priscilacascao@gmailc.om',
    'prisciladm@icloud.com',
    'alanna@liberasports.com',
    'alannaminchev@gmail.com',
    // Adicione mais emails aqui
];

const workflow = ["AGUARDANDO APROVAÇÃO", "GRÁFICA", "CORTE", "COSTURA", "REVISÃO", "EM FASE DE ENTREGA", "PEDIDO ENTREGUE"];
const displayWorkflow = ["AGUARDANDO APROVAÇÃO", "GRÁFICA", "CORTE", "COSTURA", "REVISÃO", "EM FASE DE ENTREGA", "PENDÊNCIA", "PEDIDO ENTREGUE"];

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

    // Theme
    const [isDark, setIsDark] = useState(true);
    useEffect(() => {
        const saved = localStorage.getItem('libera_theme');
        if (saved === 'light') setIsDark(false);
    }, []);
    const toggleTheme = () => {
        const next = !isDark;
        setIsDark(next);
        localStorage.setItem('libera_theme', next ? 'dark' : 'light');
    };
    const t = {
        bg: isDark ? 'bg-black' : 'bg-gray-50',
        text: isDark ? 'text-white' : 'text-gray-900',
        textMuted: isDark ? 'text-white/70' : 'text-gray-500',
        accent: isDark ? 'text-[#39FF14]' : 'text-green-600',
        accentBg: isDark ? 'bg-[#39FF14]' : 'bg-green-600',
        accentText: isDark ? 'text-black' : 'text-white',
        card: isDark ? 'bg-zinc-950 border-zinc-900' : 'bg-white border-gray-200',
        cardHover: isDark ? 'hover:border-zinc-800' : 'hover:border-gray-300',
        input: isDark ? 'bg-zinc-950/80 border-transparent text-white placeholder:text-zinc-600' : 'bg-gray-100 border-gray-200 text-gray-900 placeholder:text-gray-400',
        nav: isDark ? 'bg-black border-zinc-900' : 'bg-white border-gray-200',
        divider: isDark ? 'divide-zinc-900' : 'divide-gray-200',
        border: isDark ? 'border-zinc-900' : 'border-gray-200',
    };

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
    const [financeView, setFinanceView] = useState<'A PAGAR' | 'A RECEBER' | 'RECEBIDAS' | 'PAGAS'>('A PAGAR');
    const [searchTerm, setSearchTerm] = useState('');

    // Form State
    const [client, setClient] = useState('');
    const [clientCpfCnpj, setClientCpfCnpj] = useState('');
    const [cpfCnpjError, setCpfCnpjError] = useState('');
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
    const productsCollectionPath = `artifacts/${appId}/public/data/produtos`;
    const salesCollectionPath = `artifacts/${appId}/public/data/vendas`;
    const financeCollectionPath = `artifacts/${appId}/public/data/financeiro`;
    const fornecedoresCollectionPath = `artifacts/${appId}/public/data/fornecedores`;

    // Fornecedores state
    const [fornecedores, setFornecedores] = useState<any[]>([]);
    const [fornecedorModalOpen, setFornecedorModalOpen] = useState(false);
    const [fornecedorName, setFornecedorName] = useState('');
    const [fornecedorCpfCnpj, setFornecedorCpfCnpj] = useState('');
    const [fornecedorCpfCnpjError, setFornecedorCpfCnpjError] = useState('');
    const [fornecedorWhatsapp, setFornecedorWhatsapp] = useState('');
    const [editingFornecedor, setEditingFornecedor] = useState<any>(null);
    const [fornecedorSearch, setFornecedorSearch] = useState('');
    const [showFornecedoresList, setShowFornecedoresList] = useState(false);
    const [fornecedorType, setFornecedorType] = useState<'FORNECEDOR' | 'CLIENTE' | 'FUNCIONÁRIO'>('CLIENTE');
    const [fornecedorStartDate, setFornecedorStartDate] = useState('');

    const [showPaymentReminder, setShowPaymentReminder] = useState(false);
    const [reminderItems, setReminderItems] = useState<any[]>([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);
    const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
    const [pendingViewOrder, setPendingViewOrder] = useState<any>(null);
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
    const [saleClient, setSaleClient] = useState('');
    const [showClientSuggestions, setShowClientSuggestions] = useState(false);
    const [saleWhatsapp, setSaleWhatsapp] = useState('');
    const [saleCpfCnpj, setSaleCpfCnpj] = useState('');
    const [saleCpfCnpjError, setSaleCpfCnpjError] = useState('');
    const [saleDeadline, setSaleDeadline] = useState(addBusinessDays(new Date(), 20));
    const [saleDeliveryMethod, setSaleDeliveryMethod] = useState<'MOTOBOY' | 'TRANSPORTADORA' | 'RETIRADA'>('MOTOBOY');
    const [saleDeliveryAddress, setSaleDeliveryAddress] = useState('');
    const [saleBoletoQty, setSaleBoletoQty] = useState(1);
    const [saleBoletoInterval, setSaleBoletoInterval] = useState(30);
    const [saleBoletoFirstDate, setSaleBoletoFirstDate] = useState('');
    const [saleDescription, setSaleDescription] = useState('');
    const [saleEntersProduction, setSaleEntersProduction] = useState(true);
    const [saleManualValue, setSaleManualValue] = useState('');
    const [productSearch, setProductSearch] = useState('');

    // Form Estado - Produtos
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [prodName, setProdName] = useState('');
    const [prodDetails, setProdDetails] = useState('');
    const [prodImage, setProdImage] = useState('');
    const [prodSalePrice, setProdSalePrice] = useState('');
    const [prodCostPrice, setProdCostPrice] = useState('');
    const [prodStock, setProdStock] = useState('');
    const [prodShowInStore, setProdShowInStore] = useState(false);

    // Form Estado - Financeiro
    const [finAmount, setFinAmount] = useState('');
    const [finDesc, setFinDesc] = useState('');
    const [finSupplier, setFinSupplier] = useState('');
    const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);
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
    const [editingProductId, setEditingProductId] = useState<string | null>(null);
    const [editProductDetails, setEditProductDetails] = useState('');
    const [editProductName, setEditProductName] = useState('');
    const [editProductSalePrice, setEditProductSalePrice] = useState('');
    const [editProductCostPrice, setEditProductCostPrice] = useState('');
    const [editProductImage, setEditProductImage] = useState('');
    const [editProductShowInStore, setEditProductShowInStore] = useState(false);
    const [editProductStock, setEditProductStock] = useState('');
    const [expandedSaleIds, setExpandedSaleIds] = useState<Record<string, boolean>>({});

    // Finance View State
    const [financeFilterYear, setFinanceFilterYear] = useState(new Date().getFullYear());
    const [financeFilterMonth, setFinanceFilterMonth] = useState(-1);
    const [financeDateFrom, setFinanceDateFrom] = useState('');
    const [financeSearchTerm, setFinanceSearchTerm] = useState('');
    const [financeDateTo, setFinanceDateTo] = useState('');
    const [financeGrouping, setFinanceGrouping] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('DAILY');
    const [caixaDateFrom, setCaixaDateFrom] = useState(new Date().toISOString().split('T')[0]);
    const [showGastoModal, setShowGastoModal] = useState(false);
    const [gastoDesc, setGastoDesc] = useState('');
    const [gastoAmount, setGastoAmount] = useState('');
    const [gastoPayMethod, setGastoPayMethod] = useState('PIX');
    const [finAttachment, setFinAttachment] = useState('');
    const [caixaDateTo, setCaixaDateTo] = useState(new Date().toISOString().split('T')[0]);
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
            } else if (!AUTHORIZED_EMAILS.includes(user.email?.toLowerCase())) {
                toast.error('Acesso não autorizado');
                signOut(auth);
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

        const q = query(collection(db, salesCollectionPath), orderBy('created_at', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const allSales = snapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data()
            }));
            // Fábrica: apenas vendas com produção ou pedidos migrados que têm status
            const ordersData = allSales.filter((s: any) => (s.has_production || s.status) && s.status);
            setOrders(ordersData);
            // Atualiza vendas também
            setSales(allSales);
            setLoading(false);
        }, (error: any) => {
            console.error("Firestore error:", error);
            toast.error("Erro ao sincronizar dados em tempo real.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [authChecking]);

    // Products - carrega sob demanda (VENDAS ou ESTOQUE)
    const productsLoadedRef = React.useRef(false);
    useEffect(() => {
        if (authChecking || productsLoadedRef.current) return;
        if (activeTab !== 'VENDAS' && activeTab !== 'ESTOQUE') return;
        productsLoadedRef.current = true;
        const q = query(collection(db, productsCollectionPath));
        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
            const sizeOrder: Record<string, number> = { 'BB': 0, 'PP': 1, 'P': 2, 'M': 3, 'G': 4, 'GG': 5, 'XG': 6, 'XXG': 7, 'EG': 8, 'EXG': 9 };
            const getSizeWeight = (name: string) => {
                const tamMatch = name.match(/TAM\.?\s*(\w+)/i);
                if (tamMatch) {
                    const val = tamMatch[1].toUpperCase();
                    if (sizeOrder[val] !== undefined) return sizeOrder[val];
                    const num = parseInt(val);
                    if (!isNaN(num)) return 10 + num;
                }
                const sizeMatch = name.match(/\b(BB|PP|XXG|EXG|XG|GG|EG|P|M|G)\b/i);
                if (sizeMatch) return sizeOrder[sizeMatch[1].toUpperCase()] ?? 50;
                return 50;
            };
            const cleanName = (name: string) => name.replace(/[-–]\s*TAM\.?\s*\w+/gi, '').replace(/\b(BB|PP|XXG|EXG|XG|GG|EG|P|M|G)\b/gi, '').trim();
            data.sort((a: any, b: any) => {
                const baseCmp = cleanName(a.name || '').localeCompare(cleanName(b.name || ''), 'pt-BR', { numeric: true });
                if (baseCmp !== 0) return baseCmp;
                return getSizeWeight(a.name || '') - getSizeWeight(b.name || '');
            });
            setProducts(data);
            setStockLoading(false);
        });
        return () => unsubscribe();
    }, [authChecking, activeTab]);

    // Finance - carrega sob demanda (FINANCEIRO ou CAIXA)
    const financeLoadedRef = React.useRef(false);
    useEffect(() => {
        if (authChecking || financeLoadedRef.current) return;
        financeLoadedRef.current = true;
        const q = query(collection(db, financeCollectionPath), orderBy('created_at', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
            setFinancialItems(data);
        });
        return () => unsubscribe();
    }, [authChecking, activeTab]);

    // Auto-mark overdue financial items as ATRASADO (runs once on load)
    const overdueCheckedRef = React.useRef(false);
    useEffect(() => {
        if (overdueCheckedRef.current || financialItems.length === 0) return;
        overdueCheckedRef.current = true;
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        financialItems.forEach(item => {
            if (!item.due_date) return;
            const dueDatePart = item.due_date.split('T')[0];
            // Marcar como atrasado se venceu
            if ((item.status === 'A PAGAR' || item.status === 'A RECEBER' || item.status === 'PENDENTE') && dueDatePart < today) {
                handleUpdateFinanceEntry(item.id, { status: 'ATRASADO' });
            }
            // Corrigir: se está ATRASADO mas vencimento é futuro, voltar status
            if (item.status === 'ATRASADO' && dueDatePart >= today) {
                const correctStatus = item.type === 'OUTFLOW' ? 'A PAGAR' : 'A RECEBER';
                handleUpdateFinanceEntry(item.id, { status: correctStatus });
            }
        });
    }, [financialItems]);

    // Lembrete de contas a pagar do dia
    const reminderCheckedRef = React.useRef(false);
    useEffect(() => {
        if (reminderCheckedRef.current || financialItems.length === 0) return;
        if (typeof window !== 'undefined' && sessionStorage.getItem('payment_reminder_shown')) return;
        reminderCheckedRef.current = true;
        const nowR = new Date();
        const today = `${nowR.getFullYear()}-${String(nowR.getMonth() + 1).padStart(2, '0')}-${String(nowR.getDate()).padStart(2, '0')}`;
        const dueTodayOrOverdue = financialItems.filter(item => {
            if (item.type !== 'OUTFLOW') return false;
            if (item.status === 'PAGO') return false;
            if (!item.due_date) return false;
            const dueDatePart = item.due_date.split('T')[0];
            return dueDatePart <= today;
        });
        if (dueTodayOrOverdue.length > 0) {
            setReminderItems(dueTodayOrOverdue);
            setShowPaymentReminder(true);
            sessionStorage.setItem('payment_reminder_shown', 'true');
        }
    }, [financialItems]);

    // Contas a Pagar - carrega sob demanda (CAIXA)
    const contasLoadedRef = React.useRef(false);
    useEffect(() => {
        if (authChecking || contasLoadedRef.current) return;
        if (activeTab !== 'CAIXA') return;
        contasLoadedRef.current = true;
        const q = query(collection(db, contasAPagarPath), orderBy('created_at', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
            setContasAPagar(data);
        });
        return () => unsubscribe();
    }, [authChecking, activeTab]);

    // Fornecedores - carrega sob demanda (FINANCEIRO ou VENDAS)
    const fornecedoresLoadedRef = React.useRef(false);
    useEffect(() => {
        if (authChecking || fornecedoresLoadedRef.current) return;
        if (activeTab !== 'FINANCEIRO' && activeTab !== 'VENDAS') return;
        fornecedoresLoadedRef.current = true;
        const q = query(collection(db, fornecedoresCollectionPath), orderBy('name', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
            setFornecedores(data);
        });
        return () => unsubscribe();
    }, [authChecking, activeTab]);

    useEffect(() => {
        if (isModalOpen) {
            updateNextOrderNumber();
        }
    }, [isModalOpen]);

    const updateNextOrderNumber = async () => {
        try {
            const lastOrderQuery = query(collection(db, salesCollectionPath), orderBy('order_number', 'desc'));
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
            const newProduct: any = {
                name: prodName.toUpperCase(),
                details: prodDetails.trim(),
                sale_price: parseBRL(prodSalePrice),
                cost_price: parseBRL(prodCostPrice),
                stock: parseInt(prodStock),
                show_in_store: prodShowInStore,
                created_at: new Date().toISOString(),
                user_id: userId
            };
            if (prodImage) newProduct.image = prodImage;
            await addDoc(collection(db, productsCollectionPath), newProduct);
            toast.success('Produto adicionado ao estoque!');
            setIsProductModalOpen(false);
            setProdName('');
            setProdDetails('');
            setProdSalePrice('');
            setProdCostPrice('');
            setProdStock('');
            setProdShowInStore(false);
            setProdImage('');
        } catch (err) {
            console.error(err);
            toast.error('Erro ao adicionar produto');
        } finally {
            setLoading(false);
        }
    };

    const addToCart = (product: any, qty: number = 1) => {
        const existing = cart.find(item => item.id === product.id);
        const currentQty = existing ? existing.quantity : 0;
        if (currentQty + qty > product.stock) {
            toast.error(`Estoque insuficiente (disponível: ${product.stock - currentQty})`);
            return;
        }
        if (existing) {
            setCart(cart.map(item =>
                item.id === product.id ? { ...item, quantity: item.quantity + qty } : item
            ));
        } else {
            setCart([...cart, { ...product, quantity: qty }]);
        }
        toast.success(`${qty}x ${product.name} adicionado!`);
    };

    const updateCartQuantity = (id: string, newQty: number, maxStock: number, fromButton: boolean = false) => {
        if (fromButton && newQty <= 0) {
            setCart(cart.filter(item => item.id !== id));
            return;
        }
        if (newQty > maxStock) {
            toast.error(`Estoque máximo: ${maxStock}`);
            return;
        }
        setCart(cart.map(item => item.id === id ? { ...item, quantity: Math.max(newQty, 0) } : item));
    };

    const removeFromCart = (id: string) => {
        setCart(cart.filter(item => item.id !== id));
    };

    useEffect(() => {
        const total = cart.reduce((acc, item) => acc + (item.sale_price * item.quantity), 0);
        setCartTotal(total);
    }, [cart]);

    const handleCheckout = async () => {
        if (!userId) return;
        const finalTotal = cart.length > 0 ? cartTotal : parseBRL(saleManualValue);
        if (finalTotal <= 0) { toast.error('Informe o valor da venda'); return; }
        if (saleEntersProduction && !saleClient.trim()) { toast.error('Informe o nome do cliente'); return; }
        if (saleCpfCnpj) {
            const digits = saleCpfCnpj.replace(/\D/g, '');
            if (digits.length >= 11 && !validateCpfCnpj(digits)) { toast.error('CPF/CNPJ inválido'); return; }
        }

        setLoading(true);
        try {
            // 0. Gerar Número da Venda (LIBERA-XXXX)
            const allSalesSnap = await getDocs(query(collection(db, salesCollectionPath), orderBy('created_at', 'desc')));
            const allSalesData = allSalesSnap.docs.map(d => d.data());
            const maxNum = Math.max(
                ...allSalesData.map(s => parseInt((s.order_number || s.sale_number || '').replace(/\D/g, '') || '0')),
                0
            );
            const newOrderNumber = `LIBERA-${String(maxNum + 1).padStart(4, '0')}`;

            // 1. Criar Venda
            const saleData: any = {
                order_number: newOrderNumber,
                sale_number: newOrderNumber,
                items: cart.length > 0 ? cart : [],
                total: finalTotal,
                value: finalTotal,
                client: saleClient.trim().toUpperCase() || '',
                client_whatsapp: saleWhatsapp.trim(),
                cpf_cnpj: saleCpfCnpj.replace(/\D/g, ''),
                deadline: saleDeadline || '',
                delivery_method: saleDeliveryMethod,
                delivery_address: saleDeliveryAddress.trim(),
                description: saleDescription.trim(),
                payment_method: paymentMethod,
                has_production: saleEntersProduction,
                created_at: new Date().toISOString(),
                user_id: userId,
                operator_name: operatorName,
            };

            // Se entra em produção, adicionar workflow
            if (saleEntersProduction) {
                saleData.status = 'AGUARDANDO APROVAÇÃO';
                saleData.order_logs = [{
                    id: crypto.randomUUID(),
                    old_status: 'INÍCIO',
                    new_status: 'AGUARDANDO APROVAÇÃO',
                    operator_name: operatorName,
                    created_at: new Date().toISOString()
                }];
            }

            const docRef = await addDoc(collection(db, salesCollectionPath), saleData);

            // 2. Registrar no Financeiro
            const finDesc = cart.length > 0
                ? `[${newOrderNumber}] ${cart.map((i: any) => `${i.quantity}x ${i.name}`).join(', ')}`
                : `[${newOrderNumber}] ${saleDescription || saleClient}`;
            if (paymentMethod === 'BOLETO' && saleBoletoQty > 1) {
                // Gerar múltiplos boletos
                const boletoValue = finalTotal / saleBoletoQty;
                const firstDate = saleBoletoFirstDate ? new Date(saleBoletoFirstDate + 'T12:00:00') : new Date();
                for (let i = 0; i < saleBoletoQty; i++) {
                    const dueDate = new Date(firstDate);
                    dueDate.setDate(dueDate.getDate() + (saleBoletoInterval * i));
                    await addDoc(collection(db, financeCollectionPath), {
                        type: 'INFLOW',
                        amount: boletoValue,
                        description: `[${newOrderNumber}] ${finDesc} (Boleto ${i + 1}/${saleBoletoQty})`,
                        status: 'A RECEBER',
                        created_at: new Date().toISOString(),
                        transaction_date: transactionDate,
                        due_date: dueDate.toISOString(),
                        payment_method: 'BOLETO',
                        order_id: docRef.id,
                        user_id: userId,
                        operator_name: operatorName,
                    });
                }
            } else {
                await generateFinancialEntries(
                    docRef.id,
                    newOrderNumber,
                    finDesc,
                    finalTotal,
                    paymentMethod,
                    transactionDate,
                    installments,
                    userId
                );
            }

            // 3. Baixar Estoque (se tem itens do estoque)
            for (const item of cart) {
                const productRef = doc(db, productsCollectionPath, item.id);
                await updateDoc(productRef, {
                    stock: item.stock - item.quantity
                });
            }

            // 4. Enviar WhatsApp (se entra em produção e tem WhatsApp)
            if (saleEntersProduction && saleWhatsapp.trim()) {
                const trackingUrl = `${window.location.origin}/rastreio?id=${docRef.id}`;
                const whatsappPhone = saleWhatsapp.replace(/\D/g, '');
                const deliveryDate = saleDeadline ? saleDeadline.split('-').reverse().join('/') : '';
                const clientName = saleClient.trim();
                const formattedValue = finalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                const msgLines = [
                    `Olá *${clientName}*! Seu pedido na *Libera Sports* foi cadastrado com sucesso!`,
                    '',
                    `*Pedido:* ${newOrderNumber}`,
                    `*Valor:* R$ ${formattedValue}`,
                    ...(deliveryDate ? [`*Entrega prevista:* ${deliveryDate}`] : []),
                    `*Método:* ${saleDeliveryMethod}`,
                    `*Pagamento:* ${paymentMethod}`,
                    ...(saleDeliveryMethod === 'RETIRADA' ? ['', '*Endereço de retirada:* _Rua Manguapé, Quadra 40-A, Lote 01-A, Vila Alzira, Aparecida de Goiânia-GO, CEP: 74.913-350_'] : []),
                    '',
                    'Acompanhe seu pedido em tempo real:',
                    trackingUrl,
                    '',
                    '_Libera Sports - Vista Libera e viva a liberdade_'
                ];
                const whatsappMsg = msgLines.map(line => encodeURIComponent(line)).join('%0a');
                const whatsappLink = `https://wa.me/${whatsappPhone}?text=${whatsappMsg}`;
                setTimeout(() => {
                    const opened = window.open(whatsappLink, '_blank');
                    if (!opened) window.location.href = whatsappLink;
                }, 500);
            }

            toast.success('Venda cadastrada com sucesso!');
            setCart([]);
            setSaleClient('');
            setSaleWhatsapp('');
            setSaleCpfCnpj('');
            setSaleCpfCnpjError('');
            setSaleDeadline(addBusinessDays(new Date(), 20));
            setSaleDeliveryMethod('MOTOBOY');
            setSaleDeliveryAddress('');
            setSaleDescription('');
            setSaleBoletoQty(1);
            setSaleBoletoInterval(30);
            setSaleBoletoFirstDate('');
            setSaleEntersProduction(true);
            setSaleManualValue('');
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
        if (!confirm('Deseja realmente excluir esta venda? Os itens voltarão para o estoque e as contas financeiras vinculadas serão excluídas.')) return;
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

            // Excluir entradas financeiras vinculadas
            const finSnap = await getDocs(collection(db, financeCollectionPath));
            for (const d of finSnap.docs) {
                if (d.data().order_id === id) {
                    await deleteDoc(doc(db, financeCollectionPath, d.id));
                }
            }

            // Deletar documento da venda
            await deleteDoc(doc(db, salesCollectionPath, id));
            toast.success('Venda, estoque e contas financeiras atualizados!');
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
        setFinSupplier('');
        setShowSupplierSuggestions(false);
        setFinDueDate(new Date().toISOString().split('T')[0]);
        setFinPayMethod('PIX');
        setFinObs('');
        setFinInstallments(1);
        setFinInstallmentDates([]);
        setFinDebitDay(new Date().getDate());
        setFinDebitRecurrent(false);
        setFinAttachment('');
    };

    const calcInstallmentDates = (startDate: string, count: number) => {
        const dates: string[] = [];
        const [year, month, day] = startDate.split('-').map(Number);
        for (let i = 0; i < count; i++) {
            const d = new Date(year, month - 1 + i, day);
            const yy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            dates.push(`${yy}-${mm}-${dd}`);
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
            const baseDoc: any = {
                type: 'OUTFLOW' as const,
                description: finDesc.toUpperCase(),
                supplier_name: finSupplier.trim().toUpperCase() || '',
                payment_method: finPayMethod,
                observations: finObs,
                created_at: new Date().toISOString(),
                user_id: userId,
                operator_name: operatorName,
            };
            if (finAttachment) baseDoc.attachment = finAttachment;

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
                        due_date: finInstallmentDates[i] || finDueDate,
                    });
                }
            } else {
                const entry: any = {
                    ...baseDoc,
                    amount: totalAmount,
                    status: 'A PAGAR',
                    due_date: finDueDate,
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
            const datePart = dateStr.split('T')[0];
            if (caixaDateFrom && datePart < caixaDateFrom) return false;
            if (caixaDateTo && datePart > caixaDateTo) return false;
            return true;
        }).sort((a, b) => {
            const dateA = new Date(a.due_date || a.transaction_date || a.created_at).getTime();
            const dateB = new Date(b.due_date || b.transaction_date || b.created_at).getTime();
            return dateA - dateB;
        });
    }, [financialItems, caixaDateFrom, caixaDateTo]);

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
            const orderRef = doc(db, salesCollectionPath, id);
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
        const q = query(collection(db, salesCollectionPath), orderBy('created_at', 'desc'));
        const querySnapshot = await getDocs(q); // Use getDocs for a one-time fetch
        const count = querySnapshot.docs.filter(doc => new Date(doc.data().created_at?.toDate()).getFullYear() === new Date().getFullYear()).length;

        const sequence = count + 1;
        const paddedSequence = sequence.toString().padStart(2, '0');
        return `#${year}${paddedSequence}`;
    };

    const advanceStep = async (orderId: string, currentStatus: string) => {
        const currentIndex = workflow.indexOf(currentStatus);
        // Para status "PEDIDO FEITO" (legado), tratar como AGUARDANDO APROVAÇÃO
        const effectiveIndex = currentStatus === 'PEDIDO FEITO' ? 0 : currentIndex;
        const nextStatus = effectiveIndex >= 0 && effectiveIndex < workflow.length - 1 ? workflow[effectiveIndex + 1] : null;

        if (!nextStatus) return;

        setLoading(true);
        try {
            const orderRef = doc(db, salesCollectionPath, orderId);
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

            // Se aprovou pedido (primeiro passo), enviar WhatsApp com rastreio
            if ((currentStatus === 'AGUARDANDO APROVAÇÃO' || currentStatus === 'PEDIDO FEITO') && orderData?.client_whatsapp) {
                const trackingUrl = `${window.location.origin}/rastreio?id=${orderId}`;
                const whatsappPhone = orderData.client_whatsapp.replace(/\D/g, '');
                const clientName = (orderData.client || '').trim();
                const orderNumber = orderData.order_number || '';
                const formattedValue = (orderData.total || orderData.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                const msgLines = [
                    `Olá *${clientName}*! Seu pedido na *Libera Sports* foi aprovado!`,
                    '',
                    `*Pedido:* ${orderNumber}`,
                    `*Valor:* R$ ${formattedValue}`,
                    ...(orderData.delivery_method === 'RETIRADA' ? ['', '*Endereço de retirada:* _Rua Manguapé, Quadra 40-A, Lote 01-A, Vila Alzira, Aparecida de Goiânia-GO, CEP: 74.913-350_'] : []),
                    '',
                    'Acompanhe seu pedido em tempo real:',
                    trackingUrl,
                    '',
                    '_Libera Sports - Vista Libera e viva a liberdade_'
                ];
                const whatsappMsg = msgLines.map(line => encodeURIComponent(line)).join('%0a');
                const whatsappLink = `https://wa.me/${whatsappPhone}?text=${whatsappMsg}`;
                setTimeout(() => {
                    const opened = window.open(whatsappLink, '_blank');
                    if (!opened) window.location.href = whatsappLink;
                }, 500);
            }
        } catch (error) {
            console.error('Error advancing step:', error);
            toast.error('Erro ao atualizar status');
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = async (id: string, nextStatus: string, currentStatus: string, reason?: string) => {
        setLoading(true);
        try {
            const orderRef = doc(db, salesCollectionPath, id);
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
            const orderRef = doc(db, salesCollectionPath, pendingOrderId);
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
                pending_reason: pendingReason.trim(),
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
                payment_method: payMethod,
                status: 'RECEBIDO',
                created_at: new Date().toISOString(),
                transaction_date: baseDate.toISOString(),
                due_date: baseDate.toISOString(),
                order_id: orderId,
                user_id: uid,
                operator_name: operatorName,
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
                    payment_method: payMethod,
                    status: 'A RECEBER',
                    created_at: new Date().toISOString(),
                    transaction_date: baseDate.toISOString(),
                    due_date: installmentsCount > 1 ? dueDate.toISOString() : (new Date(baseDate.setDate(baseDate.getDate() + 30)).toISOString()),
                    order_id: orderId,
                    user_id: uid,
                    operator_name: operatorName,
                });
            }
        } else {
            await addDoc(collection(db, financeCollectionPath), {
                type: 'INFLOW',
                amount: totalValue,
                description: `${prefix}${desc}`,
                payment_method: payMethod,
                status: 'A RECEBER',
                created_at: new Date().toISOString(),
                transaction_date: baseDate.toISOString(),
                due_date: baseDate.toISOString(),
                order_id: orderId,
                user_id: uid,
                operator_name: operatorName,
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

            const cpfCnpjDigits = clientCpfCnpj.replace(/\D/g, '');
            if (!validateCpfCnpj(cpfCnpjDigits)) {
                toast.error('CPF/CNPJ inválido!');
                setLoading(false);
                return;
            }

            const newOrder = {
                order_number: nextOrderNumber,
                client,
                cpf_cnpj: cpfCnpjDigits,
                client_whatsapp: clientWhatsapp,
                value: parseFloat(normalizedValue),
                deadline: deadline,
                delivery_method: deliveryMethod,
                payment_method: paymentMethod,
                status: 'PEDIDO FEITO',
                description,
                user_id: userId,
                operator_name: operatorName,
                linked_sale_id: linkedSaleId || null,
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

            const docRef = await addDoc(collection(db, salesCollectionPath), newOrder);
            await generateFinancialEntries(docRef.id, nextOrderNumber, description, parseFloat(normalizedValue), paymentMethod, transactionDate, installments, userId);

            // Gerar link de rastreio e enviar WhatsApp
            const trackingUrl = `${window.location.origin}/rastreio?id=${docRef.id}`;
            const whatsappPhone = clientWhatsapp.replace(/\D/g, '');
            const deliveryDate = deadline.split('-').reverse().join('/');
            const clientName = client.trim();
            const formattedValue = parseFloat(normalizedValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            const msgLines = [
                `Olá *${clientName}*! Seu pedido na *Libera Sports* foi cadastrado com sucesso!`,
                '',
                `*Pedido:* ${nextOrderNumber}`,
                `*Valor:* R$ ${formattedValue}`,
                `*Entrega prevista:* ${deliveryDate}`,
                `*Método:* ${deliveryMethod}`,
                `*Pagamento:* ${paymentMethod}`,
                ...(deliveryMethod === 'RETIRADA' ? ['', '*Endereço de retirada:* _Rua Manguapé, Quadra 40-A, Lote 01-A, Vila Alzira, Aparecida de Goiânia-GO, CEP: 74.913-350_'] : []),
                '',
                'Acompanhe seu pedido em tempo real:',
                trackingUrl,
                '',
                '_Libera Sports - Vista Libera e viva a liberdade_'
            ];
            const whatsappMsg = msgLines.map(line => encodeURIComponent(line)).join('%0a');

            const whatsappLink = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${whatsappMsg}` : '';

            toast.success('Pedido criado com sucesso!');
            setIsModalOpen(false);
            resetForm();

            if (whatsappLink) {
                // Pequeno delay para o modal fechar antes de redirecionar
                setTimeout(() => {
                    const opened = window.open(whatsappLink, '_blank');
                    if (!opened) {
                        // Fallback: se popup bloqueado, redireciona direto
                        window.location.href = whatsappLink;
                    }
                }, 500);
            }
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
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { font-family: 'Inter', sans-serif; padding: 24px; color: #111; background: white; }
                        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; }
                        .logo { font-size: 22px; font-weight: 900; font-style: italic; }
                        .os-title { text-align: right; }
                        .os-title h1 { font-size: 16px; font-weight: 900; }
                        .os-title p { font-size: 10px; color: #666; font-weight: 700; margin-top: 2px; }
                        .section { margin-bottom: 16px; }
                        .section-title { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #666; margin-bottom: 6px; border-bottom: 1px solid #eee; padding-bottom: 3px; }
                        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
                        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
                        .info-block { margin-bottom: 8px; }
                        .info-label { font-size: 8px; font-weight: 700; color: #999; text-transform: uppercase; }
                        .info-value { font-size: 13px; font-weight: 700; margin-top: 1px; }
                        .description-box { background: #f9f9f9; padding: 12px; border-radius: 8px; white-space: pre-wrap; font-size: 11px; line-height: 1.5; border: 1px solid #eee; }
                        .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee; font-size: 8px; color: #999; text-align: center; }
                        .stepper { display: flex; align-items: center; margin: 16px 0; }
                        .step { display: flex; flex-direction: column; align-items: center; flex: 1; position: relative; }
                        .step-dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid #ddd; background: #fff; z-index: 1; }
                        .step-dot.completed { background: #111; border-color: #111; }
                        .step-dot.current { background: #f97316; border-color: #f97316; box-shadow: 0 0 0 3px #fed7aa; }
                        .step-label { font-size: 6px; font-weight: 800; text-transform: uppercase; color: #ccc; margin-top: 4px; text-align: center; }
                        .step-label.completed { color: #111; }
                        .step-label.current { color: #f97316; font-weight: 900; }
                        .step-line { flex: 1; height: 2px; background: #ddd; margin-top: -6px; z-index: 0; }
                        .step-line.completed { background: #111; }
                        @media print { body { padding: 16px; } button { display: none; } @page { margin: 10mm; } }
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
                                <div class="info-value">${order.client || 'Sem cliente'}</div>
                            </div>
                            <div class="info-block">
                                <div class="info-label">WhatsApp</div>
                                <div class="info-value">${order.client_whatsapp || 'Não informado'}</div>
                            </div>
                            <div class="info-block">
                                <div class="info-label">CPF/CNPJ</div>
                                <div class="info-value">${order.cpf_cnpj ? (order.cpf_cnpj.length === 11 ? order.cpf_cnpj.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : order.cpf_cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')) : 'Não informado'}</div>
                            </div>
                        </div>
                    </div>

                    <div class="section">
                        <div class="section-title">Detalhes do Pedido</div>
                        <div class="grid-3">
                            <div class="info-block">
                                <div class="info-label">Data de Entrega</div>
                                <div class="info-value">${order.deadline ? new Date(order.deadline).toLocaleDateString('pt-BR') : '-'}</div>
                            </div>
                            <div class="info-block">
                                <div class="info-label">Método de Entrega</div>
                                <div class="info-value">${order.delivery_method || 'Não informado'}</div>
                            </div>
                            <div class="info-block">
                                <div class="info-label">Pagamento</div>
                                <div class="info-value">${order.payment_method || 'PIX'}</div>
                            </div>
                        </div>
                    </div>

                    <div class="section">
                        <div class="section-title">Grade / Descrição</div>
                        <div class="description-box">${order.description}</div>
                        ${(() => {
                            let linkedSale = order.linked_sale_id ? sales.find((s: any) => s.id === order.linked_sale_id) : null;
                            if (!linkedSale && order.description) {
                                const saleMatch = order.description.match(/\[Vinculado à (VENDA-\d+)\]/);
                                if (saleMatch) linkedSale = sales.find((s: any) => s.sale_number === saleMatch[1]);
                            }
                            if (!linkedSale?.items?.length) return '';
                            return `<div style="margin-top: 8px; background: #f0f0f0; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
                                <div style="font-size: 8px; font-weight: 800; text-transform: uppercase; color: #888; margin-bottom: 6px;">Itens da Venda Vinculada (${linkedSale.sale_number})</div>
                                ${linkedSale.items.map((i: any) => `<div style="display: flex; justify-content: space-between; font-size: 11px; padding: 3px 0; border-bottom: 1px solid #e5e5e5;">
                                    <span style="font-weight: 700;">${i.quantity}x ${i.name}</span>
                                    <span style="color: #666;">R$ ${((i.sale_price || i.price || 0) * i.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>`).join('')}
                            </div>`;
                        })()}
                    </div>

                    ${order.observations ? `
                    <div class="section">
                        <div class="section-title">Observações</div>
                        <div class="description-box" style="background: #fff8f8; border-color: #ffeaea;">${order.observations}</div>
                    </div>
                    ` : ''}

                    <div class="section">
                        <div class="section-title">Evolução do Pedido</div>
                        <div class="stepper">
                            ${(() => {
                                const steps = ['AGUARDANDO APROVAÇÃO', 'GRÁFICA', 'CORTE', 'COSTURA', 'REVISÃO', 'EM FASE DE ENTREGA', 'PEDIDO ENTREGUE'];
                                const labels: Record<string, string> = { 'AGUARDANDO APROVAÇÃO': 'APROVAÇÃO', 'GRÁFICA': 'GRÁFICA', 'CORTE': 'CORTE', 'COSTURA': 'COSTURA', 'REVISÃO': 'REVISÃO', 'EM FASE DE ENTREGA': 'ENVIO', 'PEDIDO ENTREGUE': 'ENTREGUE' };
                                const currentStepIdx = steps.indexOf(order.status);
                                return steps.map((step, idx) => {
                                    const isCompleted = idx < currentStepIdx;
                                    const isCurrent = idx === currentStepIdx;
                                    const dotClass = isCompleted ? 'completed' : isCurrent ? 'current' : '';
                                    const labelClass = isCompleted ? 'completed' : isCurrent ? 'current' : '';
                                    const line = idx < steps.length - 1 ? `<div class="step-line ${idx < currentStepIdx ? 'completed' : ''}"></div>` : '';
                                    return `<div class="step"><div class="step-dot ${dotClass}"></div><span class="step-label ${labelClass}">${labels[step]}</span></div>${line}`;
                                }).join('');
                            })()}
                        </div>
                    </div>

                    <div class="grid" style="margin-top: 12px; border-top: 2px solid #eee; padding-top: 12px;">
                        <div class="info-block">
                            <div class="info-label">Status Atual</div>
                            <div class="info-value" style="font-weight: 900;">${order.status}</div>
                        </div>
                        <div class="info-block">
                            <div class="info-label">Valor Total</div>
                            <div class="info-value" style="font-weight: 900;">R$ ${parseFloat(order.value || order.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        </div>
                    </div>

                    <div class="footer">
                        Gerado em ${new Date().toLocaleString('pt-BR')} • Libera Sports
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
        if (!window.confirm(`Tem certeza que deseja EXCLUIR o pedido ${number}? A venda e as contas financeiras vinculadas serão excluídas.`)) return;

        setLoading(true);
        try {
            // Excluir entradas financeiras vinculadas
            const finSnap = await getDocs(collection(db, financeCollectionPath));
            for (const d of finSnap.docs) {
                if (d.data().order_id === id) {
                    await deleteDoc(doc(db, financeCollectionPath, d.id));
                }
            }
            await deleteDoc(doc(db, salesCollectionPath, id));
            toast.success('Pedido e contas financeiras excluídos!');
        } catch (error) {
            console.error('Error deleting order:', error);
            toast.error('Erro ao excluir pedido');
        } finally {
            setLoading(false);
        }
    };

    const formatCpfCnpj = (value: string) => {
        const digits = value.replace(/\D/g, '').slice(0, 14);
        if (digits.length <= 11) {
            return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        }
        return digits.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    };

    const validateCpfCnpj = (value: string): boolean => {
        const digits = value.replace(/\D/g, '');
        if (digits.length === 11) {
            if (/^(\d)\1{10}$/.test(digits)) return false;
            let sum = 0;
            for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
            let rest = (sum * 10) % 11;
            if (rest === 10) rest = 0;
            if (rest !== parseInt(digits[9])) return false;
            sum = 0;
            for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
            rest = (sum * 10) % 11;
            if (rest === 10) rest = 0;
            return rest === parseInt(digits[10]);
        }
        if (digits.length === 14) {
            if (/^(\d)\1{13}$/.test(digits)) return false;
            const weights1 = [5,4,3,2,9,8,7,6,5,4,3,2];
            const weights2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
            let sum = 0;
            for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * weights1[i];
            let rest = sum % 11;
            const d1 = rest < 2 ? 0 : 11 - rest;
            if (parseInt(digits[12]) !== d1) return false;
            sum = 0;
            for (let i = 0; i < 13; i++) sum += parseInt(digits[i]) * weights2[i];
            rest = sum % 11;
            const d2 = rest < 2 ? 0 : 11 - rest;
            return parseInt(digits[13]) === d2;
        }
        return false;
    };

    const handleSaveFornecedor = async () => {
        if (!fornecedorName.trim()) { toast.error('Nome obrigatório'); return; }
        const digits = fornecedorCpfCnpj.replace(/\D/g, '');
        if (digits.length > 0 && !validateCpfCnpj(digits)) { toast.error('CPF/CNPJ inválido'); return; }
        try {
            const data: any = {
                name: fornecedorName.trim().toUpperCase(),
                type: fornecedorType,
                cpf_cnpj: digits || '',
                whatsapp: fornecedorWhatsapp.trim(),
                user_id: userId,
                ...(editingFornecedor ? {} : { created_at: new Date().toISOString() }),
            };
            if (fornecedorType === 'FUNCIONÁRIO' && fornecedorStartDate) {
                data.start_date = fornecedorStartDate;
            }
            if (editingFornecedor) {
                await updateDoc(doc(db, fornecedoresCollectionPath, editingFornecedor.id), data);
                toast.success('Fornecedor atualizado!');
            } else {
                await addDoc(collection(db, fornecedoresCollectionPath), data);
                toast.success('Cliente cadastrado!');
                // Auto-preencher campos da venda com o novo cliente
                setSaleClient(data.name);
                setSaleWhatsapp(data.whatsapp || '');
                if (data.cpf_cnpj) setSaleCpfCnpj(formatCpfCnpj(data.cpf_cnpj));
            }
            setFornecedorModalOpen(false);
            setFornecedorName(''); setFornecedorCpfCnpj(''); setFornecedorCpfCnpjError(''); setFornecedorWhatsapp(''); setEditingFornecedor(null);
        } catch (err) { console.error(err); toast.error('Erro ao salvar fornecedor'); }
    };

    const handleDeleteFornecedor = async (id: string) => {
        if (!confirm('Excluir este fornecedor?')) return;
        try {
            await deleteDoc(doc(db, fornecedoresCollectionPath, id));
            toast.success('Fornecedor excluído!');
        } catch (err) { toast.error('Erro ao excluir'); }
    };

    const handleFornecedorCpfCnpjChange = (val: string) => {
        const formatted = formatCpfCnpj(val);
        setFornecedorCpfCnpj(formatted);
        const digits = val.replace(/\D/g, '');
        if (digits.length === 11 || digits.length === 14) {
            setFornecedorCpfCnpjError(validateCpfCnpj(val) ? '' : 'CPF/CNPJ inválido');
        } else { setFornecedorCpfCnpjError(''); }
    };

    const generateFinancePDF = (items: any[], title: string, type: 'simples' | 'completo') => {
        const now = new Date();
        const total = items.reduce((a: number, i: any) => a + i.amount, 0);
        const fmtMoney = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        let resumoHtml = '';
        if (type === 'completo') {
            const avg = items.length > 0 ? total / items.length : 0;
            const maxItem = items.length > 0 ? items.reduce((a: any, b: any) => a.amount > b.amount ? a : b) : null;
            const statusGroups: Record<string, number> = {};
            items.forEach((i: any) => { statusGroups[i.status] = (statusGroups[i.status] || 0) + i.amount; });
            const maxVal = Math.max(...Object.values(statusGroups), 1);
            resumoHtml = `
                <div style="margin-bottom:24px;padding:16px;background:#f5f5f5;border-radius:8px;">
                    <h2 style="margin:0 0 12px;font-size:14px;font-weight:900;text-transform:uppercase;">Resumo</h2>
                    <p style="margin:4px 0;font-size:12px;"><strong>Total de registros:</strong> ${items.length}</p>
                    <p style="margin:4px 0;font-size:12px;"><strong>Valor total:</strong> ${fmtMoney(total)}</p>
                    <p style="margin:4px 0;font-size:12px;"><strong>Valor médio:</strong> ${fmtMoney(avg)}</p>
                    ${maxItem ? `<p style="margin:4px 0;font-size:12px;"><strong>Maior valor:</strong> ${fmtMoney(maxItem.amount)} - ${(maxItem.description || '').substring(0, 40)}</p>` : ''}
                    <h3 style="margin:12px 0 8px;font-size:12px;font-weight:900;text-transform:uppercase;">Por Status</h3>
                    ${Object.entries(statusGroups).map(([status, val]) => `
                        <div style="margin:4px 0;display:flex;align-items:center;gap:8px;">
                            <div style="width:${(val / maxVal) * 200}px;height:16px;background:#39FF14;border-radius:4px;"></div>
                            <span style="font-size:11px;font-weight:700;">${status}: ${fmtMoney(val)}</span>
                        </div>
                    `).join('')}
                </div>`;
        }

        const getPaymentInfo = (i: any) => {
            const method = i.payment_method || '-';
            if (method === 'CARTÃO CRÉDITO' || method === 'CARTÃO CREDITO') {
                const desc = i.description || '';
                const parcelaMatch = desc.match(/\(Parcela (\d+)\/(\d+)\)/i) || desc.match(/\((\d+)\/(\d+)\)/);
                if (parcelaMatch) return `Cartão ${parcelaMatch[1]}/${parcelaMatch[2]}x`;
                return 'Cartão à vista';
            }
            return method;
        };

        items.sort((a: any, b: any) => {
            const dateA = new Date(a.due_date || a.transaction_date || a.created_at).getTime();
            const dateB = new Date(b.due_date || b.transaction_date || b.created_at).getTime();
            return dateA - dateB;
        });

        const rowsHtml = items.map((i, idx) => `
            <tr style="background:${idx % 2 === 0 ? '#fff' : '#f9f9f9'}">
                <td style="padding:6px 8px;font-size:11px;border-bottom:1px solid #eee;">${(i.description || '').substring(0, 60)}</td>
                <td style="padding:6px 8px;font-size:11px;border-bottom:1px solid #eee;white-space:nowrap;">${new Date(i.due_date || i.transaction_date || i.created_at).toLocaleDateString('pt-BR')}</td>
                <td style="padding:6px 8px;font-size:11px;border-bottom:1px solid #eee;white-space:nowrap;">${getPaymentInfo(i)}</td>
                <td style="padding:6px 8px;font-size:11px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">${fmtMoney(i.amount)}</td>
                <td style="padding:6px 8px;font-size:11px;border-bottom:1px solid #eee;font-weight:700;">${i.status}</td>
            </tr>`).join('');

        const html = `<html><head><title>${title} - Libera Sports</title>
            <style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            *{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Inter',sans-serif;padding:24px;color:#111;}
            @media print{button{display:none!important;}@page{margin:10mm;}}</style>
            </head><body>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;border-bottom:2px solid #111;padding-bottom:12px;">
                <div><h1 style="font-size:20px;font-weight:900;">LIBERA SPORTS</h1><p style="font-size:13px;font-weight:700;margin-top:4px;">${title.replace(/_/g, ' ')}</p></div>
                <p style="font-size:10px;color:#666;">Gerado em: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}</p>
            </div>
            ${resumoHtml}
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr style="background:#1e1e1e;">
                    <th style="padding:8px;font-size:11px;color:#39FF14;text-align:left;font-weight:900;">Descrição</th>
                    <th style="padding:8px;font-size:11px;color:#39FF14;text-align:left;font-weight:900;">Vencimento</th>
                    <th style="padding:8px;font-size:11px;color:#39FF14;text-align:left;font-weight:900;">Pagamento</th>
                    <th style="padding:8px;font-size:11px;color:#39FF14;text-align:right;font-weight:900;">Valor</th>
                    <th style="padding:8px;font-size:11px;color:#39FF14;text-align:left;font-weight:900;">Status</th>
                </tr></thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot><tr style="background:#1e1e1e;">
                    <td style="padding:8px;font-size:11px;color:#fff;font-weight:900;" colspan="3">${items.length} itens</td>
                    <td style="padding:8px;font-size:11px;color:#fff;font-weight:900;text-align:right;">${fmtMoney(total)}</td>
                    <td></td>
                </tr></tfoot>
            </table>
            <div style="text-align:center;margin-top:24px;">
                <button onclick="window.print()" style="background:#111;color:#fff;padding:10px 24px;border:none;border-radius:8px;font-weight:900;cursor:pointer;font-size:12px;">IMPRIMIR / SALVAR PDF</button>
            </div>
            </body></html>`;

        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
    };

    const [showPdfMenu, setShowPdfMenu] = useState(false);

    const handleCpfCnpjChange = (val: string) => {
        const formatted = formatCpfCnpj(val);
        setClientCpfCnpj(formatted);
        const digits = val.replace(/\D/g, '');
        if (digits.length === 11 || digits.length === 14) {
            setCpfCnpjError(validateCpfCnpj(val) ? '' : 'CPF/CNPJ inválido');
        } else {
            setCpfCnpjError('');
        }
    };

    const resetForm = () => {
        setClient('');
        setClientCpfCnpj('');
        setCpfCnpjError('');
        setClientWhatsapp('');
        setValue('');
        setDeadline(addBusinessDays(new Date(), 20));
        setDeliveryMethod('MOTOBOY');
        setPaymentMethod('PIX');
        setDescription('');
        setTransactionDate(new Date().toISOString().split('T')[0]);
        setInstallments(1);
        setLinkSale(false);
        setLinkedSaleId('');
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
        <div className={`min-h-screen ${t.bg} ${t.text} selection:bg-[#39FF14] selection:text-black font-sans pb-20 transition-colors duration-300`}>
            {/* Navbar */}
            <nav className={`px-6 py-4 border-b ${t.border} ${t.nav} sticky top-0 z-50 flex justify-between items-center transition-colors duration-300`}>
                <button
                    onClick={() => setActiveTab('HOME')}
                    className={`font-black text-xl italic uppercase flex items-center gap-2 tracking-tighter pl-1 hover:text-[#39FF14] transition-colors ${t.text}`}
                >
                    LIBERA SPORTS
                </button>
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleTheme}
                        className={`p-2 rounded-xl transition-all hover:scale-110 ${isDark ? 'text-yellow-400 hover:bg-yellow-400/10' : 'text-gray-600 hover:bg-gray-200'}`}
                        title={isDark ? 'Modo claro' : 'Modo escuro'}
                    >
                        {isDark ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                    <button
                        onClick={() => {
                            const newName = prompt('Seu apelido:', operatorName);
                            if (newName && newName.trim()) {
                                setOperatorName(newName.trim());
                                localStorage.setItem('libera_operator_name', newName.trim());
                                toast.success(`Apelido alterado para ${newName.trim()}`);
                            }
                        }}
                        className={`hidden md:flex items-center gap-2 text-sm font-black uppercase tracking-widest transition-colors ${isDark ? 'text-white hover:text-[#39FF14]' : 'text-black hover:text-green-600'}`}
                        title="Clique para alterar seu apelido"
                    >
                        <User size={12} className={isDark ? 'text-[#39FF14]' : 'text-green-600'} /> {operatorName}
                    </button>
                    <button
                        onClick={logout}
                        className={`text-sm font-black uppercase transition-colors ${isDark ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-black'}`}
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
                    "Mas os que esperam no Senhor renovam as suas forças; sobem com asas como águias… — Isaías 40:31",
                    "A disciplina é a ponte entre metas e conquistas.",
                    "Os que confiam no Senhor são como o monte Sião, que não se abala, mas permanece para sempre. — Salmos 125:1",
                    "Cada peça costurada carrega uma história.",
                    "Seja forte e corajoso… o Senhor, teu Deus, está contigo por onde quer que andares. — Josué 1:9",
                    "O extraordinário nasce do compromisso com o ordinário.",
                    "Ainda que eu ande pelo vale da sombra da morte, não temerei mal algum, porque tu estás comigo. — Salmos 23:4",
                    "Não espere pela oportunidade. Crie-a.",
                    "Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia. — Salmos 46:1",
                    "A excelência não é um ato, é um hábito.",
                    "A fé enxerga caminhos onde os olhos só veem muros.",
                    "Grandes confecções começam com grandes decisões.",
                    "O céu governa até quando tudo parece fora de controle.",
                    "O trabalho duro vence o talento quando o talento não trabalha duro.",
                    "Deus não se atrasa — Ele trabalha no invisível.",
                    "Vista Libera. Viva a liberdade.",
                    "A paz de Deus não depende das circunstâncias.",
                    "A persistência é o caminho do êxito.",
                    "Cada corte, cada costura, cada detalhe importa.",
                    "Sonhe grande. Comece agora. Não pare.",
                    "O melhor momento para começar foi ontem. O segundo melhor é agora.",
                    "Produzir com excelência é uma forma de respeito ao cliente.",
                    "A diferença entre o possível e o impossível está na determinação.",
                    "Transformamos tecido em identidade.",
                    "Seja a energia que você quer atrair.",
                    "Quando parece impossível, é porque está perto de acontecer.",
                    "De Goiânia para o mundo. Sem limites.",
                    "Seja mais forte que sua melhor desculpa.",
                    "Se a gente cresce com os golpes duros da vida, também podemos crescer com os toques suaves na alma."
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
                                            className="group bg-white border border-zinc-200 rounded-2xl py-4 px-2 flex flex-col items-center gap-2 hover:border-zinc-400 hover:shadow-lg hover:shadow-black/10 transition-all hover:scale-[1.03] active:scale-95"
                                        >
                                            <Icon size={20} className="text-zinc-800 transition-colors" />
                                            <span className="text-sm font-black uppercase tracking-wider text-zinc-800 transition-colors">
                                                {mod.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Frase motivacional */}
                        <div className="text-center max-w-lg animate-fade-in-up-delay">
                            <p className="text-white/70 text-lg md:text-2xl font-light italic leading-relaxed tracking-wide"><span className="tracking-normal">&ldquo; </span>{phrase}<span className="tracking-normal">&rdquo;</span></p>
                            <div className="mt-6 w-12 h-[2px] bg-[#39FF14] mx-auto rounded-full" />
                            <p className="mt-4 text-[#39FF14] text-[13px] font-black uppercase tracking-[0.3em]">
                                Libera Sports
                            </p>
                        </div>
                    </div>
                );
            })()}

            {/* Tab Navigation (visible when NOT on HOME) */}
            {activeTab !== 'HOME' && (
                <div className="max-w-5xl mx-auto px-4 md:px-6 mt-4 md:mt-6">
                    <div className={`flex gap-1.5 p-1.5 rounded-2xl border overflow-x-auto mask-fade ${t.card}`}>
                        <button
                            onClick={() => setActiveTab('HOME')}
                            className={`flex items-center justify-center px-5 py-4 rounded-xl font-black uppercase text-sm tracking-widest transition-all shrink-0 ${t.text} ${isDark ? 'hover:bg-zinc-900' : 'hover:bg-gray-100'}`}
                        >
                            <Home size={20} />
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
                                        flex-1 flex items-center justify-center gap-2 px-5 py-4 rounded-xl font-black uppercase text-sm tracking-wider transition-all shrink-0
                                        ${isActive
                                            ? `${t.accentBg} ${t.accentText} shadow-lg`
                                            : `${t.text} ${isDark ? 'hover:bg-zinc-900' : 'hover:bg-gray-100'}`
                                        }
                                    `}
                                >
                                    <Icon size={18} />
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
                                <p className="text-white text-sm mt-2">Acompanhamento de etapas em tempo real</p>
                                <div className="mt-4 flex flex-col items-start gap-1">
                                    <p className="text-white text-sm uppercase font-bold tracking-widest">
                                        De Goiânia-GO para o mundo
                                    </p>
                                    <p className="text-white/70 text-sm uppercase font-bold tracking-[0.2em]">
                                        Confecção de produtos personalizados
                                    </p>
                                </div>
                            </div>
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
                                        <span className={`text-[13px] font-black uppercase tracking-widest mb-1 transition-colors ${isActive ? (step === 'PENDÊNCIA' ? 'text-black' : 'text-black') : 'text-white group-hover:text-white'}`}>
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
                                <Package size={18} className="text-white group-focus-within:text-[#39FF14] transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Pesquisar por número do pedido ou nome do cliente..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-transparent border-none outline-none text-white text-sm w-full placeholder:text-zinc-600 font-bold"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="text-white/70 hover:text-white transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Orders List */}
                        <div className="space-y-6">
                            {loading && orders.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 animate-pulse text-white">
                                    <Loader2 className="w-10 h-10 mb-4 animate-spin" />
                                    <p className="font-black uppercase italic tracking-widest text-xs">Sincronizando com a fábrica...</p>
                                </div>
                            ) : filteredOrders.length === 0 ? (
                                <div className="text-center py-20 opacity-20 font-black uppercase italic border-2 border-dashed border-zinc-900 rounded-[32px]">
                                    {activeFilter ? `Nenhum pedido em ${activeFilter}` : 'Sem pedidos ativos'}
                                </div>
                            ) : (
                                filteredOrders.map((order) => {
                                    try {
                                    const currentIdx = workflow.indexOf(order.status || '');
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
                                                        <span className="text-white/70 text-[13px] font-black uppercase tracking-widest">{order.order_number}</span>
                                                        <h3 className="text-sm font-black text-white group-hover:text-[#39FF14] transition-colors truncate">{order.client || 'Sem cliente'}</h3>
                                                    </div>
                                                    <div className="hidden md:flex flex-col">
                                                        <span className="text-white text-[13px] font-black uppercase tracking-widest">Entrega</span>
                                                        <span className="text-sm text-white/70 font-bold">{order.deadline ? order.deadline.split('-').reverse().join('/') : '-'}</span>
                                                    </div>
                                                    <div className="hidden lg:flex flex-col max-w-[200px]">
                                                        <span className="text-white text-[13px] font-black uppercase tracking-widest">Grade</span>
                                                        <span className="text-sm text-white font-medium truncate">{order.description}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-6 shrink-0">
                                                    <div className="text-right">
                                                        <span className="block text-sm text-white/70 font-bold uppercase tracking-widest">Valor</span>
                                                        <span className="text-xs font-black text-[#39FF14]">
                                                            R$ {Number(order.value || order.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-900 text-white group-hover:text-white transition-all">
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
                                                    className="absolute top-6 right-20 p-2 rounded-xl bg-zinc-950 border border-zinc-900 text-white hover:text-white transition-all flex items-center gap-2 text-sm font-black uppercase"
                                                >
                                                    <ChevronUp size={14} /> Resumir
                                                </button>
                                            )}
                                            <div className="flex flex-col md:flex-row justify-between gap-6">
                                                <div className="flex-grow">
                                                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                                                        <span className="text-white/70 text-sm font-black uppercase tracking-widest">
                                                            {order.order_number || `#${order.id.slice(0, 5).toUpperCase()}`}
                                                        </span>
                                                        <span className="bg-zinc-900 text-white/70 px-1.5 py-0.5 rounded text-[13px] font-bold flex items-center gap-1">
                                                            <Clock size={9} /> {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                                        </span>
                                                        <span className="bg-zinc-900 text-white/70 px-1.5 py-0.5 rounded text-[13px] font-bold flex items-center gap-1">
                                                            <Calendar size={9} /> {order.deadline ? order.deadline.split('-').reverse().join('/') : '-'}
                                                        </span>
                                                        <span className="bg-zinc-900 text-[#39FF14] px-1.5 py-0.5 rounded text-[13px] font-bold flex items-center gap-1 uppercase">
                                                            <Truck size={9} /> {order.delivery_method || '-'}
                                                        </span>
                                                        <span className="bg-zinc-900 text-orange-500 px-1.5 py-0.5 rounded text-[13px] font-bold flex items-center gap-1 uppercase">
                                                            <TrendingUp size={9} /> {order.payment_method || 'PIX'}
                                                        </span>
                                                    </div>

                                                    <div className="flex-1">
                                                        <div className="flex items-center justify-between mb-4 gap-2">
                                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-900 group-hover:border-white/30 transition-all shadow-inner shrink-0">
                                                                    <User className="text-[#39FF14]" size={18} />
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <h3 className="text-[13px] md:text-xl font-black tracking-tighter text-white uppercase italic">
                                                                        {order.client || 'Sem cliente'}
                                                                    </h3>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <span className="text-white/70 text-sm font-black uppercase tracking-widest">{order.order_number}</span>
                                                                        <span className="w-1 h-1 rounded-full bg-zinc-800" />
                                                                        <span className="text-white text-sm font-bold uppercase flex items-center gap-1">
                                                                            <Truck size={10} /> {order.delivery_method || '-'}
                                                                        </span>
                                                                        {order.client_whatsapp && (
                                                                            <a
                                                                                href={`https://wa.me/${order.client_whatsapp.replace(/\D/g, '')}`}
                                                                                target="_blank"
                                                                                className="p-1 rounded bg-zinc-900 text-[#39FF14] hover:bg-[#39FF14] hover:text-black transition-all"
                                                                            >
                                                                                <MessageCircle size={12} />
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {order.status === 'PENDÊNCIA' && order.pending_reason && (
                                                            <div className="bg-[#FF3D00]/10 border border-[#FF3D00]/20 p-3 rounded-xl mb-3 mt-2 flex items-start gap-2">
                                                                <AlertCircle className="text-[#FF3D00] shrink-0" size={14} />
                                                                <div>
                                                                    <p className="text-[#FF3D00] text-[13px] font-black uppercase tracking-widest mb-0.5">Pendência</p>
                                                                    <p className="text-white text-[13px] font-medium">{order.pending_reason}</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Valor */}
                                                    <div className="flex items-center justify-between mt-1 mb-2">
                                                        <div>
                                                            <span className="block text-sm text-white/70 font-bold uppercase tracking-widest">Valor Total</span>
                                                            <span className="text-lg font-black text-[#39FF14]">
                                                                R$ {Number(order.value || order.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button onClick={() => {
                                                                const items = order.items && order.items.length > 0
                                                                    ? order.items.map((i: any) => `${i.quantity}x ${i.name}`).join('\n')
                                                                    : order.description || 'Sem descrição';
                                                                alert(`${order.order_number}\n\n${items}`);
                                                            }}
                                                                className="p-4 rounded-xl bg-zinc-950 border border-zinc-900 text-white/70 hover:text-[#39FF14] transition-all" title="Ver produtos">
                                                                <Eye size={22} />
                                                            </button>
                                                            <button onClick={() => handlePrintOrder(order)}
                                                                className="p-4 rounded-xl bg-zinc-950 border border-zinc-900 text-white/70 hover:text-[#39FF14] transition-all" title="PDF">
                                                                <FileText size={22} />
                                                            </button>
                                                            <button onClick={() => handleDeleteOrder(order.id, order.order_number)}
                                                                className="p-4 rounded-xl bg-zinc-950 border border-zinc-900 text-white/70 hover:text-[#FF3D00] transition-all" title="Excluir">
                                                                <Trash2 size={22} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Botões Avançar + Pendência na mesma linha */}
                                                    <div className="flex gap-2 mb-3">
                                                        {order.status !== 'PEDIDO ENTREGUE' && order.status !== 'PENDÊNCIA' && (
                                                            <button
                                                                onClick={() => advanceStep(order.id, order.status)}
                                                                className="flex-1 bg-[#39FF14] text-black px-3 py-2.5 rounded-xl font-black text-sm uppercase hover:scale-[1.01] transition-all shadow-lg shadow-[#39FF14]/10 flex items-center justify-center gap-1.5"
                                                            >
                                                                {order.status === 'AGUARDANDO APROVAÇÃO' || order.status === 'PEDIDO FEITO'
                                                                    ? 'Aprovar'
                                                                    : order.status === 'REVISÃO'
                                                                        ? 'Finalizar'
                                                                        : order.status === 'EM FASE DE ENTREGA'
                                                                            ? 'Confirmar Entrega'
                                                                            : 'Avançar'
                                                                } <ArrowRight size={12} />
                                                            </button>
                                                        )}
                                                        {order.status === 'PENDÊNCIA' && (
                                                            <button
                                                                onClick={() => { setPendingViewOrder(order); }}
                                                                className="flex-1 bg-[#FF3D00] text-white px-3 py-2.5 rounded-xl font-black text-sm uppercase hover:scale-[1.01] transition-all shadow-lg shadow-[#FF3D00]/10 flex items-center justify-center gap-1.5"
                                                            >
                                                                <AlertCircle size={12} /> Ver Pendência
                                                            </button>
                                                        )}
                                                        {order.status === 'PEDIDO ENTREGUE' && (
                                                            <div className="flex-1 bg-zinc-950 text-[#39FF14] px-3 py-2.5 rounded-xl font-black text-sm uppercase border border-[#39FF14]/20 flex items-center justify-center gap-1.5">
                                                                <Check size={12} /> Entregue
                                                            </div>
                                                        )}
                                                        {order.status !== 'PENDÊNCIA' && order.status !== 'PEDIDO ENTREGUE' && (
                                                            <button
                                                                onClick={() => { setPendingOrderId(order.id); setIsPendingModalOpen(true); }}
                                                                className="px-3 py-2.5 rounded-xl bg-zinc-950 border border-orange-500/30 text-orange-500 hover:bg-orange-500/10 transition-all text-sm font-black uppercase flex items-center gap-1.5"
                                                            >
                                                                <AlertCircle size={12} /> Pendência
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Visual Stepper - sem scroll, responsivo */}
                                                    <div className="mb-4 mt-1 px-4">
                                                        <div className="relative flex justify-between items-center h-1 bg-zinc-900 rounded-full">
                                                            <div
                                                                className="absolute left-0 top-0 h-full bg-[#39FF14] rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(57,255,20,0.4)]"
                                                                style={{ width: `${(currentIdx / (workflow.length - 1)) * 100}%` }}
                                                            />

                                                            {workflow.map((step, idx) => {
                                                                const isCompleted = idx < currentIdx;
                                                                const isCurrent = idx === currentIdx;
                                                                const shortNames: Record<string, string> = {
                                                                    'AGUARDANDO APROVAÇÃO': 'APROVAÇÃO',
                                                                    'PEDIDO FEITO': 'APROVAÇÃO',
                                                                    'GRÁFICA': 'GRÁFICA',
                                                                    'CORTE': 'CORTE',
                                                                    'COSTURA': 'COSTURA',
                                                                    'REVISÃO': 'REVISÃO',
                                                                    'EM FASE DE ENTREGA': 'ENVIO',
                                                                    'PEDIDO ENTREGUE': 'ENTREGUE',
                                                                };

                                                                return (
                                                                    <div key={step} className="relative flex flex-col items-center">
                                                                        <div className={`
                                                                    w-2.5 h-2.5 rounded-full border-2 border-black transition-all duration-300 z-10
                                                                    ${isCompleted ? 'bg-[#39FF14]' : isCurrent ? 'bg-white scale-125 shadow-[0_0_10px_white]' : 'bg-zinc-800'}
                                                                `} />
                                                                        <span className={`
                                                                    absolute top-4 text-[6px] md:text-sm font-black uppercase tracking-tight whitespace-nowrap transition-colors
                                                                    ${isCurrent ? 'text-white' : isCompleted ? 'text-[#39FF14]' : 'text-white'}
                                                                `}>
                                                                            {shortNames[step] || step}
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
                                                            className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white hover:text-[#39FF14] transition-colors"
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
                                                                    <label className="text-[13px] font-black uppercase tracking-[0.2em] text-[#39FF14]/70">Notas de Produção</label>
                                                                    <button
                                                                        onClick={() => {
                                                                            setEditingObsId(order.id);
                                                                            setObsValue(order.observations || '');
                                                                        }}
                                                                        className="text-[13px] font-black uppercase text-white hover:text-[#39FF14] transition-colors"
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
                                                                                className="px-4 py-2 bg-[#39FF14] text-black text-sm font-black uppercase rounded-lg hover:scale-105 transition-all"
                                                                            >
                                                                                Salvar
                                                                            </button>
                                                                            <button
                                                                                onClick={() => setEditingObsId(null)}
                                                                                className="px-4 py-2 bg-zinc-800 text-white text-sm font-black uppercase rounded-lg hover:bg-zinc-700 transition-all"
                                                                            >
                                                                                Cancelar
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-sm text-white font-medium leading-relaxed italic">
                                                                        {order.observations || "Nenhuma observação registrada."}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center justify-between mt-4">
                                                        <p className="text-white/70 text-sm italic line-clamp-1">Grade: {order.description || '-'}</p>
                                                        <div className="flex items-center gap-4">
                                                            <button
                                                                onClick={() => setExpandedHistoryIds(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                                                                className="text-[13px] font-black uppercase tracking-widest text-white hover:text-[#39FF14] transition-colors flex items-center gap-1"
                                                            >
                                                                <History size={10} /> {expandedHistoryIds[order.id] ? 'Ocultar Histórico' : 'Ver Histórico'}
                                                            </button>
                                                            {order.order_logs && order.order_logs.length > 0 && (
                                                                <div className="text-sm text-white font-bold uppercase flex items-center gap-1">
                                                                    <Info size={10} /> Ultima mov. {new Date(order.order_logs[order.order_logs.length - 1].created_at).toLocaleString('pt-BR')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* History Timeline */}
                                                    {expandedHistoryIds[order.id] && (
                                                        <div className="mt-4 bg-zinc-950/50 border border-zinc-900 rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                            <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white mb-4 flex items-center gap-2">
                                                                <History size={12} className="text-[#39FF14]" /> Linha do Tempo
                                                            </h4>
                                                            <div className="space-y-4 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-zinc-900">
                                                                {order.order_logs && [...order.order_logs].reverse().map((log: any, lIdx: number) => (
                                                                    <div key={log.id} className="relative pl-6">
                                                                        <div className={`absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-black ${lIdx === 0 ? 'bg-[#39FF14]' : 'bg-zinc-800'}`} />
                                                                        <div className="flex flex-col">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-sm font-black text-white uppercase tracking-tighter">
                                                                                    {log.old_status} <ArrowRight size={8} className="inline mx-1 text-white/70" /> {log.new_status}
                                                                                </span>
                                                                                <span className="text-sm text-white/70 font-bold uppercase">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                                                                            </div>
                                                                            <span className="text-[13px] text-white font-bold uppercase mt-0.5">Operador: <span className="text-white">{log.operator_name}</span></span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                            </div>
                                        </div>
                                    );
                                    } catch (err) { console.error('Erro ao renderizar pedido:', order.id, err); return null; }
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
                                <p className="text-white text-sm mt-1">Gestão de produtos e preços</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsProductModalOpen(true)}
                                    className="bg-[#39FF14] text-black px-6 py-3 rounded-xl font-black uppercase text-sm hover:scale-105 transition-all"
                                >
                                    + Novo Produto
                                </button>
                            </div>
                        </div>

                        {stockLoading ? (
                            <div className="flex justify-center py-20">
                                <Loader2 className="animate-spin text-[#39FF14]" size={40} />
                            </div>
                        ) : products.length === 0 ? (
                            <div className="bg-zinc-950 rounded-3xl border border-zinc-900 p-8 text-center border-dashed">
                                <Box size={40} className="text-zinc-800 mx-auto mb-4" />
                                <p className="text-white font-bold uppercase text-sm tracking-widest">Nenhum produto cadastrado no estoque.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {products.map((p) => (
                                    <div key={p.id} className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-[32px] hover:border-[#39FF14]/30 transition-all">
                                        <div className="flex gap-4 mb-4">
                                            {p.image ? (
                                                <div className="w-24 h-24 rounded-2xl overflow-hidden border border-zinc-800 shrink-0">
                                                    <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                                                </div>
                                            ) : (
                                                <div className="w-24 h-24 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0">
                                                    <Box size={32} className="text-[#39FF14]/50" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                {editingProductId === p.id ? (
                                                    <div className="space-y-3">
                                                        <div>
                                                            <p className="text-[11px] text-white/70 font-bold uppercase mb-1">Nome</p>
                                                            <input type="text" value={editProductName} onChange={e => setEditProductName(e.target.value)}
                                                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-white font-bold uppercase outline-none focus:border-[#39FF14]" />
                                                        </div>
                                                        <div>
                                                            <p className="text-[11px] text-white/70 font-bold uppercase mb-1">Detalhes</p>
                                                            <textarea value={editProductDetails} onChange={e => setEditProductDetails(e.target.value)}
                                                                placeholder="Detalhes do produto..." rows={2}
                                                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-white outline-none focus:border-[#39FF14] resize-none" />
                                                        </div>
                                                        <div>
                                                            <p className="text-[11px] text-white/70 font-bold uppercase mb-1">Foto</p>
                                                            <div className="flex items-center gap-3">
                                                                {editProductImage ? (
                                                                    <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-zinc-700 shrink-0">
                                                                        <img src={editProductImage} alt="Preview" className="w-full h-full object-cover" />
                                                                        <button type="button" onClick={() => setEditProductImage('')}
                                                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                                                                            <X size={8} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="w-12 h-12 rounded-lg border border-dashed border-zinc-700 flex items-center justify-center shrink-0">
                                                                        <Package size={16} className="text-white/30" />
                                                                    </div>
                                                                )}
                                                                <label className="flex-1 cursor-pointer">
                                                                    <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-lg p-2 text-center hover:border-[#39FF14]/50 transition-all">
                                                                        <p className="text-[11px] font-bold text-white uppercase">{editProductImage ? 'Trocar' : 'Escolher foto'}</p>
                                                                    </div>
                                                                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                                                                        const file = e.target.files?.[0];
                                                                        if (!file) return;
                                                                        if (file.size > 500000) { toast.error('Imagem muito grande (máx 500KB)'); return; }
                                                                        const reader = new FileReader();
                                                                        reader.onload = () => setEditProductImage(reader.result as string);
                                                                        reader.readAsDataURL(file);
                                                                    }} />
                                                                </label>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <div>
                                                                <p className="text-[11px] text-white/70 font-bold uppercase mb-1">Preço Venda</p>
                                                                <input type="text" value={editProductSalePrice} onChange={e => setEditProductSalePrice(formatCurrency(e.target.value))}
                                                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-white font-bold outline-none focus:border-[#39FF14]" />
                                                            </div>
                                                            <div>
                                                                <p className="text-[11px] text-white/70 font-bold uppercase mb-1">Preço Custo</p>
                                                                <input type="text" value={editProductCostPrice} onChange={e => setEditProductCostPrice(formatCurrency(e.target.value))}
                                                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-white font-bold outline-none focus:border-[#39FF14]" />
                                                            </div>
                                                            <div>
                                                                <p className="text-[11px] text-white/70 font-bold uppercase mb-1">Estoque</p>
                                                                <div className="flex items-center gap-1">
                                                                    <button onClick={() => setEditProductStock(String(Math.max(0, parseInt(editProductStock || '0') - 1)))}
                                                                        className="w-7 h-8 rounded-lg bg-zinc-800 text-white font-black flex items-center justify-center hover:bg-zinc-700 text-sm">−</button>
                                                                    <input type="number" value={editProductStock} onChange={e => setEditProductStock(e.target.value)}
                                                                        className="w-12 h-8 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-center text-sm font-black outline-none focus:border-[#39FF14]" />
                                                                    <button onClick={() => setEditProductStock(String(parseInt(editProductStock || '0') + 1))}
                                                                        className="w-7 h-8 rounded-lg bg-zinc-800 text-white font-black flex items-center justify-center hover:bg-zinc-700 text-sm">+</button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <label className="flex items-center gap-2 cursor-pointer mt-1">
                                                            <input type="checkbox" checked={editProductShowInStore} onChange={e => setEditProductShowInStore(e.target.checked)} className="w-4 h-4 rounded accent-[#39FF14]" />
                                                            <span className="text-[11px] font-black uppercase text-white/70">Visível na Loja</span>
                                                        </label>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <button onClick={async () => {
                                                                try {
                                                                    const updateData: any = {
                                                                        name: editProductName.trim().toUpperCase(),
                                                                        details: editProductDetails.trim(),
                                                                        sale_price: parseBRL(editProductSalePrice),
                                                                        cost_price: parseBRL(editProductCostPrice),
                                                                        stock: parseInt(editProductStock) || 0,
                                                                        image: editProductImage || '',
                                                                        show_in_store: editProductShowInStore,
                                                                    };
                                                                    await updateDoc(doc(db, productsCollectionPath, p.id), updateData);
                                                                    toast.success('Produto atualizado!');
                                                                    setEditingProductId(null);
                                                                } catch (err) { toast.error('Erro ao atualizar'); }
                                                            }}
                                                                className="px-4 h-9 rounded-lg bg-[#39FF14] text-black text-xs font-black uppercase hover:scale-105 transition-all">Salvar</button>
                                                            <button onClick={() => setEditingProductId(null)}
                                                                className="px-3 h-9 rounded-lg text-white/50 hover:text-white text-xs font-black uppercase">Cancelar</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="text-base font-black italic uppercase text-white leading-tight">{p.name}</h3>
                                                            {p.show_in_store && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-[#39FF14]/20 text-[#39FF14]">LOJA</span>}
                                                        </div>
                                                        {p.details && <p className="text-[13px] text-white/50 mt-0.5">{p.details}</p>}
                                                        <div className="mt-2">
                                                            <p className="text-[13px] text-white/70 font-bold uppercase mb-1">Em Estoque</p>
                                                            <p className={`text-2xl font-black ${p.stock <= 5 ? 'text-orange-500' : 'text-white'}`}>
                                                                {p.stock} un
                                                            </p>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-end justify-between pt-4 border-t border-zinc-800">
                                            <div className="grid grid-cols-2 gap-4 flex-1">
                                                <div>
                                                    <p className="text-[13px] text-white/70 font-bold uppercase">Preço Venda</p>
                                                    <p className="text-lg font-black text-[#39FF14]">R$ {p.sale_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[13px] text-white/70 font-bold uppercase">Preço Custo</p>
                                                    <p className="text-lg font-black text-white/70">R$ {p.cost_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0 ml-2">
                                                <button
                                                    onClick={() => {
                                                        setEditingProductId(p.id);
                                                        setEditProductName(p.name);
                                                        setEditProductDetails(p.details || '');
                                                        setEditProductSalePrice(p.sale_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                                                        setEditProductCostPrice(p.cost_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                                                        setEditProductStock(String(p.stock));
                                                        setEditProductImage(p.image || '');
                                                        setEditProductShowInStore(p.show_in_store || false);
                                                    }}
                                                    className="p-2 rounded-lg text-white/40 hover:text-[#39FF14] hover:bg-[#39FF14]/10 transition-all"
                                                    title="Editar produto"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            await addDoc(collection(db, productsCollectionPath), {
                                                                name: `(CÓPIA) ${p.name}`,
                                                                details: p.details || '',
                                                                sale_price: p.sale_price,
                                                                cost_price: p.cost_price,
                                                                stock: p.stock,
                                                                image: p.image || '',
                                                                created_at: new Date().toISOString(),
                                                                user_id: userId,
                                                            });
                                                            toast.success('Produto duplicado!');
                                                        } catch (err) { toast.error('Erro ao duplicar'); }
                                                    }}
                                                    className="p-2 rounded-lg text-white/40 hover:text-blue-400 hover:bg-blue-400/10 transition-all"
                                                    title="Duplicar produto"
                                                >
                                                    <Copy size={16} />
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (confirm(`Excluir ${p.name} do estoque?`)) {
                                                            try {
                                                                await deleteDoc(doc(db, productsCollectionPath, p.id));
                                                                toast.success('Produto excluído!');
                                                            } catch (err) {
                                                                toast.error('Erro ao excluir produto');
                                                            }
                                                        }
                                                    }}
                                                    className="p-2 rounded-lg text-white/40 hover:text-red-500 hover:bg-red-500/10 transition-all"
                                                    title="Excluir produto"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
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
                                <p className="text-white text-sm mt-1">Registro rápido de vendas</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Product Selection List */}
                            <div className="space-y-4 order-2 lg:order-1">
                                <h3 className="text-white text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                    <Plus size={12} className="text-[#39FF14]" /> Produtos do Estoque
                                </h3>
                                <input
                                    type="text"
                                    value={productSearch}
                                    onChange={e => setProductSearch(e.target.value)}
                                    placeholder="Buscar produto..."
                                    className="w-full bg-zinc-950/80 border border-zinc-900 rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600"
                                />
                                <div className="grid grid-cols-1 gap-3 max-h-[600px] overflow-y-auto pr-1">
                                    {products.filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())).map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => addToCart(p)}
                                            disabled={p.stock <= 0}
                                            className="bg-zinc-950 border border-zinc-900 p-4 rounded-2xl flex items-center justify-between hover:border-[#39FF14]/30 transition-all group disabled:opacity-50"
                                        >
                                            <div className="flex items-center gap-3 text-left">
                                                {p.image ? (
                                                    <div className="w-10 h-10 rounded-xl overflow-hidden border border-zinc-800 shrink-0">
                                                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                                                    </div>
                                                ) : null}
                                                <div>
                                                <p className="text-sm font-black text-white group-hover:text-[#39FF14] transition-colors">{p.name}</p>
                                                <p className="text-sm text-white font-bold uppercase">R$ {p.sale_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} • {p.stock} un</p>
                                                </div>
                                            </div>
                                            <Plus size={16} className="text-white group-hover:text-[#39FF14]" />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Cart / Checkout Summary */}
                            <div className="lg:col-span-2 order-1 lg:order-2 bg-zinc-950 border border-zinc-900 rounded-[32px] p-6 h-fit sticky top-24">
                                <h3 className="text-white text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <ShoppingCart size={12} className="text-[#39FF14]" /> Resumo da Venda
                                </h3>

                                <div className="space-y-4 mb-8">
                                    {cart.length === 0 ? (
                                        <p className="text-white text-sm font-bold uppercase text-center py-6">Carrinho vazio</p>
                                    ) : (
                                        cart.map(item => (
                                            <div key={item.id} className="flex justify-between items-center gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-black text-white uppercase truncate">{item.name}</p>
                                                    <p className="text-[13px] text-white font-bold uppercase">R$ {item.sale_price.toLocaleString('pt-BR')} un</p>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        onClick={() => updateCartQuantity(item.id, item.quantity - 1, item.stock, true)}
                                                        className="w-7 h-7 rounded-lg bg-zinc-800 text-white font-black text-sm flex items-center justify-center hover:bg-zinc-700 transition-colors"
                                                    >−</button>
                                                    <input
                                                        type="number"
                                                        value={item.quantity || ''}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            if (val === '') {
                                                                setCart(cart.map(c => c.id === item.id ? { ...c, quantity: 0 } : c));
                                                            } else {
                                                                updateCartQuantity(item.id, parseInt(val), item.stock);
                                                            }
                                                        }}
                                                        onBlur={() => {
                                                            if (item.quantity <= 0) {
                                                                updateCartQuantity(item.id, 1, item.stock);
                                                            }
                                                        }}
                                                        className="w-10 h-7 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-center text-[13px] font-black outline-none focus:border-[#39FF14]"
                                                    />
                                                    <button
                                                        onClick={() => updateCartQuantity(item.id, item.quantity + 1, item.stock, true)}
                                                        className="w-7 h-7 rounded-lg bg-zinc-800 text-white font-black text-sm flex items-center justify-center hover:bg-zinc-700 transition-colors"
                                                    >+</button>
                                                    <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 rounded-lg text-white hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-all">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Dados do Cliente e Produção */}
                                <div className="space-y-3 mb-6 border-b border-zinc-900 pb-6">
                                    <div className="relative">
                                        <label className="block text-sm font-black uppercase tracking-widest text-white mb-1">Cliente</label>
                                        <input type="text" value={saleClient}
                                            onChange={e => { setSaleClient(e.target.value); setShowClientSuggestions(e.target.value.length > 0); }}
                                            onFocus={() => { if (saleClient.length > 0) setShowClientSuggestions(true); }}
                                            onBlur={() => setTimeout(() => setShowClientSuggestions(false), 200)}
                                            placeholder="Nome do cliente..."
                                            className="w-full bg-zinc-950/80 border-transparent rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
                                        {showClientSuggestions && saleClient.length > 1 && (
                                            <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden z-50 shadow-xl max-h-[200px] overflow-y-auto">
                                                {fornecedores.filter(f => f.name.toLowerCase().includes(saleClient.toLowerCase()) || (f.cpf_cnpj && f.cpf_cnpj.includes(saleClient.replace(/\D/g, '')))).map(f => (
                                                    <button key={f.id} type="button"
                                                        onMouseDown={() => {
                                                            setSaleClient(f.name);
                                                            setSaleWhatsapp(f.whatsapp || '');
                                                            setSaleCpfCnpj(f.cpf_cnpj ? formatCpfCnpj(f.cpf_cnpj) : '');
                                                            setShowClientSuggestions(false);
                                                        }}
                                                        className="w-full text-left px-4 py-3 hover:bg-zinc-800 transition-colors">
                                                        <p className="text-sm font-bold text-white">{f.name}</p>
                                                        <p className="text-xs text-white/50">
                                                            {f.cpf_cnpj ? (f.cpf_cnpj.length === 11 ? f.cpf_cnpj.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : f.cpf_cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')) : ''}
                                                            {f.whatsapp && ` • ${f.whatsapp}`}
                                                        </p>
                                                    </button>
                                                ))}
                                                {fornecedores.filter(f => f.name.toLowerCase().includes(saleClient.toLowerCase())).length === 0 && (
                                                    <button type="button"
                                                        onMouseDown={() => {
                                                            setFornecedorName(saleClient.trim());
                                                            setFornecedorType('CLIENTE');
                                                            setFornecedorCpfCnpj('');
                                                            setFornecedorCpfCnpjError('');
                                                            setFornecedorWhatsapp('');
                                                            setEditingFornecedor(null);
                                                            setFornecedorModalOpen(true);
                                                            setShowClientSuggestions(false);
                                                        }}
                                                        className="w-full text-left px-4 py-3 hover:bg-zinc-800 transition-colors border-t border-zinc-800">
                                                        <p className="text-sm font-bold text-[#39FF14]">+ Cadastrar &quot;{saleClient.trim().toUpperCase()}&quot; como cliente</p>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-[11px] font-black uppercase tracking-widest text-white mb-1">WhatsApp</label>
                                            <input type="text" value={saleWhatsapp} onChange={e => setSaleWhatsapp(e.target.value)} placeholder="(00) 00000-0000" className="w-full bg-zinc-950/80 border-transparent rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-black uppercase tracking-widest text-white mb-1">CPF/CNPJ</label>
                                            <input type="text" value={saleCpfCnpj} onChange={e => { const formatted = formatCpfCnpj(e.target.value); setSaleCpfCnpj(formatted); const d = e.target.value.replace(/\D/g, ''); if (d.length === 11 || d.length === 14) setSaleCpfCnpjError(validateCpfCnpj(d) ? '' : 'Inválido'); else setSaleCpfCnpjError(''); }} placeholder="000.000.000-00" className={`w-full bg-zinc-950/80 border-transparent rounded-xl p-3 text-white outline-none focus:ring-1 text-sm font-bold placeholder:text-zinc-600 ${saleCpfCnpjError ? 'ring-1 ring-red-500' : 'focus:ring-[#39FF14]'}`} />
                                            {saleCpfCnpjError && <p className="text-red-500 text-[10px] font-bold mt-0.5">{saleCpfCnpjError}</p>}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest text-white mb-1">Descrição / Grade</label>
                                        <textarea value={saleDescription} onChange={e => setSaleDescription(e.target.value)} placeholder="Detalhes do pedido..." rows={2} className="w-full bg-zinc-950/80 border-transparent rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600 resize-none" />
                                    </div>
                                    {cart.length === 0 && (
                                        <div>
                                            <label className="block text-sm font-black uppercase tracking-widest text-[#39FF14] mb-1">Valor Total (R$)</label>
                                            <input type="text" value={saleManualValue} onChange={e => setSaleManualValue(formatCurrency(e.target.value))} placeholder="0,00" className="w-full bg-zinc-950/80 border-transparent rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-[11px] font-black uppercase tracking-widest text-white mb-1">Prazo de Entrega</label>
                                            <input type="date" value={saleDeadline} onChange={e => setSaleDeadline(e.target.value)} className="w-full bg-zinc-950/80 border-transparent rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold [color-scheme:dark]" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-black uppercase tracking-widest text-white mb-1">Método de Entrega</label>
                                            <select value={saleDeliveryMethod} onChange={e => setSaleDeliveryMethod(e.target.value as any)} className="w-full bg-zinc-950/80 border-transparent rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold appearance-none">
                                                <option value="MOTOBOY">MOTOBOY</option>
                                                <option value="CORREIOS/TRANSPORTADORA">CORREIOS/TRANSPORTADORA</option>
                                                <option value="RETIRADA">RETIRADA</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest text-white mb-1">Endereço de Entrega</label>
                                        <textarea value={saleDeliveryAddress} onChange={e => setSaleDeliveryAddress(e.target.value)} placeholder="Rua, número, bairro, cidade..." rows={2} className="w-full bg-zinc-950/80 border-transparent rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600 resize-none" />
                                    </div>
                                    <label className="flex items-center gap-3 cursor-pointer mt-2 bg-zinc-950/50 rounded-xl p-3">
                                        <input type="checkbox" checked={saleEntersProduction} onChange={e => setSaleEntersProduction(e.target.checked)} className="w-5 h-5 rounded accent-[#39FF14]" />
                                        <span className="text-sm font-black uppercase tracking-widest text-white">Entra em Produção</span>
                                    </label>
                                </div>

                                <div className="space-y-4 mb-6">
                                    <label className="block text-sm font-black uppercase tracking-widest text-[#39FF14] mb-2 font-bold italic">Forma de Pagamento</label>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {['PIX', 'BOLETO', 'CARTÃO CRÉDITO', 'CARTÃO DÉBITO', 'OUTROS'].map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => {
                                                    setPaymentMethod(m as any);
                                                    if (m !== 'CARTÃO CRÉDITO') setInstallments(1);
                                                }}
                                                className={`p-2 rounded-xl border text-[13px] font-black uppercase tracking-widest transition-all ${paymentMethod === m
                                                    ? 'border-[#39FF14] bg-[#39FF14]/10 text-[#39FF14]'
                                                    : 'border-zinc-800 bg-zinc-900/50 text-white hover:border-zinc-700'
                                                    }`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[13px] font-black uppercase tracking-widest mb-1 text-white">
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
                                                <label className="block text-[13px] font-black uppercase tracking-widest mb-1 text-[#39FF14]">
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
                                    {paymentMethod === 'BOLETO' && (
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-[13px] font-black uppercase tracking-widest mb-1 text-[#39FF14]">Qtd. Boletos</label>
                                                <select value={saleBoletoQty} onChange={e => setSaleBoletoQty(parseInt(e.target.value))}
                                                    className="w-full bg-zinc-950/80 border border-zinc-900 rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] transition-all appearance-none text-center text-xs">
                                                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}x</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[13px] font-black uppercase tracking-widest mb-1 text-[#39FF14]">Intervalo</label>
                                                <select value={saleBoletoInterval} onChange={e => setSaleBoletoInterval(parseInt(e.target.value))}
                                                    className="w-full bg-zinc-950/80 border border-zinc-900 rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] transition-all appearance-none text-center text-xs">
                                                    <option value={30}>30 dias</option>
                                                    <option value={60}>60 dias</option>
                                                    <option value={90}>90 dias</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[13px] font-black uppercase tracking-widest mb-1 text-[#39FF14]">1º Vencimento</label>
                                                <input type="date" value={saleBoletoFirstDate} onChange={e => setSaleBoletoFirstDate(e.target.value)}
                                                    className="w-full bg-zinc-950/80 border border-zinc-900 rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] transition-all [color-scheme:dark] text-xs" />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="border-t border-zinc-900 pt-6 mt-6">
                                    <div className="flex justify-between items-end mb-6">
                                        <p className="text-white text-sm font-black uppercase tracking-widest">Total</p>
                                        <p className="text-2xl font-black text-[#39FF14]">R$ {(cart.length > 0 ? cartTotal : parseBRL(saleManualValue)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    <button
                                        onClick={handleCheckout}
                                        disabled={(cart.length === 0 && !saleManualValue) || loading}
                                        className="w-full bg-[#39FF14] text-black py-4 rounded-2xl font-black uppercase text-sm tracking-widest hover:scale-105 transition-all shadow-xl shadow-[#39FF14]/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? 'Processando...' : saleEntersProduction ? 'Cadastrar Venda + Produção' : 'Finalizar Venda'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Histórico de Vendas */}
                        <div className="mt-12 space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-white text-sm font-black uppercase tracking-widest flex items-center gap-2">
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
                                                    .bold-total { color: #111; font-weight: 900; }
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
                                                            <td class="right bold-total">R$ ${sales.reduce((a: number, s: any) => a + (s.total || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                </body></html>`;
                                            const w = window.open('', '_blank');
                                            if (w) { w.document.write(printContent); w.document.close(); w.print(); }
                                        }}
                                        className="text-[13px] font-black uppercase tracking-widest text-white hover:text-[#39FF14] transition-colors flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-800 hover:border-[#39FF14]/50"
                                    >
                                        <FileText size={12} /> Relatório PDF
                                    </button>
                                )}
                            </div>
                            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl md:rounded-[32px] overflow-hidden">
                                {sales.length === 0 ? (
                                    <div className="p-12 text-center text-white font-bold uppercase text-sm tracking-widest italic">Nenhuma venda registrada até o momento</div>
                                ) : (
                                    <div className="divide-y divide-zinc-900">
                                        {sales.map(sale => {
                                            const isExpanded = expandedSaleIds[sale.id];
                                            const hasItems = sale.items && sale.items.length > 0;
                                            const summary = hasItems ? sale.items.map((i: any) => `${i.quantity}x ${i.name}`).join(', ') : (sale.client || sale.description || '');
                                            return (
                                                <div key={sale.id} className="p-4 md:p-6 hover:bg-zinc-900/30 transition-colors">
                                                    <div className="flex justify-between items-start gap-3">
                                                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedSaleIds(prev => prev[sale.id] ? {} : { [sale.id]: true })}>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-sm font-black uppercase tracking-widest text-[#39FF14]">{sale.order_number || sale.sale_number}</span>
                                                                <span className="text-sm text-white/70 font-bold">•</span>
                                                                <span className="text-sm font-bold uppercase tracking-widest text-white">{new Date(sale.created_at).toLocaleDateString('pt-BR')}</span>
                                                                <span className="text-sm font-bold uppercase tracking-widest text-white/70">{sale.payment_method}</span>
                                                            </div>
                                                            {!isExpanded ? (
                                                                <p className="text-[13px] font-bold text-white italic mt-1 line-clamp-1">
                                                                    {summary}
                                                                </p>
                                                            ) : (
                                                                <div className="mt-3 space-y-2">
                                                                    <div className="bg-zinc-900/50 rounded-xl px-3 py-2">
                                                                        <span className="text-[11px] text-white/50 font-bold uppercase">Valor: </span>
                                                                        <span className="text-sm font-bold text-[#39FF14]">R$ {(sale.total || sale.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                                        <span className="text-sm text-white/50 ml-2">• {sale.payment_method}</span>
                                                                        <span className="text-sm text-white/50 ml-2">• {new Date(sale.created_at).toLocaleDateString('pt-BR')}</span>
                                                                    </div>
                                                                    {sale.client && (
                                                                        <div className="bg-zinc-900/50 rounded-xl px-3 py-2">
                                                                            <span className="text-[11px] text-white/50 font-bold uppercase">Cliente: </span>
                                                                            <span className="text-sm font-bold text-white uppercase">{sale.client}</span>
                                                                            {sale.client_whatsapp && <span className="text-sm text-white/50 ml-2">• {sale.client_whatsapp}</span>}
                                                                            {sale.cpf_cnpj && <span className="text-sm text-white/50 ml-2">• {sale.cpf_cnpj.length === 11 ? sale.cpf_cnpj.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : sale.cpf_cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}</span>}
                                                                        </div>
                                                                    )}
                                                                    {sale.description && (
                                                                        <div className="bg-zinc-900/50 rounded-xl px-3 py-2">
                                                                            <span className="text-[11px] text-white/50 font-bold uppercase">Descrição: </span>
                                                                            <span className="text-sm font-bold text-white">{sale.description}</span>
                                                                        </div>
                                                                    )}
                                                                    {sale.deadline && (
                                                                        <div className="bg-zinc-900/50 rounded-xl px-3 py-2">
                                                                            <span className="text-[11px] text-white/50 font-bold uppercase">Entrega: </span>
                                                                            <span className="text-sm font-bold text-white">{sale.deadline.split('-').reverse().join('/')}</span>
                                                                            {sale.delivery_method && <span className="text-sm text-white/50 ml-2">• {sale.delivery_method}</span>}
                                                                        </div>
                                                                    )}
                                                                    {(sale.has_production || sale.status) && (
                                                                        <div className="bg-[#39FF14]/10 rounded-xl px-3 py-2">
                                                                            <span className="text-sm font-bold text-[#39FF14] uppercase">Em Produção • {sale.status || 'AGUARDANDO APROVAÇÃO'}</span>
                                                                        </div>
                                                                    )}
                                                                    {hasItems && sale.items.map((item: any, idx: number) => (
                                                                        <div key={idx} className="flex flex-wrap justify-between text-[13px] bg-zinc-900/50 rounded-xl px-3 py-2 gap-x-4">
                                                                            <span className="font-bold text-white">{item.quantity}x {item.name}</span>
                                                                            <span className="font-bold text-white/70 ml-auto">R$ {((item.sale_price || item.price || 0) * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <p className="text-[13px] text-white/70 mt-1">
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
                                <p className="text-white text-[13px] md:text-sm mt-0.5">Gestão de contas a pagar e a receber</p>
                            </div>
                            {(financeView === 'A PAGAR' || financeView === 'A RECEBER') && (
                                <button
                                    onClick={() => setIsFinanceModalOpen(true)}
                                    className="bg-[#39FF14] text-black px-4 md:px-6 py-2.5 md:py-3 rounded-2xl font-black uppercase text-[13px] md:text-sm tracking-widest hover:scale-105 transition-all shadow-lg shadow-[#39FF14]/20 flex items-center gap-1.5 shrink-0"
                                >
                                    <Plus size={14} /> Nova Conta
                                </button>
                            )}
                        </div>

                        {/* Toggle Financeiro */}
                        <div className="flex gap-1 p-1 bg-zinc-950 rounded-2xl overflow-x-auto">
                            <button
                                onClick={() => setFinanceView('A PAGAR')}
                                className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-1.5 shrink-0 ${financeView === 'A PAGAR' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-white hover:text-white'}`}
                            >
                                <ArrowDownLeft size={12} /> A Pagar
                            </button>
                            <button
                                onClick={() => setFinanceView('PAGAS')}
                                className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-1.5 shrink-0 ${financeView === 'PAGAS' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-white hover:text-white'}`}
                            >
                                <Check size={12} /> Pagas
                            </button>
                            <button
                                onClick={() => setFinanceView('A RECEBER')}
                                className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-1.5 shrink-0 ${financeView === 'A RECEBER' ? 'bg-[#39FF14] text-black shadow-lg shadow-[#39FF14]/20' : 'text-white hover:text-white'}`}
                            >
                                <ArrowUpRight size={12} /> A Receber
                            </button>
                            <button
                                onClick={() => setFinanceView('RECEBIDAS')}
                                className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-1.5 shrink-0 ${financeView === 'RECEBIDAS' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-white hover:text-white'}`}
                            >
                                <Check size={12} /> Recebidas
                            </button>
                        </div>

                        {/* Cards resumo */}
                        {(financeView === 'A PAGAR' || financeView === 'A RECEBER') && (
                        <div className="grid grid-cols-3 gap-2 md:gap-4">
                            {financeView === 'A PAGAR' ? (
                                <>
                                    <div className="bg-zinc-950 p-3 md:p-6 rounded-2xl md:rounded-[32px] border border-zinc-900">
                                        <p className="text-white text-sm md:text-sm font-black uppercase tracking-widest mb-0.5">Total a Pagar</p>
                                        <p className="text-lg md:text-3xl font-black text-red-500 tabular-nums">
                                            R$ {financialItems.filter(i => i.type === 'OUTFLOW' && (i.status === 'A PAGAR' || i.status === 'ATRASADO')).reduce((a: number, i: any) => a + i.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="bg-zinc-950 p-3 md:p-6 rounded-2xl md:rounded-[32px] border border-zinc-900">
                                        <p className="text-white text-sm md:text-sm font-black uppercase tracking-widest mb-0.5">Atrasadas</p>
                                        <p className="text-lg md:text-3xl font-black text-orange-500 tabular-nums">
                                            {financialItems.filter(i => i.type === 'OUTFLOW' && i.status === 'ATRASADO').length}
                                        </p>
                                    </div>
                                    <div className="bg-zinc-950 p-3 md:p-6 rounded-2xl md:rounded-[32px] border border-zinc-900">
                                        <p className="text-white text-sm md:text-sm font-black uppercase tracking-widest mb-0.5">Pagas este mês</p>
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
                                        <p className="text-white text-sm md:text-sm font-black uppercase tracking-widest mb-0.5">Total a Receber</p>
                                        <p className="text-lg md:text-3xl font-black text-[#39FF14] tabular-nums">
                                            R$ {financialItems.filter(i => i.type === 'INFLOW' && (i.status === 'A RECEBER' || i.status === 'PENDENTE' || i.status === 'ATRASADO')).reduce((a: number, i: any) => a + i.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="bg-zinc-950 p-3 md:p-6 rounded-2xl md:rounded-[32px] border border-zinc-900">
                                        <p className="text-white text-sm md:text-sm font-black uppercase tracking-widest mb-0.5">Atrasadas</p>
                                        <p className="text-lg md:text-3xl font-black text-orange-500 tabular-nums">
                                            {financialItems.filter(i => i.type === 'INFLOW' && i.status === 'ATRASADO').length}
                                        </p>
                                    </div>
                                    <div className="bg-zinc-950 p-3 md:p-6 rounded-2xl md:rounded-[32px] border border-zinc-900">
                                        <p className="text-white text-sm md:text-sm font-black uppercase tracking-widest mb-0.5">Recebidas este mês</p>
                                        <p className="text-lg md:text-3xl font-black text-[#39FF14] tabular-nums">
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
                        )}

                        {/* Lista de contas */}
                        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl md:rounded-[32px] overflow-hidden">
                            <div className="p-4 md:p-6 border-b border-zinc-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                <h3 className="text-white text-[13px] md:text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                    {financeView === 'A PAGAR' && <><ArrowDownLeft size={11} /> Contas a Pagar</>}
                                    {financeView === 'A RECEBER' && <><ArrowUpRight size={11} /> Contas a Receber</>}
                                    {financeView === 'PAGAS' && <><Check size={11} /> Contas Pagas</>}
                                    {financeView === 'RECEBIDAS' && <><Check size={11} /> Contas Recebidas</>}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="date"
                                            value={financeDateFrom}
                                            onChange={e => setFinanceDateFrom(e.target.value)}
                                            className="bg-zinc-900 text-sm font-bold px-3 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] transition-colors"
                                        />
                                        <span className="text-white/50 text-xs font-bold">até</span>
                                        <input
                                            type="date"
                                            value={financeDateTo}
                                            onChange={e => setFinanceDateTo(e.target.value)}
                                            className="bg-zinc-900 text-sm font-bold px-3 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] transition-colors"
                                        />
                                        {(financeDateFrom || financeDateTo) && (
                                            <button
                                                onClick={() => { setFinanceDateFrom(''); setFinanceDateTo(''); }}
                                                className="text-white/50 hover:text-white transition-colors p-1"
                                                title="Limpar filtro"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowPdfMenu(!showPdfMenu)}
                                            className="bg-zinc-900 text-sm font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-zinc-800 text-white hover:border-[#39FF14] transition-colors flex items-center gap-1.5"
                                        >
                                            <FileText size={12} /> PDF
                                        </button>
                                        {showPdfMenu && (
                                            <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden z-50 shadow-xl min-w-[160px]">
                                                <button onClick={() => {
                                                    const items = financialItems.filter(item => {
                                                        if (financeView === 'A PAGAR') return item.type === 'OUTFLOW' && item.status !== 'PAGO';
                                                        if (financeView === 'A RECEBER') return item.type === 'INFLOW' && item.status !== 'RECEBIDO';
                                                        if (financeView === 'PAGAS') return item.type === 'OUTFLOW' && item.status === 'PAGO';
                                                        return item.type === 'INFLOW' && (item.status === 'RECEBIDO' || item.status === 'PAGO');
                                                    });
                                                    const titles: Record<string, string> = { 'A PAGAR': 'Contas_a_Pagar', 'A RECEBER': 'Contas_a_Receber', 'PAGAS': 'Contas_Pagas', 'RECEBIDAS': 'Contas_Recebidas' };
                                                    generateFinancePDF(items, titles[financeView], 'simples');
                                                    setShowPdfMenu(false);
                                                }} className="w-full text-left px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800 transition-colors">Relatório Simples</button>
                                                <button onClick={() => {
                                                    const items = financialItems.filter(item => {
                                                        if (financeView === 'A PAGAR') return item.type === 'OUTFLOW' && item.status !== 'PAGO';
                                                        if (financeView === 'A RECEBER') return item.type === 'INFLOW' && item.status !== 'RECEBIDO';
                                                        if (financeView === 'PAGAS') return item.type === 'OUTFLOW' && item.status === 'PAGO';
                                                        return item.type === 'INFLOW' && (item.status === 'RECEBIDO' || item.status === 'PAGO');
                                                    });
                                                    const titles: Record<string, string> = { 'A PAGAR': 'Contas_a_Pagar', 'A RECEBER': 'Contas_a_Receber', 'PAGAS': 'Contas_Pagas', 'RECEBIDAS': 'Contas_Recebidas' };
                                                    generateFinancePDF(items, titles[financeView], 'completo');
                                                    setShowPdfMenu(false);
                                                }} className="w-full text-left px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800 transition-colors">Relatório Completo</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="px-4 md:px-6 pb-3">
                                <input
                                    type="text"
                                    value={financeSearchTerm}
                                    onChange={e => setFinanceSearchTerm(e.target.value)}
                                    placeholder="Buscar por fornecedor, descrição..."
                                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-[#39FF14] transition-colors text-sm font-bold placeholder:text-zinc-600"
                                />
                            </div>

                            <div className="divide-y divide-zinc-900">
                                {(() => {
                                    const filtered = financialItems.filter(item => {
                                        if (financeView === 'A PAGAR') {
                                            if (item.type !== 'OUTFLOW' || item.status === 'PAGO') return false;
                                        } else if (financeView === 'A RECEBER') {
                                            if (item.type !== 'INFLOW' || item.status === 'RECEBIDO') return false;
                                        } else if (financeView === 'PAGAS') {
                                            if (item.type !== 'OUTFLOW' || item.status !== 'PAGO') return false;
                                        } else if (financeView === 'RECEBIDAS') {
                                            if (item.type !== 'INFLOW' || (item.status !== 'RECEBIDO' && item.status !== 'PAGO')) return false;
                                        }
                                        const dateStr = (financeView === 'PAGAS' || financeView === 'RECEBIDAS')
                                            ? (item.paid_at || item.due_date || item.transaction_date || item.created_at)
                                            : (item.due_date || item.transaction_date || item.created_at);
                                        const datePart = dateStr.split('T')[0];
                                        if (financeDateFrom && datePart < financeDateFrom) return false;
                                        if (financeDateTo && datePart > financeDateTo) return false;
                                        return true;
                                    }).filter(item => {
                                        if (!financeSearchTerm) return true;
                                        const search = financeSearchTerm.toLowerCase();
                                        return (item.description || '').toLowerCase().includes(search) ||
                                            (item.supplier_name || '').toLowerCase().includes(search) ||
                                            (item.payment_method || '').toLowerCase().includes(search);
                                    }).sort((a: any, b: any) => {
                                        if (financeView === 'PAGAS' || financeView === 'RECEBIDAS') {
                                            const dateA = new Date(a.paid_at || a.created_at).getTime();
                                            const dateB = new Date(b.paid_at || b.created_at).getTime();
                                            return dateB - dateA;
                                        }
                                        // Ordenar por vencimento (mais antigo primeiro)
                                        const dateA = new Date(a.due_date || a.transaction_date || a.created_at).getTime();
                                        const dateB = new Date(b.due_date || b.transaction_date || b.created_at).getTime();
                                        return dateA - dateB;
                                    });

                                    if (filtered.length === 0) {
                                        return <div className="p-12 text-center text-white font-bold uppercase text-sm tracking-widest italic">Nenhuma conta no período</div>;
                                    }

                                    return filtered.map(item => (
                                        <div key={item.id} className="p-4 md:p-6 hover:bg-zinc-900/50 transition-colors" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'start'}}>
                                            <div style={{minWidth: 0}}>
                                                <div className="flex items-start gap-3">
                                                    <div className={`p-2 md:p-3 rounded-xl md:rounded-2xl shrink-0 mt-0.5 ${item.type === 'INFLOW' ? 'bg-[#39FF14]/10 text-[#39FF14]' : 'bg-red-500/10 text-red-500'}`}>
                                                        {item.type === 'INFLOW' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                                                    </div>
                                                    <div style={{minWidth: 0}}>
                                                        <p className="text-base font-black text-white uppercase" style={{wordBreak: 'break-all'}}>{item.description}</p>
                                                        {item.supplier_name && <p className="text-sm font-bold text-[#39FF14]/70 uppercase mt-0.5">{item.supplier_name}</p>}
                                                        <p className="text-sm text-white font-semibold uppercase mt-0.5">
                                                            Venc: {((item.due_date || item.transaction_date || item.created_at) || '').split('T')[0].split('-').reverse().join('/')}
                                                            {item.payment_method && <span className="ml-1.5 text-white/70">• {item.payment_method}</span>}
                                                        </p>
                                                        {item.observations && <p className="text-sm text-white/70 italic mt-0.5" style={{wordBreak: 'break-all'}}>{item.observations}</p>}
                                                        <p className="text-[11px] text-white/40 mt-1">
                                                            {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(item.created_at).toLocaleTimeString('pt-BR') : ''}
                                                            {item.operator_name ? ` • ${item.operator_name}` : ''}
                                                        </p>
                                                        {/* Anexo */}
                                                        <div className="flex items-center gap-2 mt-1.5">
                                                            {item.attachment ? (
                                                                <button onClick={() => {
                                                                    if (item.attachment.startsWith('data:image')) {
                                                                        const w = window.open(''); if (w) { w.document.write(`<img src="${item.attachment}" style="max-width:100%">`); w.document.close(); }
                                                                    } else if (item.attachment.startsWith('data:application/pdf')) {
                                                                        const w = window.open(''); if (w) { w.document.write(`<iframe src="${item.attachment}" style="width:100%;height:100vh;border:none"></iframe>`); w.document.close(); }
                                                                    }
                                                                }} className="text-[11px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                                                    <Paperclip size={10} /> Ver anexo
                                                                </button>
                                                            ) : (
                                                                (financeView === 'A PAGAR' || financeView === 'PAGAS') && (
                                                                    <label className="text-[11px] font-bold text-white/30 hover:text-white/60 flex items-center gap-1 cursor-pointer">
                                                                        <Paperclip size={10} /> Anexar
                                                                        <input type="file" accept="image/*,.pdf" className="hidden" onChange={async (e) => {
                                                                            const file = e.target.files?.[0];
                                                                            if (!file) return;
                                                                            if (file.size > 500000) { toast.error('Arquivo muito grande (máx 500KB)'); return; }
                                                                            const reader = new FileReader();
                                                                            reader.onload = async () => {
                                                                                try {
                                                                                    await updateDoc(doc(db, financeCollectionPath, item.id), { attachment: reader.result as string });
                                                                                    toast.success('Anexo salvo!');
                                                                                } catch (err) { toast.error('Erro ao salvar anexo'); }
                                                                            };
                                                                            reader.readAsDataURL(file);
                                                                        }} />
                                                                    </label>
                                                                )
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-2" style={{whiteSpace: 'nowrap'}}>
                                                <p className={`text-base md:text-lg font-black ${item.type === 'INFLOW' ? 'text-[#39FF14]' : 'text-red-500'}`}>
                                                    {item.type === 'INFLOW' ? '+' : '-'} R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                                <div className="flex items-center gap-1.5">
                                                    {item.status === 'PAGO' || item.status === 'RECEBIDO' ? (
                                                        <label className="text-sm font-black uppercase px-3 py-1 rounded-full bg-green-500/20 text-green-400 cursor-pointer hover:bg-green-500/30 transition-colors flex items-center gap-1">
                                                            {item.status} em {item.paid_at ? new Date(item.paid_at).toLocaleDateString('pt-BR') : ''}
                                                            <input type="date" className="opacity-0 absolute w-0 h-0" value={item.paid_at ? item.paid_at.split('T')[0] : ''} onChange={async (e) => {
                                                                if (e.target.value) {
                                                                    try {
                                                                        await updateDoc(doc(db, financeCollectionPath, item.id), { paid_at: new Date(e.target.value + 'T12:00:00').toISOString() });
                                                                        toast.success('Data de pagamento atualizada!');
                                                                    } catch (err) { toast.error('Erro ao atualizar data'); }
                                                                }
                                                            }} />
                                                        </label>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => handleUpdateFinanceEntry(item.id, {
                                                                    status: item.type === 'OUTFLOW' ? 'PAGO' : 'RECEBIDO',
                                                                    paid_at: new Date().toISOString()
                                                                })}
                                                                className={`text-sm font-black uppercase px-3 py-1 rounded-full transition-all hover:scale-105 ${item.type === 'OUTFLOW' ? 'bg-green-500 text-black' : 'bg-[#39FF14] text-black'}`}
                                                            >
                                                                {item.type === 'OUTFLOW' ? 'PAGO' : 'RECEBIDO'}
                                                            </button>
                                                        </>
                                                    )}
                                                    {item.order_id && (
                                                    <button onClick={() => {
                                                        const sale = sales.find((s: any) => s.id === item.order_id);
                                                        if (sale) {
                                                            const items = sale.items && sale.items.length > 0
                                                                ? sale.items.map((i: any) => `${i.quantity}x ${i.name}`).join('\n')
                                                                : sale.description || 'Sem descrição';
                                                            alert(`${sale.order_number || ''} - ${sale.client || ''}\n\n${items}`);
                                                        } else {
                                                            alert('Pedido não encontrado');
                                                        }
                                                    }} className="text-white/70 hover:text-[#39FF14] transition-colors p-3" title="Ver produtos do pedido">
                                                        <Eye size={22} />
                                                    </button>
                                                    )}
                                                    {item.source !== 'GASTO_DO_DIA' && (
                                                    <button onClick={() => {
                                                        setEditingFinanceItem({
                                                            ...item,
                                                            editDesc: item.description,
                                                            editAmount: item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                                                            editDueDate: (item.due_date || item.transaction_date || item.created_at).split('T')[0],
                                                            editPayMethod: item.payment_method || 'PIX',
                                                            editObs: item.observations || '',
                                                        });
                                                    }} className="text-white/70 hover:text-[#39FF14] transition-colors p-3" title="Editar conta">
                                                        <Pencil size={22} />
                                                    </button>
                                                    )}
                                                    <button onClick={async () => {
                                                        try {
                                                            await deleteDoc(doc(db, financeCollectionPath, item.id));
                                                            toast.success('Conta excluída!');
                                                        } catch (err) {
                                                            console.error('Erro ao excluir:', err);
                                                            toast.error('Erro ao excluir conta');
                                                        }
                                                    }} className="text-white/70 hover:text-red-500 transition-colors p-3" title="Excluir conta">
                                                    <Trash2 size={22} />
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

                {/* Fornecedores - dentro do Financeiro */}
                {activeTab === 'FINANCEIRO' && (
                    <div className="max-w-5xl mx-auto px-4 md:px-6 mt-6">
                        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl md:rounded-[32px] overflow-hidden">
                            <div className="p-4 md:p-6 border-b border-zinc-900 flex justify-between items-center">
                                <h3 className="text-white text-[13px] md:text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                    Fornecedores / Clientes
                                </h3>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={fornecedorSearch}
                                        onChange={e => setFornecedorSearch(e.target.value)}
                                        placeholder="Buscar..."
                                        className="bg-zinc-900 text-sm px-4 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] transition-colors w-40"
                                    />
                                    <button
                                        onClick={() => { setEditingFornecedor(null); setFornecedorName(''); setFornecedorCpfCnpj(''); setFornecedorCpfCnpjError(''); setFornecedorWhatsapp(''); setFornecedorType('CLIENTE'); setFornecedorStartDate(''); setFornecedorModalOpen(true); }}
                                        className="bg-[#39FF14] text-black px-4 py-2 rounded-xl font-black uppercase text-xs tracking-widest hover:scale-105 transition-all flex items-center gap-1.5 shrink-0"
                                    >
                                        <Plus size={12} /> Novo
                                    </button>
                                </div>
                            </div>
                            <div className="divide-y divide-zinc-900 max-h-[400px] overflow-y-auto">
                                {fornecedores.filter(f => !fornecedorSearch || f.name.toLowerCase().includes(fornecedorSearch.toLowerCase())).length === 0 ? (
                                    <div className="p-8 text-center text-white font-bold uppercase text-sm tracking-widest italic">Nenhum fornecedor cadastrado</div>
                                ) : (
                                    fornecedores.filter(f => !fornecedorSearch || f.name.toLowerCase().includes(fornecedorSearch.toLowerCase())).map(f => (
                                        <div key={f.id} className="p-4 flex items-center justify-between hover:bg-zinc-900/50 transition-colors">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-black text-white uppercase">{f.name}</p>
                                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${f.type === 'FORNECEDOR' ? 'bg-red-500/20 text-red-400' : f.type === 'FUNCIONÁRIO' ? 'bg-blue-500/20 text-blue-400' : 'bg-[#39FF14]/20 text-[#39FF14]'}`}>{f.type === 'FORNECEDOR' ? 'Fornecedor' : f.type === 'FUNCIONÁRIO' ? 'Funcionário' : 'Cliente'}</span>
                                                </div>
                                                <p className="text-xs text-white/70">
                                                    {f.cpf_cnpj ? (f.cpf_cnpj.length === 11 ? f.cpf_cnpj.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : f.cpf_cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')) : 'Sem CPF/CNPJ'}
                                                    {f.whatsapp && ` • ${f.whatsapp}`}
                                                    {f.start_date && ` • Início: ${f.start_date.split('-').reverse().join('/')}`}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => { setEditingFornecedor(f); setFornecedorName(f.name); setFornecedorCpfCnpj(f.cpf_cnpj ? formatCpfCnpj(f.cpf_cnpj) : ''); setFornecedorWhatsapp(f.whatsapp || ''); setFornecedorType(f.type || 'CLIENTE'); setFornecedorStartDate(f.start_date || ''); setFornecedorModalOpen(true); }} className="text-white/70 hover:text-[#39FF14] transition-colors p-2"><Pencil size={14} /></button>
                                                <button onClick={() => handleDeleteFornecedor(f.id)} className="text-white/70 hover:text-red-500 transition-colors p-2"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal Gastos do Dia */}
                {showGastoModal && (
                    <div className="fixed inset-0 bg-black/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl">
                        <div className="bg-zinc-900 w-full max-w-md p-8 rounded-[32px] border border-zinc-800 shadow-2xl relative text-white">
                            <button onClick={() => setShowGastoModal(false)} className="absolute right-6 top-6 text-white hover:text-white transition-colors"><X size={24} /></button>
                            <h3 className="text-2xl font-black italic uppercase text-red-500 mb-1 flex items-center gap-2"><DollarSign size={24} /> Gastos do Dia</h3>
                            <p className="text-white/70 text-sm mb-6">Registre uma saída rápida do caixa</p>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2">Descrição</label>
                                    <input type="text" value={gastoDesc} onChange={e => setGastoDesc(e.target.value)} placeholder="Ex: Almoço, Gasolina, Material..."
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-red-500 font-bold placeholder:text-zinc-600" />
                                </div>
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2">Valor (R$)</label>
                                    <input type="text" value={gastoAmount} onChange={e => setGastoAmount(formatCurrency(e.target.value))} placeholder="0,00"
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-red-500 font-bold placeholder:text-zinc-600" />
                                </div>
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2">Forma de Pagamento</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['PIX', 'DINHEIRO', 'CARTÃO'].map(m => (
                                            <button key={m} type="button" onClick={() => setGastoPayMethod(m)}
                                                className={`py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${gastoPayMethod === m ? 'bg-red-500 text-white' : 'bg-zinc-950 text-white border border-zinc-800 hover:border-zinc-700'}`}>
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button
                                    onClick={async () => {
                                        if (!gastoDesc.trim()) { toast.error('Informe a descrição'); return; }
                                        const amount = parseBRL(gastoAmount);
                                        if (amount <= 0) { toast.error('Informe o valor'); return; }
                                        try {
                                            const today = new Date().toISOString();
                                            const gastoRef = await addDoc(collection(db, financeCollectionPath), {
                                                type: 'OUTFLOW',
                                                amount: amount,
                                                description: gastoDesc.trim().toUpperCase(),
                                                payment_method: gastoPayMethod,
                                                status: 'PAGO',
                                                paid_at: today,
                                                created_at: today,
                                                transaction_date: today,
                                                due_date: today,
                                                user_id: userId,
                                                operator_name: operatorName,
                                                source: 'GASTO_DO_DIA',
                                            });
                                            console.log('Gasto salvo com ID:', gastoRef.id);
                                            toast.success('Gasto registrado! Veja em Financeiro > Pagas');
                                            setShowGastoModal(false);
                                            setGastoDesc(''); setGastoAmount(''); setGastoPayMethod('PIX');
                                        } catch (err) { console.error(err); toast.error('Erro ao registrar gasto'); }
                                    }}
                                    className="w-full bg-red-500 text-white py-4 rounded-2xl font-black uppercase text-sm tracking-widest hover:scale-[1.02] transition-all"
                                >
                                    Registrar Gasto
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal Ver Pendência */}
                {pendingViewOrder && (
                    <div className="fixed inset-0 bg-black/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl">
                        <div className="bg-zinc-900 w-full max-w-lg p-8 rounded-[32px] border border-red-500/30 shadow-2xl relative text-white">
                            <button onClick={() => setPendingViewOrder(null)} className="absolute right-6 top-6 text-white hover:text-white transition-colors"><X size={24} /></button>
                            <div className="text-center mb-6">
                                <AlertCircle size={48} className="text-[#FF3D00] mx-auto mb-3" />
                                <h3 className="text-2xl font-black italic uppercase text-[#FF3D00]">Pendência</h3>
                                <p className="text-white/70 text-sm mt-1">{pendingViewOrder.order_number} — {pendingViewOrder.client || 'Sem cliente'}</p>
                            </div>
                            <div className="bg-zinc-950 rounded-xl p-5 mb-6">
                                <p className="text-xs text-white/50 font-bold uppercase mb-2">Motivo da Pendência</p>
                                <p className="text-base text-white font-medium leading-relaxed">{pendingViewOrder.pending_reason || 'Sem descrição informada'}</p>
                            </div>
                            <button
                                onClick={() => {
                                    advanceStep(pendingViewOrder.id, pendingViewOrder.status);
                                    setPendingViewOrder(null);
                                }}
                                className="w-full bg-[#39FF14] text-black py-4 rounded-2xl font-black uppercase text-sm tracking-widest hover:scale-[1.02] transition-all"
                            >
                                Resolver Pendência
                            </button>
                        </div>
                    </div>
                )}

                {/* Modal Lembrete Contas a Pagar */}
                {showPaymentReminder && (
                    <div className="fixed inset-0 bg-black/95 z-[700] flex items-center justify-center p-4 backdrop-blur-xl">
                        <div className="bg-zinc-900 w-full max-w-lg p-8 rounded-[32px] border border-red-500/30 shadow-2xl relative text-white max-h-[80vh] overflow-y-auto">
                            <div className="text-center mb-6">
                                <AlertCircle size={48} className="text-red-500 mx-auto mb-3" />
                                <h3 className="text-2xl font-black italic uppercase text-red-500">Atenção!</h3>
                                <p className="text-white/70 text-sm mt-2">Você tem <strong className="text-white">{reminderItems.length}</strong> conta{reminderItems.length !== 1 ? 's' : ''} a pagar vencendo hoje ou atrasada{reminderItems.length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="space-y-3 mb-6">
                                {reminderItems.map(item => (
                                    <div key={item.id} className="bg-zinc-950 rounded-xl p-4 border border-zinc-800">
                                        <div className="flex justify-between items-start">
                                            <p className="text-sm font-black text-white uppercase" style={{wordBreak: 'break-all'}}>{item.description}</p>
                                            <p className="text-sm font-black text-red-500 shrink-0 ml-2">
                                                R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                        <p className="text-xs text-white/70 mt-1">
                                            Venc: {((item.due_date || item.created_at) || '').split('T')[0].split('-').reverse().join('/')}
                                            {item.status === 'ATRASADO' && <span className="ml-2 text-red-400 font-bold">ATRASADA</span>}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-black text-red-500 mb-4">
                                    Total: R$ {reminderItems.reduce((a: number, i: any) => a + i.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                                <button
                                    onClick={() => setShowPaymentReminder(false)}
                                    className="bg-[#39FF14] text-black px-8 py-4 rounded-2xl font-black uppercase text-sm tracking-widest hover:scale-105 transition-all"
                                >
                                    Entendi
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal Fornecedor */}
                {fornecedorModalOpen && (
                    <div className="fixed inset-0 bg-black/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl">
                        <div className="bg-zinc-900 w-full max-w-md p-8 rounded-[32px] border border-zinc-800 shadow-2xl relative text-white">
                            <button onClick={() => setFornecedorModalOpen(false)} className="absolute right-6 top-6 text-white hover:text-white transition-colors"><X size={24} /></button>
                            <h3 className="text-2xl font-black italic uppercase text-[#39FF14] mb-6">{editingFornecedor ? 'Editar' : 'Novo'} {fornecedorType === 'CLIENTE' ? 'Cliente' : fornecedorType === 'FORNECEDOR' ? 'Fornecedor' : 'Funcionário'}</h3>
                            <div className="space-y-4">
                                <div className="flex gap-2 p-1 bg-zinc-950 rounded-xl">
                                    <button type="button" onClick={() => setFornecedorType('CLIENTE')}
                                        className={`flex-1 py-2.5 rounded-lg font-black uppercase text-xs tracking-widest transition-all ${fornecedorType === 'CLIENTE' ? 'bg-[#39FF14] text-black' : 'text-white'}`}>
                                        Cliente
                                    </button>
                                    <button type="button" onClick={() => setFornecedorType('FORNECEDOR')}
                                        className={`flex-1 py-2.5 rounded-lg font-black uppercase text-xs tracking-widest transition-all ${fornecedorType === 'FORNECEDOR' ? 'bg-red-500 text-white' : 'text-white'}`}>
                                        Fornecedor
                                    </button>
                                    <button type="button" onClick={() => setFornecedorType('FUNCIONÁRIO')}
                                        className={`flex-1 py-2.5 rounded-lg font-black uppercase text-xs tracking-widest transition-all ${fornecedorType === 'FUNCIONÁRIO' ? 'bg-blue-500 text-white' : 'text-white'}`}>
                                        Funcionário
                                    </button>
                                </div>
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2">Nome</label>
                                    <input type="text" value={fornecedorName} onChange={e => setFornecedorName(e.target.value)} placeholder={fornecedorType === 'CLIENTE' ? 'Nome do cliente...' : fornecedorType === 'FORNECEDOR' ? 'Nome do fornecedor...' : 'Nome do funcionário...'} className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14]" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2">CPF/CNPJ</label>
                                    <input type="text" value={fornecedorCpfCnpj} onChange={e => handleFornecedorCpfCnpjChange(e.target.value)} placeholder="000.000.000-00" className={`w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 ${fornecedorCpfCnpjError ? 'ring-1 ring-red-500' : 'focus:ring-[#39FF14]'}`} />
                                    {fornecedorCpfCnpjError && <p className="text-red-500 text-xs font-bold mt-1">{fornecedorCpfCnpjError}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2">WhatsApp</label>
                                    <input type="text" value={fornecedorWhatsapp} onChange={e => setFornecedorWhatsapp(e.target.value)} placeholder="(00) 00000-0000" className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14]" />
                                </div>
                                {fornecedorType === 'FUNCIONÁRIO' && (
                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2">Início na Empresa</label>
                                        <input type="date" value={fornecedorStartDate} onChange={e => setFornecedorStartDate(e.target.value)}
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] [color-scheme:dark]" />
                                    </div>
                                )}
                                <button onClick={handleSaveFornecedor} className="w-full bg-[#39FF14] text-black py-4 rounded-2xl font-black uppercase text-sm tracking-widest hover:scale-[1.02] transition-all">
                                    {editingFornecedor ? 'Atualizar' : 'Cadastrar'}
                                </button>
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
                                className="absolute right-6 top-6 text-white hover:text-white transition-colors"
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

                                    // Se é parcela, atualizar datas das parcelas subsequentes
                                    const parcelaMatch = editingFinanceItem.editDesc.match(/\((\d+)\/(\d+)\)/);
                                    if (parcelaMatch) {
                                        const currentParcela = parseInt(parcelaMatch[1]);
                                        const totalParcelas = parseInt(parcelaMatch[2]);
                                        const baseDesc = editingFinanceItem.editDesc.replace(/\(\d+\/\d+\)/, '').trim().toUpperCase();
                                        const [baseYear, baseMonth, baseDay] = editingFinanceItem.editDueDate.split('-').map(Number);

                                        for (let i = currentParcela + 1; i <= totalParcelas; i++) {
                                            const nextDate = new Date(baseYear, baseMonth - 1 + (i - currentParcela), baseDay);
                                            const yy = nextDate.getFullYear();
                                            const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
                                            const dd = String(nextDate.getDate()).padStart(2, '0');
                                            const nextDateStr = `${yy}-${mm}-${dd}`;
                                            const sibling = financialItems.find((fi: any) =>
                                                fi.description && fi.description.toUpperCase().includes(baseDesc) &&
                                                fi.description.includes(`(${i}/${totalParcelas})`)
                                            );
                                            if (sibling) {
                                                await updateDoc(doc(db, financeCollectionPath, sibling.id), {
                                                    due_date: nextDateStr,
                                                });
                                            }
                                        }
                                    }

                                    toast.success('Conta atualizada!');
                                    setEditingFinanceItem(null);
                                } catch (err) {
                                    toast.error('Erro ao atualizar');
                                }
                            }} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Descrição</label>
                                    <input
                                        type="text"
                                        value={editingFinanceItem.editDesc}
                                        onChange={e => setEditingFinanceItem({ ...editingFinanceItem, editDesc: e.target.value })}
                                        required
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Valor (R$)</label>
                                    <input
                                        type="text"
                                        value={editingFinanceItem.editAmount}
                                        onChange={e => setEditingFinanceItem({ ...editingFinanceItem, editAmount: formatCurrency(e.target.value) })}
                                        required
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Data de Vencimento</label>
                                    <input
                                        type="date"
                                        value={editingFinanceItem.editDueDate}
                                        onChange={e => setEditingFinanceItem({ ...editingFinanceItem, editDueDate: e.target.value })}
                                        required
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold [color-scheme:dark]"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Forma de Pagamento</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['PIX', 'BOLETO', 'CARTÃO CRÉDITO', 'CARTÃO DÉBITO', 'OUTRO'].map(pm => (
                                            <button
                                                key={pm}
                                                type="button"
                                                onClick={() => setEditingFinanceItem({ ...editingFinanceItem, editPayMethod: pm })}
                                                className={`px-4 py-3 rounded-xl font-black uppercase text-sm tracking-widest transition-all ${editingFinanceItem.editPayMethod === pm ? 'bg-[#39FF14] text-black shadow-lg shadow-[#39FF14]/20' : 'bg-zinc-950 text-white hover:text-white'}`}
                                            >
                                                {pm}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Observação</label>
                                    <textarea
                                        value={editingFinanceItem.editObs}
                                        onChange={e => setEditingFinanceItem({ ...editingFinanceItem, editObs: e.target.value })}
                                        placeholder="Informações adicionais..."
                                        rows={2}
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-600 resize-none"
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
                                <p className="text-white text-sm mt-1">Visão geral de entradas e saídas</p>
                            </div>
                            <button
                                onClick={() => { setGastoDesc(''); setGastoAmount(''); setGastoPayMethod('PIX'); setShowGastoModal(true); }}
                                className="bg-red-500 text-white px-6 py-3 rounded-2xl font-black uppercase text-sm hover:scale-105 transition-all shadow-lg shadow-red-500/20 flex items-center gap-2"
                            >
                                <DollarSign size={16} /> Gastos do Dia
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div className="bg-zinc-950 p-8 rounded-[32px] border border-zinc-900 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                    <Wallet size={40} className="text-[#39FF14]" />
                                </div>
                                <p className="text-white text-sm font-black uppercase tracking-widest mb-1">Saldo em Caixa</p>
                                <p className="text-4xl font-black text-[#39FF14] tabular-nums">R$ {financeStats.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="bg-zinc-950 p-8 rounded-[32px] border border-zinc-900 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                    <ArrowUpCircle size={40} className="text-blue-500" />
                                </div>
                                <p className="text-white text-sm font-black uppercase tracking-widest mb-1">Vendas Hoje</p>
                                <p className="text-4xl font-black text-[#39FF14] tabular-nums">R$ {financeStats.todaySales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="bg-zinc-950 p-8 rounded-[32px] border border-zinc-900 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                    <ArrowDownCircle size={40} className="text-[#39FF14]" />
                                </div>
                                <p className="text-white text-sm font-black uppercase tracking-widest mb-1">Previsão Recebiveis</p>
                                <p className="text-4xl font-black text-[#39FF14] tabular-nums">R$ {financeStats.pendingReceivables.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                        </div>

                        <div className="bg-zinc-950 border border-zinc-900 rounded-[32px] overflow-hidden">
                            <div className="p-6 border-b border-zinc-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <h3 className="text-white text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                    <Clock size={12} /> Movimentações por Período
                                </h3>
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        type="date"
                                        value={caixaDateFrom}
                                        onChange={e => setCaixaDateFrom(e.target.value)}
                                        className="bg-zinc-900 text-sm font-bold px-3 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] transition-colors"
                                    />
                                    <span className="text-white/50 text-xs font-bold">até</span>
                                    <input
                                        type="date"
                                        value={caixaDateTo}
                                        onChange={e => setCaixaDateTo(e.target.value)}
                                        className="bg-zinc-900 text-sm font-bold px-3 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] transition-colors"
                                    />
                                    {(caixaDateFrom || caixaDateTo) && (
                                        <button
                                            onClick={() => { setCaixaDateFrom(''); setCaixaDateTo(''); }}
                                            className="text-white/50 hover:text-white transition-colors p-1"
                                            title="Limpar filtro"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="divide-y divide-zinc-900">
                                {groupedFinancialItems.length === 0 ? (
                                    <div className="p-12 text-center text-white font-bold uppercase text-sm tracking-widest italic">Nenhuma movimentação no período</div>
                                ) : (
                                    groupedFinancialItems.map(({ group, items, total }: { group: string, items: any[], total: number }) => (
                                        <div key={group}>
                                            <div className="bg-zinc-900/40 px-6 py-3 flex justify-between items-center text-sm font-black uppercase tracking-widest border-y border-zinc-900">
                                                <span className="text-white/70">{group}</span>
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
                                                            <p className="text-sm text-white font-bold uppercase">
                                                                {new Date(item.due_date || item.transaction_date || item.created_at).toLocaleDateString('pt-BR')}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-4 shrink-0">
                                                        <div className="text-right">
                                                            <p className={`text-lg font-black ${item.type === 'INFLOW' ? 'text-[#39FF14]' : 'text-red-500'}`}>
                                                                {item.type === 'INFLOW' ? '+' : '-'} R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </p>
                                                            <span className={`text-sm font-black uppercase px-3 py-1 rounded-full ${
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
                                    <p className="text-white text-sm mt-1">Gestão de contas a pagar da confecção</p>
                                </div>
                                <button
                                    onClick={() => { resetContaForm(); setContaModalOpen(true); }}
                                    className="bg-[#39FF14] text-black px-6 py-3 rounded-2xl font-black uppercase text-sm tracking-widest hover:scale-105 transition-all shadow-lg shadow-[#39FF14]/20 flex items-center gap-2"
                                >
                                    <Plus size={16} /> Nova Conta
                                </button>
                            </div>

                            {/* Month selector */}
                            <div className="flex flex-wrap gap-2">
                                <select value={contaMonthFilter} onChange={e => setContaMonthFilter(parseInt(e.target.value))}
                                    className="bg-zinc-900 text-sm font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] appearance-none">
                                    {Array.from({ length: 12 }, (_, i) => (
                                        <option key={i} value={i}>{new Date(2000, i, 1).toLocaleString('pt-BR', { month: 'long' })}</option>
                                    ))}
                                </select>
                                <select value={contaYearFilter} onChange={e => setContaYearFilter(parseInt(e.target.value))}
                                    className="bg-zinc-900 text-sm font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] appearance-none">
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
                                        <p className="text-sm font-black uppercase tracking-widest text-white mb-2">{s.label}</p>
                                        <p className={`text-2xl font-black tabular-nums ${s.color}`}>{fmtBRL(s.value)}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Group breakdown */}
                            {groupTotals.length > 0 && (
                                <div className="bg-zinc-950 border border-zinc-900 rounded-[24px] p-5">
                                    <p className="text-sm font-black uppercase tracking-widest text-white mb-4">Por Categoria</p>
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
                                        className={`px-4 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all border ${contaStatusFilter === s
                                            ? 'bg-[#39FF14] text-black border-[#39FF14]'
                                            : 'bg-zinc-900 text-white/70 border-zinc-800 hover:border-[#39FF14]/50'}`}
                                    >{s}</button>
                                ))}
                                <div className="w-px bg-zinc-800 mx-1" />
                                <button onClick={() => setContaGroupFilter('TODOS')}
                                    className={`px-3 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all border ${contaGroupFilter === 'TODOS' ? 'bg-zinc-700 text-white border-zinc-600' : 'bg-zinc-900 text-white border-zinc-800 hover:border-zinc-600'}`}
                                >Todos</button>
                                {CONFECCAO_GROUPS.map(g => (
                                    <button key={g.group} onClick={() => setContaGroupFilter(contaGroupFilter === g.group ? 'TODOS' : g.group)}
                                        className="px-3 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all border"
                                        style={contaGroupFilter === g.group
                                            ? { backgroundColor: g.color, color: '#000', borderColor: g.color }
                                            : { backgroundColor: 'transparent', color: g.color, borderColor: g.color + '40' }}
                                    >{g.emoji} {g.group}</button>
                                ))}
                            </div>

                            {/* List */}
                            <div className="bg-zinc-950 border border-zinc-900 rounded-[32px] overflow-hidden">
                                {visibleContas.length === 0 ? (
                                    <div className="p-12 text-center text-white font-bold uppercase text-sm tracking-widest italic">
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
                                                                <span className="text-[13px] font-black uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: (grp?.color || '#6B7280') + '20', color: grp?.color || '#6B7280' }}>
                                                                    {conta.category}
                                                                </span>
                                                                <span className={`text-[13px] font-black uppercase px-2 py-0.5 rounded-full ${conta.recurrence === 'FIXA' ? 'bg-blue-500/10 text-blue-400' : conta.recurrence === 'VARIAVEL' ? 'bg-orange-500/10 text-orange-400' : 'bg-zinc-800 text-white/70'}`}>
                                                                    {conta.recurrence === 'FIXA' ? '🔄 Fixa' : conta.recurrence === 'VARIAVEL' ? '📊 Variável' : '1️⃣ Única'}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-white font-bold uppercase">
                                                                <span>Venc: {new Date(conta.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                                                <span>{conta.payment_method}</span>
                                                                {conta.status === 'PAGO' && conta.paid_date && (
                                                                    <span className="text-[#39FF14]">✅ Pago em {new Date(conta.paid_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                                                )}
                                                                {isOverdue && <span className="text-red-400">⚠️ ATRASADO</span>}
                                                            </div>
                                                            {conta.notes && <p className="text-sm text-white/70 mt-1 italic">{conta.notes}</p>}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0 justify-between md:justify-end">
                                                        <p className={`text-xl font-black tabular-nums ${conta.status === 'PAGO' ? 'text-[#39FF14]' : isOverdue ? 'text-red-400' : 'text-white'}`}>
                                                            {fmtBRL(conta.amount || 0)}
                                                        </p>
                                                        <div className="flex items-center gap-1">
                                                            {conta.status !== 'PAGO' ? (
                                                                <button onClick={() => handleMarkContaPaid(conta.id)}
                                                                    className="bg-[#39FF14] text-black px-3 py-2 rounded-xl text-[13px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-1">
                                                                    <Check size={12} /> Pagar
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => handleUndoContaPaid(conta.id)}
                                                                    className="text-white/70 hover:text-orange-400 transition-colors px-2 py-2 rounded-xl text-[13px] font-black uppercase">
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
                                                            }} className="text-white/70 hover:text-white transition-colors p-2 rounded-xl">
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button onClick={() => setConfirmDeleteContaId(conta.id)} className="text-white/70 hover:text-red-500 transition-colors p-2 rounded-xl">
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
                                className="absolute top-6 right-6 text-white hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>

                            <div className="mb-8">
                                <h3 className="text-2xl font-black italic uppercase text-[#39FF14]">CADASTRO DE PEDIDO</h3>
                                <p className="text-white text-sm font-bold uppercase tracking-widest mt-1">
                                    {nextOrderNumber ? `INICIAR PRODUÇÃO ${nextOrderNumber}` : 'INICIAR NOVA PRODUÇÃO'}
                                </p>
                            </div>

                            <form onSubmit={handleCreateOrder} className="space-y-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">
                                            Nome do Cliente / Academia
                                        </label>
                                        <input
                                            type="text"
                                            value={client}
                                            onChange={e => setClient(e.target.value)}
                                            placeholder="Nome do cliente..."
                                            required
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-600"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-black uppercase tracking-widest text-white mb-2">WhatsApp</label>
                                            <input
                                                type="text"
                                                value={clientWhatsapp}
                                                onChange={e => setClientWhatsapp(e.target.value)}
                                                className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-600"
                                                placeholder="(00) 00000-0000"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-black uppercase tracking-widest text-white mb-2">CPF/CNPJ</label>
                                            <input
                                                type="text"
                                                value={clientCpfCnpj}
                                                onChange={e => handleCpfCnpjChange(e.target.value)}
                                                className={`w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 transition-all placeholder:text-zinc-600 ${cpfCnpjError ? 'focus:ring-red-500 ring-1 ring-red-500' : 'focus:ring-[#39FF14] focus:bg-zinc-900'}`}
                                                placeholder="000.000.000-00"
                                                required
                                            />
                                            {cpfCnpjError && <p className="text-red-500 text-xs font-bold mt-1">{cpfCnpjError}</p>}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-black uppercase tracking-widest text-[#39FF14] mb-2 font-bold italic">
                                                Valor Total {linkedSaleId && <span className="text-white normal-case">(via venda vinculada)</span>}
                                            </label>
                                            <input
                                                type="text"
                                                value={value}
                                                onChange={e => handleValueChange(e.target.value)}
                                                disabled={!!linkedSaleId}
                                                className={`w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-600 ${linkedSaleId ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                placeholder="0,00"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">
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
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">
                                            Método de Entrega
                                        </label>
                                        <select
                                            value={deliveryMethod}
                                            onChange={e => setDeliveryMethod(e.target.value as 'MOTOBOY' | 'TRANSPORTADORA' | 'RETIRADA')}
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all appearance-none"
                                        >
                                            <option value="MOTOBOY">MOTOBOY</option>
                                            <option value="CORREIOS/TRANSPORTADORA">CORREIOS/TRANSPORTADORA</option>
                                            <option value="RETIRADA">RETIRADA</option>
                                        </select>
                                    </div>

                                    {/* Forma de Pagamento */}
                                    <div className="space-y-4">
                                        <label className="block text-sm font-black uppercase tracking-widest text-[#39FF14] mb-2 font-bold italic">Forma de Pagamento</label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                            {['PIX', 'BOLETO', 'CARTÃO CRÉDITO', 'CARTÃO DÉBITO', 'OUTROS'].map((m) => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => {
                                                        setPaymentMethod(m as any);
                                                        if (m !== 'CARTÃO CRÉDITO') setInstallments(1);
                                                    }}
                                                    className={`p-3 rounded-2xl border text-sm font-black uppercase tracking-widest transition-all ${paymentMethod === m
                                                        ? 'border-[#39FF14] bg-[#39FF14]/10 text-[#39FF14]'
                                                        : 'border-zinc-800 bg-zinc-900/50 text-white hover:border-zinc-700'
                                                        }`}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">
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
                                            <label className="block text-sm font-black uppercase tracking-widest mb-2 text-[#39FF14]">
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
                                            <label className="block text-sm font-black uppercase tracking-widest text-white">
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
                                                <span className="text-sm font-bold uppercase tracking-widest text-white group-hover:text-white transition-colors">
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
                                                    className="w-full bg-zinc-950/80 border text-sm font-black uppercase tracking-widest border-zinc-800 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all appearance-none"
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
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-600"
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
                            <p className="text-white text-sm font-bold uppercase tracking-widest mt-1">
                                Descreva o motivo do atraso ou problema
                            </p>
                        </div>

                        <form onSubmit={handlePendingSubmit} className="space-y-6">
                            <div>
                                <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">
                                    Motivo da Pendência
                                </label>
                                <textarea
                                    value={pendingReason}
                                    onChange={e => setPendingReason(e.target.value)}
                                    placeholder="Ex: Falta de tecido, botão quebrado, erro na estampa..."
                                    rows={4}
                                    required
                                    className="w-full bg-zinc-950/80 border-transparent rounded-[24px] p-6 text-white outline-none focus:ring-1 focus:ring-red-500 focus:bg-zinc-900 transition-all font-semibold placeholder:text-zinc-600"
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
                            className="absolute right-6 top-6 text-white hover:text-white transition-colors"
                        >
                            <X size={24} />
                        </button>

                        <div className="mb-8">
                            <h3 className="text-3xl font-black italic uppercase text-white flex items-center gap-3">
                                <Box size={28} className="text-[#39FF14]" /> NOVO PRODUTO
                            </h3>
                            <p className="text-white text-sm font-bold uppercase tracking-widest mt-1">
                                Cadastro de item para o estoque de varejo
                            </p>
                        </div>

                        <form onSubmit={handleAddProduct} className="space-y-6">
                            <div className="grid grid-cols-1 gap-6 text-left">
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Nome do Produto</label>
                                    <input
                                        type="text"
                                        value={prodName}
                                        onChange={e => setProdName(e.target.value)}
                                        placeholder="Ex: Camiseta Libera Basic"
                                        required
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-600"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Detalhes</label>
                                    <textarea
                                        value={prodDetails}
                                        onChange={e => setProdDetails(e.target.value)}
                                        placeholder="Ex: Tamanhos disponíveis, cores, material..."
                                        rows={2}
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-600 resize-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Foto do Produto</label>
                                    <div className="flex items-center gap-4">
                                        {prodImage ? (
                                            <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-zinc-800 shrink-0">
                                                <img src={prodImage} alt="Preview" className="w-full h-full object-cover" />
                                                <button type="button" onClick={() => setProdImage('')}
                                                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-sm">
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="w-16 h-16 rounded-xl border border-dashed border-zinc-700 flex items-center justify-center shrink-0">
                                                <Package size={20} className="text-white" />
                                            </div>
                                        )}
                                        <label className="flex-1 cursor-pointer">
                                            <div className="bg-zinc-950/80 border border-dashed border-zinc-700 rounded-2xl p-3 text-center hover:border-[#39FF14]/50 transition-all">
                                                <p className="text-sm font-bold text-white uppercase">
                                                    {prodImage ? 'Trocar foto' : 'Escolher foto'}
                                                </p>
                                            </div>
                                            <input type="file" accept="image/*" className="hidden" onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                if (file.size > 500000) {
                                                    toast.error('Imagem muito grande (máx 500KB)');
                                                    return;
                                                }
                                                const reader = new FileReader();
                                                reader.onload = () => setProdImage(reader.result as string);
                                                reader.readAsDataURL(file);
                                            }} />
                                        </label>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Preço de Venda (R$)</label>
                                        <input
                                            type="text"
                                            value={prodSalePrice}
                                            onChange={e => setProdSalePrice(formatCurrency(e.target.value))}
                                            placeholder="0,00"
                                            required
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-600"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Preço de Custo (R$)</label>
                                        <input
                                            type="text"
                                            value={prodCostPrice}
                                            onChange={e => setProdCostPrice(formatCurrency(e.target.value))}
                                            placeholder="0,00"
                                            required
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-zinc-500 focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-600"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Quantidade em Estoque</label>
                                    <input
                                        type="number"
                                        value={prodStock}
                                        onChange={e => setProdStock(e.target.value)}
                                        placeholder="0"
                                        required
                                        className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-600"
                                    />
                                </div>
                            </div>

                            <label className="flex items-center gap-3 cursor-pointer bg-zinc-950/50 rounded-2xl p-4">
                                <input type="checkbox" checked={prodShowInStore} onChange={e => setProdShowInStore(e.target.checked)} className="w-5 h-5 rounded accent-[#39FF14]" />
                                <div>
                                    <span className="text-sm font-black uppercase tracking-widest text-white">Visível na Loja</span>
                                    <p className="text-xs text-white/50 mt-0.5">Este produto aparecerá na loja online para clientes</p>
                                </div>
                            </label>

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
                        <button onClick={() => { setContaModalOpen(false); resetContaForm(); }} className="absolute right-6 top-6 text-white hover:text-white transition-colors">
                            <X size={24} />
                        </button>

                        <div className="mb-8">
                            <h3 className="text-3xl font-black italic uppercase text-[#39FF14] flex items-center gap-3">
                                ✂️ {editingConta ? 'EDITAR CONTA' : 'NOVA CONTA A PAGAR'}
                            </h3>
                            <p className="text-white text-sm font-bold uppercase tracking-widest mt-1">Contas a Pagar – Confecção</p>
                        </div>

                        <form onSubmit={handleSaveConta} className="space-y-5">
                            {/* Descrição */}
                            <div>
                                <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Descrição *</label>
                                <input type="text" value={contaDesc} onChange={e => setContaDesc(e.target.value)}
                                    placeholder="Ex: Frete Correios, Costureira Lena..."
                                    className="w-full bg-zinc-950/80 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-600 uppercase" required />
                            </div>

                            {/* Categoria */}
                            <div>
                                <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Grupo *</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {CONFECCAO_GROUPS.map(g => (
                                        <button key={g.group} type="button"
                                            onClick={() => { setContaGroup(g.group); setContaCategory(''); }}
                                            className="p-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all text-left border"
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
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Categoria *</label>
                                    <div className="flex flex-wrap gap-2">
                                        {CONFECCAO_GROUPS.find(g => g.group === contaGroup)?.items.map(item => (
                                            <button key={item} type="button"
                                                onClick={() => setContaCategory(item)}
                                                className="px-4 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all border"
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
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-[#39FF14]">Valor (R$) *</label>
                                    <input type="text" value={contaAmount} onChange={e => setContaAmount(formatCurrency(e.target.value))}
                                        placeholder="0,00"
                                        className="w-full bg-zinc-950/80 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-600" required />
                                </div>
                                {/* Dia de vencimento */}
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Dia Vencimento *</label>
                                    <input type="number" min="1" max="31" value={contaDueDay} onChange={e => setContaDueDay(e.target.value)}
                                        placeholder="Ex: 10"
                                        className="w-full bg-zinc-950/80 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-600" required />
                                </div>
                            </div>

                            {/* Recorrência */}
                            <div>
                                <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Tipo de Conta *</label>
                                <div className="flex gap-2">
                                    {([['UNICA', '1️⃣ Única'], ['FIXA', '🔄 Fixa (ano todo)'], ['VARIAVEL', '📊 Variável (ano todo)']] as const).map(([val, label]) => (
                                        <button key={val} type="button" onClick={() => setContaRecurrence(val)}
                                            className={`flex-1 p-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all border ${contaRecurrence === val ? 'bg-zinc-700 text-white border-zinc-600' : 'bg-zinc-950 text-white border-zinc-800 hover:border-zinc-600'}`}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Forma de pagamento */}
                            <div>
                                <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Forma de Pagamento</label>
                                <div className="flex flex-wrap gap-2">
                                    {['PIX', 'DINHEIRO', 'BOLETO', 'CARTÃO CRÉDITO', 'CARTÃO DÉBITO'].map(pm => (
                                        <button key={pm} type="button" onClick={() => setContaPayMethod(pm)}
                                            className={`px-4 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all border ${contaPayMethod === pm ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-950 text-white border-zinc-800 hover:border-zinc-600'}`}>
                                            {pm}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Observações */}
                            <div>
                                <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Observações</label>
                                <textarea value={contaNotes} onChange={e => setContaNotes(e.target.value)}
                                    placeholder="Notas adicionais..."
                                    rows={2}
                                    className="w-full bg-zinc-950/80 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all placeholder:text-zinc-600 resize-none" />
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
                        <p className="text-white text-sm mb-6">Essa ação não pode ser desfeita.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmDeleteContaId(null)}
                                className="flex-1 py-3 rounded-2xl border border-zinc-700 text-white/70 font-black uppercase text-sm tracking-widest hover:border-zinc-500 transition-all">
                                Cancelar
                            </button>
                            <button onClick={handleDeleteConta}
                                className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-black uppercase text-sm tracking-widest hover:bg-red-600 transition-all">
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
                            className="absolute right-6 top-6 text-white hover:text-white transition-colors"
                        >
                            <X size={24} />
                        </button>

                        <div className="mb-6">
                            <h3 className="text-3xl font-black italic uppercase text-white flex items-center gap-3">
                                <PlusCircle size={28} className="text-red-500" /> NOVA CONTA A PAGAR
                            </h3>
                            <p className="text-white text-sm font-bold uppercase tracking-widest mt-1">
                                Registro de despesas e saídas de caixa
                            </p>
                        </div>

                        <form onSubmit={handleAddFinance} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
                            {/* Descrição */}
                            <div>
                                <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Descrição</label>
                                <input
                                    type="text"
                                    value={finDesc}
                                    onChange={e => setFinDesc(e.target.value)}
                                    placeholder="Ex: Compra de Tecido, Conta de Luz..."
                                    required
                                    className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-600"
                                />
                            </div>

                            {/* Fornecedor */}
                            <div className="relative">
                                <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Fornecedor / Cliente</label>
                                <input
                                    type="text"
                                    value={finSupplier}
                                    onChange={e => { setFinSupplier(e.target.value); setShowSupplierSuggestions(e.target.value.length > 0); }}
                                    onFocus={() => { if (finSupplier.length > 0) setShowSupplierSuggestions(true); }}
                                    onBlur={() => setTimeout(() => setShowSupplierSuggestions(false), 200)}
                                    placeholder="Digite para buscar ou cadastrar..."
                                    className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-600"
                                />
                                {showSupplierSuggestions && (
                                    <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden z-50 shadow-xl max-h-[200px] overflow-y-auto">
                                        {fornecedores.filter(f => f.name.toLowerCase().includes(finSupplier.toLowerCase()) || (f.cpf_cnpj && f.cpf_cnpj.includes(finSupplier.replace(/\D/g, '')))).map(f => (
                                            <button
                                                key={f.id}
                                                type="button"
                                                onMouseDown={() => { setFinSupplier(f.name); setShowSupplierSuggestions(false); }}
                                                className="w-full text-left px-4 py-3 hover:bg-zinc-800 transition-colors"
                                            >
                                                <p className="text-sm font-bold text-white">{f.name}</p>
                                                <p className="text-xs text-white/50">{f.cpf_cnpj ? (f.cpf_cnpj.length === 11 ? f.cpf_cnpj.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : f.cpf_cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')) : ''} {f.whatsapp && `• ${f.whatsapp}`}</p>
                                            </button>
                                        ))}
                                        {fornecedores.filter(f => f.name.toLowerCase().includes(finSupplier.toLowerCase()) || (f.cpf_cnpj && f.cpf_cnpj.includes(finSupplier.replace(/\D/g, '')))).length === 0 && (
                                            <div className="px-4 py-3 text-sm text-white/50 italic">Nenhum encontrado — será cadastrado ao salvar</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Valor */}
                            <div>
                                <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Valor (R$)</label>
                                <input
                                    type="text"
                                    value={finAmount}
                                    onChange={e => setFinAmount(formatCurrency(e.target.value))}
                                    placeholder="0,00"
                                    required
                                    className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-600"
                                />
                            </div>

                            {/* Forma de Pagamento */}
                            <div>
                                <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Forma de Pagamento</label>
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
                                            className={`px-4 py-3 rounded-xl font-black uppercase text-sm tracking-widest transition-all ${finPayMethod === pm ? 'bg-[#39FF14] text-black shadow-lg shadow-[#39FF14]/20' : 'bg-zinc-950 text-white hover:text-white'}`}
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
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Data de Vencimento</label>
                                        <input
                                            type="date"
                                            value={finDueDate}
                                            onChange={e => setFinDueDate(e.target.value)}
                                            required
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold [color-scheme:dark]"
                                        />
                                    </div>
                                    <p className="text-sm text-white/70 italic px-1">O pagamento via PIX normalmente ocorre no mesmo dia.</p>
                                </div>
                            )}

                            {/* BOLETO */}
                            {finPayMethod === 'BOLETO' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Número de Parcelas</label>
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
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">
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
                                            <p className="text-sm font-black uppercase tracking-widest text-white mb-3">Preview dos Vencimentos</p>
                                            <div className="space-y-2">
                                                {finInstallmentDates.map((date, i) => (
                                                    <div key={i} className="flex items-center justify-between gap-2">
                                                        <span className="text-sm font-black text-white/70 uppercase shrink-0">
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
                                                            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[13px] font-bold text-white outline-none focus:border-[#39FF14] [color-scheme:dark]"
                                                        />
                                                        <span className="text-sm text-white/70 font-bold shrink-0">
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
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Número de Parcelas</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={12}
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
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">
                                            {finInstallments > 1 ? 'Vencimento da 1ª Parcela' : 'Data de Vencimento'}
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
                                            <p className="text-sm font-black uppercase tracking-widest text-white mb-3">Vencimento das Parcelas</p>
                                            <div className="space-y-2">
                                                {finInstallmentDates.map((date, i) => (
                                                    <div key={i} className="flex items-center justify-between gap-2">
                                                        <span className="text-sm font-black text-white/70 uppercase shrink-0">
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
                                                            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[13px] font-bold text-white outline-none focus:border-[#39FF14] [color-scheme:dark]"
                                                        />
                                                        <span className="text-sm text-white/70 font-bold shrink-0">
                                                            R$ {(parseBRL(finAmount || '0') / finInstallments).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* CARTÃO DÉBITO */}
                            {finPayMethod === 'CARTÃO DÉBITO' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Dia do Débito</label>
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
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Tipo de Pagamento</label>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => setFinDebitRecurrent(false)}
                                                className={`flex-1 py-3 rounded-xl font-black uppercase text-sm tracking-widest transition-all ${!finDebitRecurrent ? 'bg-[#39FF14] text-black shadow-lg shadow-[#39FF14]/20' : 'bg-zinc-950 text-white hover:text-white'}`}>
                                                Único
                                            </button>
                                            <button type="button" onClick={() => setFinDebitRecurrent(true)}
                                                className={`flex-1 py-3 rounded-xl font-black uppercase text-sm tracking-widest transition-all ${finDebitRecurrent ? 'bg-[#39FF14] text-black shadow-lg shadow-[#39FF14]/20' : 'bg-zinc-950 text-white hover:text-white'}`}>
                                                Recorrente
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Próximo Débito</label>
                                        <input
                                            type="date"
                                            value={finDueDate}
                                            onChange={e => setFinDueDate(e.target.value)}
                                            required
                                            className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold [color-scheme:dark]"
                                        />
                                    </div>
                                    {finDebitRecurrent && (
                                        <p className="text-sm text-white/70 italic px-1">O débito será repetido mensalmente no dia {finDebitDay}.</p>
                                    )}
                                </div>
                            )}

                            {/* OUTRO */}
                            {finPayMethod === 'OUTRO' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Data de Vencimento</label>
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
                                <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">
                                    Observação {finPayMethod === 'OUTRO' && <span className="text-red-400">*</span>}
                                </label>
                                <textarea
                                    value={finObs}
                                    onChange={e => setFinObs(e.target.value)}
                                    placeholder={finPayMethod === 'OUTRO' ? 'Descreva a forma de pagamento...' : 'Informações adicionais...'}
                                    rows={2}
                                    required={finPayMethod === 'OUTRO'}
                                    className="w-full bg-zinc-950/80 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-900 transition-all font-bold placeholder:text-zinc-600 resize-none"
                                />
                            </div>

                            {/* Status */}
                            <div>
                                <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Status</label>
                                <div className="py-3 px-4 rounded-xl font-black uppercase text-sm tracking-widest text-center bg-red-500/20 text-red-400 border border-red-500/30">
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
