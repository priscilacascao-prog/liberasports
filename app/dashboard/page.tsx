'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LayoutDashboard, Plus, Search, Calendar, Package,
    ArrowRight, Check, AlertCircle, Clock, X, LogOut,
    TrendingUp, Truck, User, History, MessageSquare, Info, Filter,
    Loader2, ChevronDown, ChevronUp, MessageCircle, Pencil, FileText, Trash2,
    Store, ShoppingCart, Wallet, BarChart3, Settings, Layers, Box, DollarSign,
    ArrowUpCircle, ArrowDownCircle, ArrowUpRight, ArrowDownLeft, PlusCircle, Home, Copy, Sun, Moon, Eye, Paperclip, Mail, RefreshCw
} from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection, doc, addDoc, updateDoc, deleteDoc,
    onSnapshot, query, orderBy, serverTimestamp,
    getDoc, setDoc, getDocs, where, writeBatch
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
    'lspalmeira@hotmail.com',
    'minchevkarla77@gmail.com',
    'libera.sports1@gmail.com',
    // Adicione mais emails aqui
];

// Emails com acesso restrito (sem Financeiro e Caixa)
const RESTRICTED_EMAILS = [
    'libera.sports1@gmail.com',
];

// Email com acesso ao histórico de movimentações
const ADMIN_EMAILS = [
    'prisciladm@icloud.com',
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

// Extrai tamanho do nome do produto (reutilizado da loja)
const sizeOrder: Record<string, number> = { 'BB': 0, 'PP': 1, 'P': 2, 'M': 3, 'G': 4, 'GG': 5, 'XG': 6, 'XXG': 7, 'EG': 8, 'EXG': 9 };

function extractProductInfo(name: string) {
    let size = '';
    let baseName = name;
    const tamMatch = name.match(/[-–]\s*TAM\.?\s*(\w+)/i);
    if (tamMatch) {
        size = tamMatch[1].toUpperCase();
        baseName = name.replace(tamMatch[0], '').trim();
    } else {
        const sizeAfterDash = name.match(/[-–]\s*(BB|PP|XXG|EXG|XG|GG|EG|P|M|G)\s*$/i);
        if (sizeAfterDash) {
            size = sizeAfterDash[1].toUpperCase();
            baseName = name.replace(sizeAfterDash[0], '').trim();
        } else {
            const lastWord = name.match(/\s+(BB|PP|XXG|EXG|XG|GG|EG)\s*$/i);
            if (lastWord) {
                size = lastWord[1].toUpperCase();
                baseName = name.replace(lastWord[0], '').trim();
            }
        }
    }
    baseName = baseName.replace(/[-–]\s*$/, '').replace(/\s+/g, ' ').trim();
    return { baseName, size };
}

function getSizeWeight(size: string): number {
    if (sizeOrder[size] !== undefined) return sizeOrder[size];
    const num = parseInt(size);
    if (!isNaN(num)) return 10 + num;
    return 50;
}

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
        bg: isDark ? 'bg-zinc-900' : 'bg-gray-50',
        text: isDark ? 'text-white' : 'text-gray-900',
        textMuted: isDark ? 'text-zinc-300' : 'text-gray-500',
        textSub: isDark ? 'text-zinc-400' : 'text-gray-400',
        accent: isDark ? 'text-[#39FF14]' : 'text-green-600',
        accentBg: isDark ? 'bg-[#39FF14]' : 'bg-green-600',
        accentText: isDark ? 'text-black' : 'text-[#fff]',
        card: isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200',
        cardHover: isDark ? 'hover:border-zinc-600' : 'hover:border-gray-300',
        input: isDark ? 'bg-zinc-700 border-zinc-600 text-white placeholder:text-zinc-400' : 'bg-gray-100 border-gray-200 text-gray-900 placeholder:text-gray-400',
        nav: isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200',
        divider: isDark ? 'divide-zinc-700' : 'divide-gray-200',
        border: isDark ? 'border-zinc-700' : 'border-gray-200',
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
    const [pixSplit, setPixSplit] = useState(false);
    const [description, setDescription] = useState('');
    const [linkSale, setLinkSale] = useState(false);
    const [linkedSaleId, setLinkedSaleId] = useState('');

    // Configurações do AppId para o caminho solicitado
    const appId = 'libera-sports-v1';
    const productsCollectionPath = `artifacts/${appId}/public/data/produtos`;
    const salesCollectionPath = `artifacts/${appId}/public/data/vendas`;
    const financeCollectionPath = `artifacts/${appId}/public/data/financeiro`;
    const fornecedoresCollectionPath = `artifacts/${appId}/public/data/fornecedores`;
    const settingsDocPath = `artifacts/${appId}/public/data/settings/general`;

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
    const [userEmail, setUserEmail] = useState('');
    const isRestricted = RESTRICTED_EMAILS.includes(userEmail);
    const isAdmin = ADMIN_EMAILS.includes(userEmail);
    const [showActivityLog, setShowActivityLog] = useState(false);
    const [activeFilter, setActiveFilter] = useState<string | null>(null);
    const [editingObsId, setEditingObsId] = useState<string | null>(null);
    const [obsValue, setObsValue] = useState('');
    const [expandedObs, setExpandedObs] = useState<Record<string, boolean>>({});
    const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});
    const [expandedHistoryIds, setExpandedHistoryIds] = useState<Record<string, boolean>>({});
    const [reportEmail, setReportEmail] = useState('');
    const [nextOrderNumber, setNextOrderNumber] = useState('');
    const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0]);
    const [installments, setInstallments] = useState(1);

    // Novos Estados para o Híbrido
    const [products, setProducts] = useState<any[]>([]);
    const [sales, setSales] = useState<any[]>([]);
    const [financialItems, setFinancialItems] = useState<any[]>([]);
    const [stockLoading, setStockLoading] = useState(true);
    const [saleQtyByGroup, setSaleQtyByGroup] = useState<Record<string, number>>({});

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
    const [saleCep, setSaleCep] = useState('');
    const [saleEndereco, setSaleEndereco] = useState('');
    const [saleNumero, setSaleNumero] = useState('');
    const [saleQuadra, setSaleQuadra] = useState('');
    const [saleLote, setSaleLote] = useState('');
    const [saleCidade, setSaleCidade] = useState('');
    const [saleEstado, setSaleEstado] = useState('');
    const [saleComplemento, setSaleComplemento] = useState('');
    const [saleBoletoQty, setSaleBoletoQty] = useState(1);
    const [saleBoletoInterval, setSaleBoletoInterval] = useState(30);
    const [saleBoletoFirstDate, setSaleBoletoFirstDate] = useState('');
    const [saleDescription, setSaleDescription] = useState('');
    const [showDescription, setShowDescription] = useState(false);
    const [saleEntersProduction, setSaleEntersProduction] = useState(true);
    const [saleManualValue, setSaleManualValue] = useState('');
    const [productSearch, setProductSearch] = useState('');

    // Form Estado - Produtos
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [prodName, setProdName] = useState('');
    const [prodDetails, setProdDetails] = useState('');
    const [prodImage, setProdImage] = useState('');
    const [prodImages, setProdImages] = useState<string[]>([]);
    const [prodSalePrice, setProdSalePrice] = useState('');
    const [prodCostPrice, setProdCostPrice] = useState('');
    const [prodStock, setProdStock] = useState('');
    const [prodShowInStore, setProdShowInStore] = useState(false);
    const [prodProntaEntrega, setProdProntaEntrega] = useState(false);

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
    const [editProductImages, setEditProductImages] = useState<string[]>([]);
    const [editProductShowInStore, setEditProductShowInStore] = useState(false);
    const [editProductProntaEntrega, setEditProductProntaEntrega] = useState(false);
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
    const [showCadastros, setShowCadastros] = useState(false);
    const [cadastroFilter, setCadastroFilter] = useState<'TODOS' | 'CLIENTE' | 'FORNECEDOR' | 'FUNCIONÁRIO'>('TODOS');
    const [financeStatusFilter, setFinanceStatusFilter] = useState('');
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
                setUserEmail((user.email || '').toLowerCase());
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

    // Carregar email do relatório das settings
    useEffect(() => {
        if (authChecking) return;
        const loadSettings = async () => {
            try {
                const settingsSnap = await getDoc(doc(db, settingsDocPath));
                if (settingsSnap.exists()) {
                    setReportEmail(settingsSnap.data().report_email || '');
                }
            } catch (e) { console.error('Error loading settings:', e); }
        };
        loadSettings();
    }, [authChecking]);

    // Products - carrega sob demanda (VENDAS ou ESTOQUE) e mantém listener vivo
    const productsUnsubRef = React.useRef<null | (() => void)>(null);
    useEffect(() => {
        if (authChecking || productsUnsubRef.current) return;
        if (activeTab !== 'VENDAS' && activeTab !== 'ESTOQUE') return;
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
        productsUnsubRef.current = unsubscribe;
        // NÃO retornar cleanup: a assinatura tem que sobreviver à troca de aba
    }, [authChecking, activeTab]);

    // Finance - carrega uma vez e mantém listener vivo
    const financeUnsubRef = React.useRef<null | (() => void)>(null);
    useEffect(() => {
        if (authChecking || financeUnsubRef.current) return;
        const q = query(collection(db, financeCollectionPath), orderBy('created_at', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
            setFinancialItems(data);
        });
        financeUnsubRef.current = unsubscribe;
    }, [authChecking]);

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

    // Contas a Pagar - carrega sob demanda (CAIXA) e mantém listener vivo
    const contasUnsubRef = React.useRef<null | (() => void)>(null);
    useEffect(() => {
        if (authChecking || contasUnsubRef.current) return;
        if (activeTab !== 'CAIXA') return;
        const q = query(collection(db, contasAPagarPath), orderBy('created_at', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
            setContasAPagar(data);
        });
        contasUnsubRef.current = unsubscribe;
    }, [authChecking, activeTab]);

    // Fornecedores - carrega sob demanda (FINANCEIRO ou VENDAS) e mantém listener vivo
    const fornecedoresUnsubRef = React.useRef<null | (() => void)>(null);
    useEffect(() => {
        if (authChecking || fornecedoresUnsubRef.current) return;
        if (activeTab !== 'FINANCEIRO' && activeTab !== 'VENDAS') return;
        const q = query(collection(db, fornecedoresCollectionPath), orderBy('name', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot: any) => {
            const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
            setFornecedores(data);
        });
        fornecedoresUnsubRef.current = unsubscribe;
    }, [authChecking, activeTab]);

    // Cleanup dos listeners apenas quando o dashboard desmonta (logout/sair da página)
    useEffect(() => {
        return () => {
            productsUnsubRef.current?.();
            financeUnsubRef.current?.();
            contasUnsubRef.current?.();
            fornecedoresUnsubRef.current?.();
            productsUnsubRef.current = null;
            financeUnsubRef.current = null;
            contasUnsubRef.current = null;
            fornecedoresUnsubRef.current = null;
        };
    }, []);

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
                pronta_entrega: prodProntaEntrega,
                created_at: new Date().toISOString(),
                user_id: userId
            };
            if (prodImage) newProduct.image = prodImage;
            if (prodImages.length > 0) newProduct.images = prodImages;
            // Verificar tamanho total
            const docSize = JSON.stringify(newProduct).length;
            if (docSize > 900000) {
                toast.error('Imagens muito grandes! Reduza o tamanho ou quantidade de fotos.');
                setLoading(false);
                return;
            }
            await addDoc(collection(db, productsCollectionPath), newProduct);
            toast.success('Produto adicionado ao estoque!');
            setIsProductModalOpen(false);
            setProdName('');
            setProdDetails('');
            setProdSalePrice('');
            setProdCostPrice('');
            setProdStock('');
            setProdShowInStore(false);
            setProdProntaEntrega(false);
            setProdImage('');
            setProdImages([]);
        } catch (err: any) {
            console.error(err);
            if (err.message?.includes('exceeds the maximum')) {
                toast.error('Documento muito grande! Reduza o tamanho das imagens.');
            } else {
                toast.error('Erro ao adicionar produto: ' + (err.message || ''));
            }
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

    // Tabela de preço atacado para tocas/toucas
    const toucaPricingTable = [
        { min: 500, unitPrice: 15.00 },
        { min: 400, unitPrice: 15.10 },
        { min: 300, unitPrice: 15.20 },
        { min: 200, unitPrice: 15.30 },
        { min: 150, unitPrice: 15.40 },
        { min: 100, unitPrice: 15.50 },
        { min: 50, unitPrice: 15.80 },
        { min: 40, unitPrice: 15.95 },
        { min: 30, unitPrice: 16.20 },
        { min: 20, unitPrice: 16.50 },
        { min: 10, unitPrice: 17.00 },
        { min: 5, unitPrice: 20.00 },
    ];

    const isTouca = (name: string) => /touc?a/i.test(name);

    const getToucaWholesalePrice = (totalQty: number): number | null => {
        for (const tier of toucaPricingTable) {
            if (totalQty >= tier.min) return tier.unitPrice;
        }
        return null;
    };

    const [toucaDiscount, setToucaDiscount] = useState(0);
    const [toucaTotalQty, setToucaTotalQty] = useState(0);
    const [toucaWholesaleUnit, setToucaWholesaleUnit] = useState<number | null>(null);

    useEffect(() => {
        const totalBruto = cart.reduce((acc, item) => acc + (item.sale_price * item.quantity), 0);

        // Calcular desconto de atacado para toucas
        const toucaItems = cart.filter(item => isTouca(item.name));
        const totalToucas = toucaItems.reduce((acc, item) => acc + item.quantity, 0);
        const wholesalePrice = getToucaWholesalePrice(totalToucas);

        let discount = 0;
        if (wholesalePrice && totalToucas >= 5) {
            const totalOriginal = toucaItems.reduce((acc, item) => acc + (item.sale_price * item.quantity), 0);
            const totalAtacado = totalToucas * wholesalePrice;
            discount = totalOriginal - totalAtacado;
            if (discount < 0) discount = 0;
        }

        setToucaTotalQty(totalToucas);
        setToucaWholesaleUnit(wholesalePrice);
        setToucaDiscount(discount);
        setCartTotal(totalBruto - discount);
    }, [cart]);

    const buildDeliveryAddress = () => {
        const endereco = saleEndereco.trim();
        const numero = saleNumero.trim();
        const quadra = saleQuadra.trim();
        const lote = saleLote.trim();
        const complemento = saleComplemento.trim();
        const cidade = saleCidade.trim();
        const estado = saleEstado.trim();
        const cep = saleCep.trim();

        const firstParts: string[] = [];
        if (endereco) firstParts.push(endereco);
        if (numero) firstParts.push(`Nº ${numero}`);
        if (quadra) firstParts.push(`Qd ${quadra}`);
        if (lote) firstParts.push(`Lt ${lote}`);
        if (complemento) firstParts.push(complemento);

        const locationParts: string[] = [];
        if (cidade && estado) locationParts.push(`${cidade}/${estado}`);
        else if (cidade) locationParts.push(cidade);
        else if (estado) locationParts.push(estado);
        if (cep) locationParts.push(`CEP: ${cep}`);

        const sections: string[] = [];
        if (firstParts.length) sections.push(firstParts.join(', '));
        if (locationParts.length) sections.push(locationParts.join(' - '));

        return sections.join(' - ');
    };

    const handleCheckout = async () => {
        if (!userId) return;
        const baseTotal = cart.length > 0 ? cartTotal : parseBRL(saleManualValue);
        // Aplicar juros de cartão de crédito
        const taxasCartao: Record<number, number> = { 1: 4.20, 2: 6.09, 3: 7.01, 4: 7.91, 5: 8.80, 6: 9.67 };
        const finalTotal = paymentMethod === 'CARTÃO CRÉDITO' ? baseTotal * (1 + (taxasCartao[installments] || 0) / 100) : baseTotal;
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

            // 1. Criar Venda (remover imagens base64 dos itens para não estourar limite do Firestore)
            const cleanCartItems = cart.map(({ image, images, ...item }) => ({
                id: item.id,
                name: item.name,
                quantity: item.quantity,
                sale_price: item.sale_price,
                cost_price: item.cost_price,
                stock: item.stock,
            }));
            const saleData: any = {
                order_number: newOrderNumber,
                sale_number: newOrderNumber,
                items: cart.length > 0 ? cleanCartItems : [],
                total: finalTotal,
                value: finalTotal,
                client: saleClient.trim().toUpperCase() || '',
                client_whatsapp: saleWhatsapp.trim(),
                cpf_cnpj: saleCpfCnpj.replace(/\D/g, ''),
                deadline: saleDeadline || '',
                delivery_method: saleDeliveryMethod,
                delivery_address: buildDeliveryAddress(),
                description: saleDescription.trim(),
                payment_method: pixSplit && paymentMethod === 'PIX' ? 'PIX 50/50' : paymentMethod,
                pix_split: paymentMethod === 'PIX' && pixSplit,
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
            if (paymentMethod === 'PIX' && pixSplit) {
                // PIX 50/50: 50% recebido agora, 50% a receber na entrega
                const halfValue = Math.round((finalTotal / 2) * 100) / 100;
                await addDoc(collection(db, financeCollectionPath), {
                    type: 'INFLOW',
                    amount: halfValue,
                    description: `${finDesc} (PIX 1/2 - No Pedido)`,
                    status: 'RECEBIDO',
                    payment_method: 'PIX 50/50',
                    created_at: new Date().toISOString(),
                    transaction_date: transactionDate,
                    due_date: transactionDate,
                    order_id: docRef.id,
                    user_id: userId,
                    operator_name: operatorName,
                });
                await addDoc(collection(db, financeCollectionPath), {
                    type: 'INFLOW',
                    amount: finalTotal - halfValue,
                    description: `${finDesc} (PIX 2/2 - Na Entrega)`,
                    status: 'A RECEBER',
                    payment_method: 'PIX 50/50',
                    created_at: new Date().toISOString(),
                    transaction_date: transactionDate,
                    due_date: saleDeadline ? saleDeadline + 'T12:00:00' : transactionDate,
                    order_id: docRef.id,
                    user_id: userId,
                    operator_name: operatorName,
                });
            } else if (paymentMethod === 'BOLETO' && saleBoletoQty > 1) {
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
                const whatsappPhone = normalizePhone(saleWhatsapp);
                const deliveryDate = saleDeadline ? saleDeadline.split('-').reverse().join('/') : '';
                const clientName = saleClient.trim();
                const formattedValue = finalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                const builtDeliveryAddress = buildDeliveryAddress();
                const msgLines = [
                    `Olá *${clientName}*! Seu pedido na *Libera Sports* foi cadastrado com sucesso!`,
                    '',
                    `*Pedido:* ${newOrderNumber}`,
                    `*Valor:* R$ ${formattedValue}`,
                    ...(deliveryDate ? [`*Entrega prevista:* ${deliveryDate}`] : []),
                    `*Método:* ${saleDeliveryMethod}`,
                    `*Pagamento:* ${paymentMethod}`,
                    ...(saleDeliveryMethod === 'RETIRADA'
                        ? ['', '*Endereço de retirada:* _Rua Manguapé, Quadra 40-A, Lote 01-A, Vila Alzira, Aparecida de Goiânia-GO, CEP: 74.913-350_']
                        : builtDeliveryAddress
                            ? ['', '*Endereço de entrega:*', `_${builtDeliveryAddress}_`]
                            : []),
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
            setSaleCep('');
            setSaleEndereco('');
            setSaleNumero('');
            setSaleQuadra('');
            setSaleLote('');
            setSaleCidade('');
            setSaleEstado('');
            setSaleComplemento('');
            setSaleDescription('');
            setSaleBoletoQty(1);
            setSaleBoletoInterval(30);
            setSaleBoletoFirstDate('');
            setSaleEntersProduction(true);
            setSaleManualValue('');
            setPaymentMethod('PIX');
            setPixSplit(false);
            setTransactionDate(new Date().toISOString().split('T')[0]);
            setInstallments(1);
        } catch (err: any) {
            console.error('Erro detalhado ao processar venda:', err);
            toast.error(`Erro ao processar venda: ${err?.message || err}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSale = async (id: string) => {
        if (!confirm('Deseja realmente excluir esta venda? Os itens voltarão para o estoque e as contas financeiras vinculadas serão excluídas.')) return;

        const sale = sales.find(s => s.id === id);
        if (!sale) return;

        // Update otimista: sumir da tela imediatamente
        const prevSales = sales;
        const prevOrders = orders;
        setSales(s => s.filter(x => x.id !== id));
        setOrders(o => o.filter(x => x.id !== id));

        try {
            // 1) Busca estoque atual e entradas financeiras em paralelo (muito mais rápido)
            const uniqueItems = (sale.items || []).filter((it: any) => it.id);
            const [productSnaps, finSnap] = await Promise.all([
                Promise.all(uniqueItems.map((it: any) => getDoc(doc(db, productsCollectionPath, it.id)))),
                getDocs(query(collection(db, financeCollectionPath), where('order_id', '==', id))),
            ]);

            // 2) Monta um batch único: devolve estoque + exclui finance + exclui venda
            const batch = writeBatch(db);
            uniqueItems.forEach((it: any, idx: number) => {
                const pSnap = productSnaps[idx];
                if (pSnap.exists()) {
                    const currentStock = (pSnap.data() as any).stock || 0;
                    batch.update(doc(db, productsCollectionPath, it.id), { stock: currentStock + it.quantity });
                }
            });
            finSnap.docs.forEach(d => batch.delete(doc(db, financeCollectionPath, d.id)));
            batch.delete(doc(db, salesCollectionPath, id));

            await batch.commit();
            toast.success('Venda, estoque e contas financeiras atualizados!');
        } catch (err) {
            console.error(err);
            // Rollback otimista
            setSales(prevSales);
            setOrders(prevOrders);
            toast.error('Erro ao excluir venda.');
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
        const id = confirmDeleteContaId;
        // Update otimista
        const prev = contasAPagar;
        setContasAPagar(c => c.filter(x => x.id !== id));
        setConfirmDeleteContaId(null);
        try {
            await deleteDoc(doc(db, contasAPagarPath, id));
            toast.success('Conta removida!');
        } catch (err) {
            setContasAPagar(prev);
            toast.error('Erro ao excluir');
        }
    };

    // Agrupa produtos por nome base para mostrar tamanhos como quadradinhos
    const groupedProducts = useMemo(() => {
        const groups: Record<string, { baseName: string; image: string; images: string[]; details: string; minPrice: number; maxPrice: number; prontaEntrega: boolean; showInStore: boolean; totalStock: number; variants: any[] }> = {};

        products.forEach((p: any) => {
            const { baseName, size } = extractProductInfo(p.name || '');
            const key = baseName.toUpperCase();
            if (!groups[key]) {
                groups[key] = {
                    baseName,
                    image: p.image || '',
                    images: p.images || [],
                    details: p.details || '',
                    minPrice: p.sale_price || 0,
                    maxPrice: p.sale_price || 0,
                    prontaEntrega: false,
                    showInStore: false,
                    totalStock: 0,
                    variants: [],
                };
            }
            const g = groups[key];
            g.variants.push({ ...p, extractedSize: size });
            if (p.image && !g.image) g.image = p.image;
            if (p.images?.length && !g.images?.length) g.images = p.images;
            if (p.details && !g.details) g.details = p.details;
            if ((p.sale_price || 0) < g.minPrice || g.minPrice === 0) g.minPrice = p.sale_price || 0;
            if ((p.sale_price || 0) > g.maxPrice) g.maxPrice = p.sale_price || 0;
            if (p.pronta_entrega) g.prontaEntrega = true;
            if (p.show_in_store) g.showInStore = true;
            g.totalStock += (p.stock || 0);
        });

        Object.values(groups).forEach(g => {
            g.variants.sort((a, b) => getSizeWeight(a.extractedSize) - getSizeWeight(b.extractedSize));
        });

        return Object.entries(groups).sort((a, b) => a[1].baseName.localeCompare(b[1].baseName, 'pt-BR', { numeric: true }));
    }, [products]);

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

    const getProductionImages = (order: any): string[] => {
        if (order.production_images && Array.isArray(order.production_images)) return order.production_images;
        if (order.production_image) return [order.production_image];
        return [];
    };

    const handleUploadProductionImage = async (orderId: string, file: File) => {
        if (file.size > 300000) { toast.error('Imagem muito grande (máx 300KB)'); return; }
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const orderRef = doc(db, salesCollectionPath, orderId);
                const orderSnap = await getDoc(orderRef);
                const orderData = orderSnap.data();
                const current = orderData?.production_images || (orderData?.production_image ? [orderData.production_image] : []);
                if (current.length >= 5) { toast.error('Máximo de 5 imagens'); return; }
                const updated = [...current, reader.result as string];
                await updateDoc(orderRef, { production_images: updated, production_image: '' });
                toast.success('Imagem anexada!');
            } catch (error) {
                console.error('Error uploading production image:', error);
                toast.error('Erro ao anexar imagem');
            }
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveProductionImage = async (orderId: string, index: number) => {
        if (!confirm('Remover esta imagem?')) return;
        try {
            const orderRef = doc(db, salesCollectionPath, orderId);
            const orderSnap = await getDoc(orderRef);
            const orderData = orderSnap.data();
            const current = orderData?.production_images || (orderData?.production_image ? [orderData.production_image] : []);
            const updated = current.filter((_: any, i: number) => i !== index);
            await updateDoc(orderRef, { production_images: updated, production_image: '' });
            toast.success('Imagem removida!');
        } catch (error) {
            console.error('Error removing production image:', error);
            toast.error('Erro ao remover imagem');
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
                const whatsappPhone = normalizePhone(orderData.client_whatsapp);
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

            // Se aprovou pedido e tem email configurado, envia relatório por e-mail
            if ((currentStatus === 'AGUARDANDO APROVAÇÃO' || currentStatus === 'PEDIDO FEITO') && reportEmail) {
                const orderForReport = { ...orderData, id: orderId, status: nextStatus };
                sendReportByEmail(orderForReport);
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

    const normalizePhone = (raw: string): string => {
        let digits = raw.replace(/\D/g, '');
        // Só celular sem DDD (até 9 dígitos) → adiciona DDD 62 (Goiânia)
        if (digits.length <= 9) digits = '62' + digits;
        // Sem código do país → adiciona 55
        if (!digits.startsWith('55')) digits = '55' + digits;
        // Se ficou com 55 duplicado (ex: 555562...) → remove o extra
        if (digits.length > 13 && digits.startsWith('5555')) digits = digits.slice(2);
        return digits;
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

        if (payMethod === 'PIX' || payMethod === 'DINHEIRO') {
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
        } else if (payMethod === 'CARTÃO DÉBITO') {
            // Débito: recebimento no próximo dia útil
            const nextBizDay = addBusinessDays(baseDate, 1);
            await addDoc(collection(db, financeCollectionPath), {
                type: 'INFLOW',
                amount: totalValue,
                description: `${prefix}${desc}`,
                payment_method: payMethod,
                status: 'A RECEBER',
                created_at: new Date().toISOString(),
                transaction_date: baseDate.toISOString(),
                due_date: new Date(nextBizDay + 'T12:00:00').toISOString(),
                order_id: orderId,
                user_id: uid,
                operator_name: operatorName,
            });
        } else if (payMethod === 'CARTÃO CRÉDITO') {
            // Crédito: cada parcela a cada 30 dias (1x = 30 dias, 2x = 30 e 60, etc.)
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
                    due_date: dueDate.toISOString(),
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
            const whatsappPhone = normalizePhone(clientWhatsapp);
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

    const generateReportHtml = (order: any, forEmail = false) => {
        const imgs = [...(order.production_images || []), ...(order.production_image && !order.production_images?.length ? [order.production_image] : [])];
        const hasImages = imgs.length > 0;

        // Para email, não incluímos imagens base64 (muito grandes para e-mail)
        const imgsForReport = forEmail ? [] : imgs;
        const hasImagesForReport = forEmail ? false : hasImages;

        const editAttr = forEmail ? '' : ' contenteditable="true" spellcheck="false"';
        const apiOrigin = typeof window !== 'undefined' ? window.location.origin : '';
        const sendEmailTo = reportEmail || '';
        const emailSubject = `Ordem de Serviço - ${order.order_number || ''} - ${order.client || 'Sem cliente'}`;
        let itemsHtml = '';
        if (order.items && order.items.length > 0) {
            itemsHtml = '<div style="background: #f0f0f0; padding: 10px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 6px;">' +
                '<div style="font-size: 13px; font-weight: 900; text-transform: uppercase; color: #555; margin-bottom: 6px;">Produtos do Pedido</div>' +
                order.items.map((i: any) => '<div style="font-size: 18px; padding: 4px 0; border-bottom: 1px solid #e5e5e5;"><span class="editable" style="font-weight: 900;"' + editAttr + '>' + i.quantity + 'x ' + i.name + '</span></div>').join('') +
            '</div>';
        }
        let linkedHtml = '';
        let linkedSale = order.linked_sale_id ? sales.find((s: any) => s.id === order.linked_sale_id) : null;
        if (!linkedSale && order.description) {
            const saleMatch = order.description.match(/\[Vinculado à (VENDA-\d+)\]/);
            if (saleMatch) linkedSale = sales.find((s: any) => s.sale_number === saleMatch[1]);
        }
        if (linkedSale?.items?.length) {
            linkedHtml = '<div style="background: #f0f0f0; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">' +
                '<div style="font-size: 13px; font-weight: 900; text-transform: uppercase; color: #555; margin-bottom: 6px;">Itens da Venda Vinculada (' + linkedSale.sale_number + ')</div>' +
                linkedSale.items.map((i: any) => '<div style="font-size: 18px; padding: 4px 0; border-bottom: 1px solid #e5e5e5;"><span class="editable" style="font-weight: 900;"' + editAttr + '>' + i.quantity + 'x ' + i.name + '</span></div>').join('') +
            '</div>';
        }

        const steps = ['AGUARDANDO APROVAÇÃO', 'GRÁFICA', 'CORTE', 'COSTURA', 'REVISÃO', 'EM FASE DE ENTREGA', 'PEDIDO ENTREGUE'];
        const labels: Record<string, string> = { 'AGUARDANDO APROVAÇÃO': 'APROVAÇÃO', 'GRÁFICA': 'GRÁFICA', 'CORTE': 'CORTE', 'COSTURA': 'COSTURA', 'REVISÃO': 'REVISÃO', 'EM FASE DE ENTREGA': 'ENVIO', 'PEDIDO ENTREGUE': 'ENTREGUE' };
        const currentStepIdx = steps.indexOf(order.status);
        const stepsHtml = steps.map((step, idx) => {
            const isCompleted = idx < currentStepIdx;
            const isCurrent = idx === currentStepIdx;
            const boxClass = isCompleted ? 'completed' : isCurrent ? 'current' : '';
            return `<div class="step-box ${boxClass}"><div class="step-check ${boxClass}">${isCompleted ? '✓' : ''}</div><span class="step-name ${boxClass}">${labels[step]}</span></div>`;
        }).join('');

        return `<!DOCTYPE html><html lang="pt-BR"><head>
            <meta charset="utf-8">
            <title>OS ${order.order_number || ''} - ${order.client || ''}</title>
            ${!forEmail ? '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.3/html2pdf.bundle.min.js"></script>' : ''}
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
                * { margin: 0; padding: 0; box-sizing: border-box; }
                html, body { width: 100%; }
                body { font-family: 'Inter', Arial, sans-serif; padding: 12px; color: #111; background: white; }
                .page { display: flex; flex-direction: column; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; }
                .logo { font-size: 24px; font-weight: 900; font-style: italic; }
                .os-title { text-align: right; }
                .os-title h1 { font-size: 18px; font-weight: 900; }
                .os-title p { font-size: 12px; color: #444; font-weight: 700; margin-top: 1px; }
                .section { margin-bottom: 6px; }
                .section-title { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #444; margin-bottom: 3px; border-bottom: 1px solid #ddd; padding-bottom: 1px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
                .info-block { margin-bottom: 4px; }
                .info-label { font-size: 10px; font-weight: 700; color: #555; text-transform: uppercase; }
                .info-value { font-size: 13px; font-weight: 700; margin-top: 1px; }
                .description-box { background: #f9f9f9; padding: 8px; border-radius: 6px; white-space: pre-wrap; font-size: 13px; font-weight: 800; line-height: 1.3; border: 1px solid #eee; }
                .footer { margin-top: auto; padding-top: 6px; border-top: 1px solid #ddd; font-size: 10px; color: #555; text-align: center; }
                .split-row { display: flex; gap: 10px; align-items: stretch; }
                .split-left { flex: 2; min-width: 0; }
                .split-right { flex: 3; min-width: 0; }
                .split-right img { width: 100%; height: 100%; max-height: 220px; object-fit: contain; border-radius: 6px; }
                .stepper { display: flex; flex-wrap: nowrap; gap: 5px; margin: 6px 0; }
                .step-box { display: flex; align-items: center; justify-content: center; gap: 6px; border: 2px solid #888; border-radius: 6px; padding: 6px 8px; flex: 1 1 0; min-width: 0; }
                .step-box.completed { border-color: #111; background: #f5f5f5; }
                .step-box.current { border-color: #f97316; background: #fff7ed; }
                .step-check { width: 22px; height: 22px; border: 2.5px solid #666; border-radius: 4px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 900; }
                .step-check.completed { border-color: #111; background: #111; color: #fff; }
                .step-check.current { border-color: #f97316; }
                .step-name { font-size: 15px; font-weight: 900; text-transform: uppercase; color: #555; white-space: nowrap; }
                .step-name.completed { color: #111; }
                .step-name.current { color: #f97316; }
                .toolbar { position: sticky; top: 0; background: #111; color: #fff; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: -12px -12px 10px -12px; z-index: 10; }
                .toolbar .info { font-size: 12px; font-weight: 600; }
                .toolbar-actions { display: flex; gap: 8px; align-items: center; }
                .toolbar button { border: none; padding: 8px 14px; font-weight: 900; font-size: 13px; border-radius: 6px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.15s; }
                .toolbar button:disabled { opacity: 0.6; cursor: not-allowed; }
                .btn-print { background: #39FF14; color: #111; }
                .btn-print:hover:not(:disabled) { background: #4fff2a; }
                .btn-send { background: #3b82f6; color: #fff; }
                .btn-send:hover:not(:disabled) { background: #2563eb; }
                .editable { outline: none; border-radius: 3px; padding: 1px 3px; transition: background 0.15s; }
                .editable:hover { background: #fff3cd; cursor: text; }
                .editable:focus { background: #fff3cd; box-shadow: 0 0 0 2px #f97316; }
                @page { margin: 8mm; size: A4 landscape; }
                @media print {
                    html, body { margin: 0 !important; padding: 0 !important; background: white !important; height: auto !important; overflow: visible !important; }
                    body { padding: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    button, .toolbar { display: none !important; }
                    .page { display: block; height: auto !important; overflow: visible !important; }
                    .stepper { page-break-inside: avoid; break-inside: avoid; }
                    .step-box { page-break-inside: avoid; break-inside: avoid; }
                    .info-block { page-break-inside: avoid; break-inside: avoid; }
                    .split-right img { max-height: 140px; }
                    .description-box { page-break-inside: auto; }
                    .editable:hover, .editable:focus { background: transparent !important; box-shadow: none !important; }
                }
            </style></head><body>
            ${!forEmail ? `<div class="toolbar">
                <div class="info">💡 Clique em qualquer texto destacado para editar antes de imprimir ou enviar</div>
                <div class="toolbar-actions">
                    <button class="btn-send" onclick="enviarRelatorioEmail()">📧 Enviar</button>
                    <button class="btn-print" onclick="imprimirRelatorio()">Imprimir / Salvar PDF</button>
                </div>
            </div>
            <script>
                var __apiOrigin = ${JSON.stringify(apiOrigin)};
                var __emailTo = ${JSON.stringify(sendEmailTo)};
                var __emailSubject = ${JSON.stringify(emailSubject)};

                function imprimirRelatorio() {
                    var els = document.querySelectorAll('[contenteditable]');
                    els.forEach(function(e) {
                        e.setAttribute('data-ce', e.getAttribute('contenteditable'));
                        e.removeAttribute('contenteditable');
                    });
                    window.focus();
                    setTimeout(function() {
                        window.print();
                        setTimeout(function() {
                            els.forEach(function(e) {
                                e.setAttribute('contenteditable', e.getAttribute('data-ce') || 'true');
                                e.removeAttribute('data-ce');
                            });
                        }, 200);
                    }, 50);
                }

                async function enviarRelatorioEmail() {
                    if (!__emailTo) {
                        alert('Nenhum e-mail configurado.\\n\\nPara configurar, clique no ícone de envelope no topo do dashboard e informe o e-mail.');
                        return;
                    }
                    if (typeof html2pdf === 'undefined') {
                        alert('Biblioteca de geração de PDF ainda carregando. Aguarde 2 segundos e tente novamente.');
                        return;
                    }
                    if (!confirm('Enviar este relatório em PDF para:\\n\\n' + __emailTo + '\\n\\nAs edições feitas nesta tela serão enviadas no PDF.')) return;

                    var btn = document.querySelector('.btn-send');
                    var oldText = btn.textContent;
                    btn.disabled = true;
                    btn.textContent = 'Gerando PDF...';

                    // Remove contenteditable e toolbar do clone para o PDF
                    var container = document.querySelector('.page').cloneNode(true);
                    container.querySelectorAll('[contenteditable]').forEach(function(e) { e.removeAttribute('contenteditable'); });

                    var opt = {
                        margin: [5, 5, 5, 5],
                        filename: 'OS_' + (${JSON.stringify(order.order_number || 'relatorio')}) + '.pdf',
                        image: { type: 'jpeg', quality: 0.95 },
                        html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: '#ffffff' },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
                        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                    };

                    try {
                        var pdfBlob = await html2pdf().set(opt).from(container).outputPdf('blob');

                        btn.textContent = 'Enviando...';

                        var base64 = await new Promise(function(resolve, reject) {
                            var reader = new FileReader();
                            reader.onload = function() { resolve(reader.result); };
                            reader.onerror = reject;
                            reader.readAsDataURL(pdfBlob);
                        });

                        var res = await fetch(__apiOrigin + '/api/send-report', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                to: __emailTo,
                                subject: __emailSubject,
                                pdfBase64: base64,
                                pdfFilename: opt.filename
                            })
                        });
                        if (res.ok) {
                            btn.textContent = '✓ Enviado!';
                            btn.style.background = '#39FF14';
                            setTimeout(function() {
                                btn.textContent = oldText;
                                btn.disabled = false;
                                btn.style.background = '';
                            }, 2500);
                        } else {
                            var err = await res.json().catch(function() { return {}; });
                            alert('Erro ao enviar: ' + (err.error || 'Erro desconhecido'));
                            btn.textContent = oldText;
                            btn.disabled = false;
                        }
                    } catch (e) {
                        alert('Erro ao gerar/enviar PDF: ' + e.message);
                        btn.textContent = oldText;
                        btn.disabled = false;
                    }
                }
            </script>` : ''}
            <div class="page">
            <div class="header">
                <div class="logo">LIBERA SPORTS</div>
                <div class="os-title"><h1>ORDEM DE SERVIÇO</h1><p>${order.order_number}</p></div>
            </div>
            <div class="section">
                <div class="section-title">Informações do Cliente</div>
                <div class="grid">
                    <div class="info-block"><div class="info-label">Cliente</div><div class="info-value">${order.client || 'Sem cliente'}</div></div>
                    <div class="info-block"><div class="info-label">WhatsApp</div><div class="info-value">${order.client_whatsapp || 'Não informado'}</div></div>
                </div>
            </div>
            <div class="section">
                <div class="section-title">Produtos${hasImagesForReport ? ' / Imagens da Gráfica' : ''}</div>
                <div class="${hasImagesForReport ? 'split-row' : ''}">
                    <div class="${hasImagesForReport ? 'split-left' : ''}">
                        ${itemsHtml}${linkedHtml}
                        ${order.description ? '<div class="description-box editable" style="margin-top: 8px;"' + editAttr + '>' + order.description + '</div>' : ''}
                        ${order.observations ? '<div style="margin-top: 6px; background: #fff8f8; padding: 10px; border-radius: 8px; border: 1px solid #ffeaea; font-size: 14px; white-space: pre-wrap; line-height: 1.4;"><div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #944; margin-bottom: 3px;">Observações</div><span class="editable"' + editAttr + '>' + order.observations + '</span></div>' : ''}
                    </div>
                    ${hasImagesForReport ? '<div class="split-right"><div style="display: flex; flex-wrap: wrap; gap: 4px; height: 100%;">' + imgsForReport.map((img: string) => '<img src="' + img + '" style="flex: 1; min-width: 45%; max-height: ' + (imgsForReport.length === 1 ? '280px' : '135px') + '; object-fit: contain; border-radius: 6px; background: #f9f9f9; border: 1px solid #eee; padding: 4px;" />').join('') + '</div></div>' : ''}
                </div>
            </div>
            <div class="section">
                <div class="section-title">Detalhes do Pedido</div>
                <div class="grid-3">
                    <div class="info-block"><div class="info-label">Data de Entrega</div><div class="info-value">${order.deadline ? new Date(order.deadline).toLocaleDateString('pt-BR') : '-'}</div></div>
                    <div class="info-block"><div class="info-label">Método de Entrega</div><div class="info-value">${order.delivery_method || 'Não informado'}</div></div>
                    <div class="info-block"><div class="info-label">Pagamento</div><div class="info-value">${order.payment_method || 'PIX'}</div></div>
                </div>
            </div>
            <div class="section">
                <div class="section-title">Evolução do Pedido — marque com X as etapas concluídas</div>
                <div class="stepper">${stepsHtml}</div>
            </div>
            <div style="margin-top: 12px; border-top: 2px solid #eee; padding-top: 12px;">
                <div class="info-block"><div class="info-label">Status Atual</div><div class="info-value" style="font-weight: 900; font-size: 18px;">${order.status}</div></div>
            </div>
            <div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')} • Libera Sports</div>
            </div>
        </body></html>`;
    };

    const sendReportByEmail = async (order: any) => {
        if (!reportEmail) return;
        try {
            const html = generateReportHtml(order, true);
            const res = await fetch('/api/send-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    html,
                    to: reportEmail,
                    subject: `Ordem de Serviço - ${order.order_number} - ${order.client || 'Sem cliente'}`
                })
            });
            if (res.ok) {
                toast.success('Relatório enviado por e-mail!');
            } else {
                const err = await res.json();
                console.error('Email error:', err);
                toast.error('Erro ao enviar e-mail: ' + (err.error || 'Erro desconhecido'));
            }
        } catch (error) {
            console.error('Send email error:', error);
            toast.error('Erro ao enviar relatório por e-mail');
        }
    };

    const handlePrintOrder = (order: any) => {
        const uniqueName = `libera_os_${order.order_number || 'report'}_${Date.now()}`;
        const printWindow = window.open('about:blank', uniqueName);
        if (!printWindow) return;

        const html = generateReportHtml(order);
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
    };

    const handleDeleteOrder = async (id: string, number: string) => {
        if (!window.confirm(`Tem certeza que deseja EXCLUIR o pedido ${number}? A venda e as contas financeiras vinculadas serão excluídas.`)) return;

        // Update otimista: sumir da tela imediatamente
        const prevOrders = orders;
        const prevSales = sales;
        setOrders(o => o.filter(x => x.id !== id));
        setSales(s => s.filter(x => x.id !== id));

        try {
            // Busca só as entradas financeiras vinculadas (where em vez de getDocs + filter)
            const finSnap = await getDocs(query(collection(db, financeCollectionPath), where('order_id', '==', id)));
            const batch = writeBatch(db);
            finSnap.docs.forEach(d => batch.delete(doc(db, financeCollectionPath, d.id)));
            batch.delete(doc(db, salesCollectionPath, id));
            await batch.commit();
            toast.success('Pedido e contas financeiras excluídos!');
        } catch (error) {
            console.error('Error deleting order:', error);
            // Rollback otimista
            setOrders(prevOrders);
            setSales(prevSales);
            toast.error('Erro ao excluir pedido');
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
        // Update otimista
        const prev = fornecedores;
        setFornecedores(f => f.filter(x => x.id !== id));
        try {
            await deleteDoc(doc(db, fornecedoresCollectionPath, id));
            toast.success('Fornecedor excluído!');
        } catch (err) {
            setFornecedores(prev);
            toast.error('Erro ao excluir');
        }
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
                <td style="padding:6px 8px;font-size:11px;border-bottom:1px solid #eee;">${(i.supplier_name || '-').substring(0, 40)}</td>
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
                    <th style="padding:8px;font-size:11px;color:#39FF14;text-align:left;font-weight:900;">Fornecedor/Cliente</th>
                    <th style="padding:8px;font-size:11px;color:#39FF14;text-align:left;font-weight:900;">Vencimento</th>
                    <th style="padding:8px;font-size:11px;color:#39FF14;text-align:left;font-weight:900;">Pagamento</th>
                    <th style="padding:8px;font-size:11px;color:#39FF14;text-align:right;font-weight:900;">Valor</th>
                    <th style="padding:8px;font-size:11px;color:#39FF14;text-align:left;font-weight:900;">Status</th>
                </tr></thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot><tr style="background:#1e1e1e;">
                    <td style="padding:8px;font-size:11px;color:#fff;font-weight:900;" colspan="4">${items.length} itens</td>
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
        <div className={`min-h-screen ${t.bg} ${t.text} selection:bg-[#39FF14] selection:text-black font-sans pb-20 transition-colors duration-300 ${!isDark ? 'dashboard-light' : ''}`}>
            {/* Light mode CSS overrides - remaps hardcoded dark-mode classes */}
            {!isDark && (
                <style>{`
                    /* Text: white → dark */
                    .dashboard-light .text-white { color: #111827 !important; }
                    .dashboard-light .text-white\\/70 { color: #374151 !important; }
                    .dashboard-light .text-white\\/60 { color: #4b5563 !important; }
                    .dashboard-light .text-white\\/50 { color: #6b7280 !important; }
                    .dashboard-light .text-white\\/40 { color: #9ca3af !important; }
                    .dashboard-light .text-white\\/30 { color: #9ca3af !important; }

                    /* Text: zinc → readable on light bg */
                    .dashboard-light .text-zinc-300 { color: #374151 !important; }
                    .dashboard-light .text-zinc-400 { color: #6b7280 !important; }
                    .dashboard-light .text-zinc-500 { color: #6b7280 !important; }
                    .dashboard-light .text-zinc-600 { color: #4b5563 !important; }
                    .dashboard-light .text-zinc-800 { color: #1f2937 !important; }

                    /* Background: dark → light */
                    .dashboard-light .bg-black { background-color: #e5e7eb !important; }
                    .dashboard-light .bg-zinc-950 { background-color: #f3f4f6 !important; }
                    .dashboard-light .bg-zinc-900 { background-color: #f9fafb !important; }
                    .dashboard-light .bg-zinc-800 { background-color: #ffffff !important; }
                    .dashboard-light .bg-zinc-700 { background-color: #f3f4f6 !important; }

                    /* Background with opacity */
                    .dashboard-light .bg-zinc-950\\/50 { background-color: rgba(229,231,235,0.5) !important; }
                    .dashboard-light .bg-zinc-950\\/20 { background-color: rgba(229,231,235,0.2) !important; }
                    .dashboard-light .bg-zinc-900\\/50 { background-color: rgba(243,244,246,0.5) !important; }
                    .dashboard-light .bg-zinc-900\\/40 { background-color: rgba(243,244,246,0.4) !important; }
                    .dashboard-light .bg-zinc-900\\/30 { background-color: rgba(243,244,246,0.3) !important; }
                    .dashboard-light .bg-zinc-800\\/50 { background-color: rgba(229,231,235,0.5) !important; }
                    .dashboard-light .bg-zinc-800\\/30 { background-color: rgba(229,231,235,0.3) !important; }

                    /* Borders */
                    .dashboard-light .border-zinc-600 { border-color: #d1d5db !important; }
                    .dashboard-light .border-zinc-700 { border-color: #e5e7eb !important; }
                    .dashboard-light .border-zinc-800 { border-color: #e5e7eb !important; }
                    .dashboard-light .border-zinc-900 { border-color: #d1d5db !important; }
                    .dashboard-light .border-zinc-950 { border-color: #d1d5db !important; }
                    .dashboard-light .border-zinc-900\\/50 { border-color: rgba(209,213,219,0.5) !important; }

                    /* Dividers */
                    .dashboard-light .divide-zinc-700 > * + * { border-color: #e5e7eb !important; }
                    .dashboard-light .divide-zinc-800 > * + * { border-color: #e5e7eb !important; }
                    .dashboard-light .divide-zinc-900 > * + * { border-color: #d1d5db !important; }

                    /* Hover states */
                    .dashboard-light .hover\\:text-white:hover { color: #111827 !important; }
                    .dashboard-light .hover\\:text-white\\/60:hover { color: #4b5563 !important; }
                    .dashboard-light .hover\\:bg-zinc-700:hover { background-color: #e5e7eb !important; }
                    .dashboard-light .hover\\:bg-zinc-800:hover { background-color: #f3f4f6 !important; }
                    .dashboard-light .hover\\:bg-zinc-900:hover { background-color: #f3f4f6 !important; }
                    .dashboard-light .hover\\:bg-white\\/10:hover { background-color: rgba(0,0,0,0.05) !important; }
                    .dashboard-light .hover\\:border-zinc-600:hover { border-color: #d1d5db !important; }
                    .dashboard-light .hover\\:border-zinc-700:hover { border-color: #d1d5db !important; }

                    /* Group hover */
                    .dashboard-light .group:hover .group-hover\\:text-white { color: #111827 !important; }

                    /* Placeholder */
                    .dashboard-light .placeholder\\:text-zinc-400::placeholder { color: #9ca3af !important; }
                    .dashboard-light .placeholder\\:text-zinc-600::placeholder { color: #6b7280 !important; }

                    /* Ring & Shadow */
                    .dashboard-light .ring-zinc-500 { --tw-ring-color: #d1d5db !important; }
                    .dashboard-light .focus\\:ring-zinc-500:focus { --tw-ring-color: #d1d5db !important; }
                    .dashboard-light .shadow-white { --tw-shadow-color: rgba(0,0,0,0.1) !important; }
                `}</style>
            )}
            {/* Navbar */}
            <nav className={`px-6 py-4 border-b ${t.border} ${t.nav} sticky top-0 z-50 flex justify-between items-center transition-colors duration-300`}>
                <button
                    onClick={() => setActiveTab('HOME')}
                    className={`font-black text-xl italic uppercase flex items-center gap-2 tracking-tighter pl-1 hover:text-[#39FF14] transition-colors ${t.text}`}
                >
                    LIBERA SPORTS
                </button>
                <div className="flex items-center gap-4">
                    {isAdmin && (
                        <button
                            onClick={() => setShowActivityLog(true)}
                            className={`p-2 rounded-xl transition-all hover:scale-110 ${isDark ? 'text-white/50 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-black hover:bg-gray-200'}`}
                            title="Histórico de movimentações"
                        >
                            <History size={18} />
                        </button>
                    )}
                    <button
                        onClick={toggleTheme}
                        className={`p-2 rounded-xl transition-all hover:scale-110 ${isDark ? 'text-yellow-400 hover:bg-yellow-400/10' : 'text-gray-600 hover:bg-gray-200'}`}
                        title={isDark ? 'Modo claro' : 'Modo escuro'}
                    >
                        {isDark ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                    <button
                        onClick={() => {
                            window.location.reload();
                        }}
                        className={`p-2 rounded-xl transition-all hover:scale-110 ${isDark ? 'text-white/70 hover:text-[#39FF14]' : 'text-gray-500 hover:text-green-600'}`}
                        title="Atualizar sistema"
                    >
                        <RefreshCw size={18} />
                    </button>
                    <button
                        onClick={async () => {
                            const email = prompt('E-mail para receber relatórios automaticamente ao aprovar pedidos:\n\n(Deixe vazio para desativar)', reportEmail);
                            if (email !== null) {
                                const trimmed = email.trim();
                                setReportEmail(trimmed);
                                try {
                                    await setDoc(doc(db, settingsDocPath), { report_email: trimmed }, { merge: true });
                                    toast.success(trimmed ? `Relatórios serão enviados para ${trimmed}` : 'Envio automático de relatório desativado');
                                } catch (e) { toast.error('Erro ao salvar configuração'); }
                            }
                        }}
                        className={`p-2 rounded-xl transition-all hover:scale-110 ${reportEmail ? (isDark ? 'text-[#39FF14]' : 'text-green-600') : (isDark ? 'text-white/40' : 'text-gray-400')}`}
                        title={reportEmail ? `Relatórios → ${reportEmail}` : 'Configurar e-mail do relatório'}
                    >
                        <Mail size={18} />
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
                                    ...(!isRestricted ? [
                                        { id: 'FINANCEIRO', icon: Wallet, label: 'Financeiro', color: 'group-hover:text-orange-400' },
                                        { id: 'CAIXA', icon: DollarSign, label: 'Caixa', color: 'group-hover:text-emerald-400' },
                                    ] : []),
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
                            <p className="mt-4 text-[#39FF14] text-sm font-black uppercase tracking-[0.3em]">
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
                            ...(!isRestricted ? [
                                { id: 'FINANCEIRO', icon: Wallet, label: 'Financeiro' },
                                { id: 'CAIXA', icon: DollarSign, label: 'Caixa' }
                            ] : [])
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
                                        <span className={`text-sm font-black uppercase tracking-widest mb-1 transition-colors ${isActive ? (step === 'PENDÊNCIA' ? 'text-black' : 'text-black') : 'text-white group-hover:text-white'}`}>
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
                                                        <span className="text-white/70 text-sm font-black uppercase tracking-widest">{order.order_number}</span>
                                                        <h3 className="text-sm font-black text-white group-hover:text-[#39FF14] transition-colors truncate">{order.client || 'Sem cliente'}</h3>
                                                    </div>
                                                    <div className="hidden md:flex flex-col">
                                                        <span className="text-white text-sm font-black uppercase tracking-widest">Entrega</span>
                                                        <span className="text-sm text-white/70 font-bold">{order.deadline ? order.deadline.split('-').reverse().join('/') : '-'}</span>
                                                    </div>
                                                    <div className="hidden lg:flex flex-col max-w-[200px]">
                                                        <span className="text-white text-sm font-black uppercase tracking-widest">Grade</span>
                                                        <span className="text-sm text-white font-medium truncate">{order.description}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-6 shrink-0">
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
                                                        <span className="bg-zinc-900 text-white/70 px-1.5 py-0.5 rounded text-sm font-bold flex items-center gap-1">
                                                            <Clock size={9} /> {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                                        </span>
                                                        <span className="bg-zinc-900 text-white/70 px-1.5 py-0.5 rounded text-sm font-bold flex items-center gap-1">
                                                            <Calendar size={9} /> {order.deadline ? order.deadline.split('-').reverse().join('/') : '-'}
                                                        </span>
                                                        <span className="bg-zinc-900 text-[#39FF14] px-1.5 py-0.5 rounded text-sm font-bold flex items-center gap-1 uppercase">
                                                            <Truck size={9} /> {order.delivery_method || '-'}
                                                        </span>
                                                        <span className="bg-zinc-900 text-orange-500 px-1.5 py-0.5 rounded text-sm font-bold flex items-center gap-1 uppercase">
                                                            <TrendingUp size={9} /> {order.payment_method || 'PIX'}
                                                        </span>
                                                        {(order.total || order.value) ? (
                                                            <span className="bg-[#39FF14]/10 text-[#39FF14] px-2 py-0.5 rounded text-sm font-black flex items-center gap-1">
                                                                R$ {(order.total || order.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </span>
                                                        ) : null}
                                                    </div>

                                                    <div className="flex-1">
                                                        <div className="flex items-center justify-between mb-4 gap-2">
                                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-900 group-hover:border-white/30 transition-all shadow-inner shrink-0">
                                                                    <User className="text-[#39FF14]" size={18} />
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <h3 className="text-sm md:text-xl font-black tracking-tighter text-white uppercase italic">
                                                                        {order.client || 'Sem cliente'}
                                                                    </h3>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <span className="text-white/70 text-sm font-black uppercase tracking-widest">{order.order_number}</span>
                                                                        <span className="w-1 h-1 rounded-full bg-zinc-800" />
                                                                        <span className="text-white text-sm font-bold uppercase flex items-center gap-1">
                                                                            <Truck size={10} /> {order.delivery_method || '-'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {order.status === 'PENDÊNCIA' && order.pending_reason && (
                                                            <div className="bg-[#FF3D00]/10 border border-[#FF3D00]/20 p-3 rounded-xl mb-3 mt-2 flex items-start gap-2">
                                                                <AlertCircle className="text-[#FF3D00] shrink-0" size={14} />
                                                                <div>
                                                                    <p className="text-[#FF3D00] text-sm font-black uppercase tracking-widest mb-0.5">Pendência</p>
                                                                    <p className="text-white text-sm font-medium">{order.pending_reason}</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Ações */}
                                                    <div className="flex items-center justify-end mt-1 mb-2">
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
                                                            {expandedObs[order.id] ? 'Fechar Observações' : order.observations ? 'Ver Observações Internas' : 'Deseja adicionar alguma observação?'}
                                                            {order.observations && !expandedObs[order.id] && (
                                                                <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14] ml-1 animate-pulse" />
                                                            )}
                                                        </button>

                                                        {expandedObs[order.id] && (
                                                            <div className="mt-4 bg-black/50 border border-zinc-950 rounded-2xl p-4 animate-in slide-in-from-top-2 duration-300">
                                                                <div className="flex justify-between items-center mb-3">
                                                                    <label className="text-sm font-black uppercase tracking-[0.2em] text-[#39FF14]/70">Notas de Produção</label>
                                                                    <button
                                                                        onClick={() => {
                                                                            setEditingObsId(order.id);
                                                                            setObsValue(order.observations || '');
                                                                        }}
                                                                        className="text-sm font-black uppercase text-white hover:text-[#39FF14] transition-colors"
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

                                                    {/* Imagens da Gráfica */}
                                                    <div className="mt-4 border-t border-zinc-900 pt-4">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <span className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                                                                <Paperclip size={12} className="text-[#39FF14]" /> Imagens da Gráfica ({getProductionImages(order).length}/5)
                                                            </span>
                                                        </div>
                                                        {getProductionImages(order).length > 0 && (
                                                            <div className="grid grid-cols-2 gap-2 mb-3">
                                                                {getProductionImages(order).map((img: string, idx: number) => (
                                                                    <div key={idx} className="relative group/img">
                                                                        <img
                                                                            src={img}
                                                                            alt={`Imagem ${idx + 1}`}
                                                                            className="w-full h-[140px] object-contain rounded-xl border border-zinc-800 bg-zinc-950 cursor-pointer"
                                                                            onClick={() => window.open(img, '_blank')}
                                                                        />
                                                                        <button
                                                                            onClick={() => handleRemoveProductionImage(order.id, idx)}
                                                                            className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-black opacity-0 group-hover/img:opacity-100 transition-opacity"
                                                                        >
                                                                            ✕
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {getProductionImages(order).length < 5 && (
                                                            <label className="block cursor-pointer">
                                                                <div className="bg-zinc-950 border border-dashed border-zinc-700 rounded-xl p-4 text-center hover:border-[#39FF14]/50 transition-all">
                                                                    <Paperclip size={20} className="mx-auto mb-1 text-white/30" />
                                                                    <p className="text-sm font-black uppercase text-white/50">Anexar imagem</p>
                                                                    <p className="text-xs text-white/30 mt-1">Máx 300KB • Até 5 imagens</p>
                                                                </div>
                                                                <input type="file" accept="image/*" className="hidden" onChange={e => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) handleUploadProductionImage(order.id, file);
                                                                }} />
                                                            </label>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center justify-between mt-4">
                                                        <p className="text-white/70 text-sm italic line-clamp-1">Grade: {order.description || '-'}</p>
                                                        <div className="flex items-center gap-4">
                                                            <button
                                                                onClick={() => setExpandedHistoryIds(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                                                                className="text-sm font-black uppercase tracking-widest text-white hover:text-[#39FF14] transition-colors flex items-center gap-1"
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
                                                                            <span className="text-sm text-white font-bold uppercase mt-0.5">Operador: <span className="text-white">{log.operator_name}</span></span>
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

                        <input
                            type="text"
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                            placeholder="Buscar produto por nome..."
                            className="w-full bg-zinc-800 border border-zinc-900 rounded-xl p-3 text-white outline-none focus:border-[#39FF14] transition-colors text-sm font-bold placeholder:text-zinc-600 mb-4"
                        />

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
                                {groupedProducts
                                    .filter(([key, g]) => !productSearch || key.toLowerCase().includes(productSearch.toLowerCase()) || g.baseName.toLowerCase().includes(productSearch.toLowerCase()))
                                    .map(([key, group]) => {
                                        const editingVariant = group.variants.find((v: any) => v.id === editingProductId);
                                        return (
                                    <div key={key} className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-[32px] hover:border-[#39FF14]/30 transition-all">
                                        {/* Header: imagem + nome base + tags + ações */}
                                        <div className="flex gap-4 mb-4">
                                            {/* Imagem com botão de trocar foto sobreposto */}
                                            <div className="relative group/img shrink-0">
                                                {group.image ? (
                                                    <div className="w-24 h-24 rounded-2xl overflow-hidden border border-zinc-800">
                                                        <img src={group.image} alt={group.baseName} className="w-full h-full object-cover" />
                                                    </div>
                                                ) : (
                                                    <div className="w-24 h-24 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                                                        <Box size={32} className="text-[#39FF14]/50" />
                                                    </div>
                                                )}
                                                <label className="absolute inset-0 bg-black/60 rounded-2xl flex flex-col items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity cursor-pointer">
                                                    <Pencil size={18} className="text-white mb-1" />
                                                    <span className="text-[9px] font-black uppercase text-white">Trocar foto</span>
                                                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (!file) return;
                                                        if (file.size > 500000) { toast.error('Imagem muito grande (máx 500KB)'); return; }
                                                        const reader = new FileReader();
                                                        reader.onload = async () => {
                                                            const newImage = reader.result as string;
                                                            try {
                                                                const batch = writeBatch(db);
                                                                group.variants.forEach((v: any) => {
                                                                    batch.update(doc(db, productsCollectionPath, v.id), { image: newImage });
                                                                });
                                                                await batch.commit();
                                                                toast.success('Foto atualizada!');
                                                            } catch (err) { toast.error('Erro ao atualizar foto'); }
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }} />
                                                </label>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h3 className="text-base font-black italic uppercase text-white leading-tight">{group.baseName}</h3>
                                                            {group.showInStore && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-[#39FF14]/20 text-[#39FF14]">LOJA</span>}
                                                            {group.prontaEntrega ? <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">PRONTA ENTREGA</span> : <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">SOB ENCOMENDA</span>}
                                                        </div>
                                                        {group.details && <p className="text-sm text-white/50 mt-0.5">{group.details}</p>}
                                                    </div>
                                                    {/* Botões de ação do produto */}
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            onClick={() => {
                                                                const first = group.variants[0];
                                                                setEditingProductId(first.id);
                                                                setEditProductName(first.name);
                                                                setEditProductDetails(first.details || '');
                                                                setEditProductSalePrice((first.sale_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                                                                setEditProductCostPrice((first.cost_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                                                                setEditProductStock(String(first.stock || 0));
                                                                setEditProductImage(first.image || '');
                                                                setEditProductImages(first.images || []);
                                                                setEditProductShowInStore(first.show_in_store || false);
                                                                setEditProductProntaEntrega(first.pronta_entrega || false);
                                                            }}
                                                            className="p-2 rounded-xl text-white/40 hover:text-[#39FF14] hover:bg-[#39FF14]/10 transition-all"
                                                            title="Editar produto"
                                                        >
                                                            <Pencil size={16} />
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                if (!confirm(`Excluir "${group.baseName}" e TODOS os ${group.variants.length} tamanho(s)? Esta ação não pode ser desfeita.`)) return;
                                                                const prev = products;
                                                                const idsToDelete = group.variants.map((v: any) => v.id);
                                                                setProducts(list => list.filter(p => !idsToDelete.includes(p.id)));
                                                                try {
                                                                    const batch = writeBatch(db);
                                                                    idsToDelete.forEach((id: string) => batch.delete(doc(db, productsCollectionPath, id)));
                                                                    await batch.commit();
                                                                    toast.success(`"${group.baseName}" excluído!`);
                                                                } catch (err) {
                                                                    setProducts(prev);
                                                                    toast.error('Erro ao excluir produto');
                                                                }
                                                            }}
                                                            className="p-2 rounded-xl text-white/40 hover:text-red-500 hover:bg-red-500/10 transition-all"
                                                            title="Excluir produto inteiro"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="mt-2">
                                                    <p className="text-sm text-white/70 font-bold uppercase mb-1">Total em Estoque</p>
                                                    <p className={`text-2xl font-black ${group.totalStock <= 5 ? 'text-orange-500' : 'text-white'}`}>
                                                        {group.totalStock} un
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Quadradinhos de tamanho */}
                                        <div className="pt-4 border-t border-zinc-800">
                                            <p className="text-xs text-white/70 font-bold uppercase mb-2">Tamanhos & Estoque (clique para editar)</p>
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {group.variants.map((v: any) => {
                                                    const isEditing = editingProductId === v.id;
                                                    const stk = v.stock || 0;
                                                    const outOfStock = stk === 0;
                                                    const lowStock = stk > 0 && stk <= 5;
                                                    return (
                                                        <button
                                                            key={v.id}
                                                            onClick={() => {
                                                                if (isEditing) { setEditingProductId(null); return; }
                                                                setEditingProductId(v.id);
                                                                setEditProductName(v.name);
                                                                setEditProductDetails(v.details || '');
                                                                setEditProductSalePrice((v.sale_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                                                                setEditProductCostPrice((v.cost_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
                                                                setEditProductStock(String(v.stock || 0));
                                                                setEditProductImage(v.image || '');
                                                                setEditProductImages(v.images || []);
                                                                setEditProductShowInStore(v.show_in_store || false);
                                                                setEditProductProntaEntrega(v.pronta_entrega || false);
                                                            }}
                                                            className={`relative min-w-[64px] px-2 py-2 rounded-xl border-2 text-center transition-all ${
                                                                isEditing
                                                                    ? 'border-[#39FF14] bg-[#39FF14]/10 ring-2 ring-[#39FF14]/40'
                                                                    : outOfStock
                                                                        ? 'border-red-500/40 bg-red-500/5 opacity-60 hover:opacity-100'
                                                                        : lowStock
                                                                            ? 'border-orange-500/50 bg-orange-500/5 hover:border-orange-500'
                                                                            : 'border-zinc-700 bg-zinc-950 hover:border-[#39FF14]/50'
                                                            }`}
                                                            title={`Editar tamanho ${v.extractedSize || 'único'}`}
                                                        >
                                                            <div className="text-[10px] font-black uppercase text-white/60 tracking-wider">{v.extractedSize || 'ÚNICO'}</div>
                                                            <div className={`text-lg font-black ${outOfStock ? 'text-red-500' : lowStock ? 'text-orange-500' : 'text-white'}`}>
                                                                {stk}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                                <button
                                                    onClick={async () => {
                                                        const tam = prompt('Digite o novo tamanho (ex: PP, P, M, G, GG, XG):');
                                                        if (!tam) return;
                                                        const sizeUpper = tam.trim().toUpperCase();
                                                        if (!sizeUpper) return;
                                                        if (group.variants.some((v: any) => (v.extractedSize || '').toUpperCase() === sizeUpper)) {
                                                            toast.error(`Tamanho ${sizeUpper} já existe nesse produto`);
                                                            return;
                                                        }
                                                        const first = group.variants[0];
                                                        const newName = `${group.baseName} - ${sizeUpper}`.toUpperCase();
                                                        try {
                                                            await addDoc(collection(db, productsCollectionPath), {
                                                                name: newName,
                                                                details: first.details || '',
                                                                sale_price: first.sale_price || 0,
                                                                cost_price: first.cost_price || 0,
                                                                stock: 0,
                                                                image: first.image || '',
                                                                images: first.images || [],
                                                                show_in_store: first.show_in_store || false,
                                                                pronta_entrega: first.pronta_entrega || false,
                                                                created_at: new Date().toISOString(),
                                                                user_id: userId,
                                                            });
                                                            toast.success(`Tamanho ${sizeUpper} adicionado!`);
                                                        } catch (err) {
                                                            toast.error('Erro ao adicionar tamanho');
                                                        }
                                                    }}
                                                    className="min-w-[64px] px-2 py-2 rounded-xl border-2 border-dashed border-zinc-700 hover:border-[#39FF14]/60 bg-zinc-950 text-white/50 hover:text-[#39FF14] transition-all flex flex-col items-center justify-center gap-0.5"
                                                    title="Adicionar novo tamanho"
                                                >
                                                    <div className="text-[10px] font-black uppercase tracking-wider">NOVO</div>
                                                    <Plus size={16} />
                                                </button>
                                            </div>

                                            {/* Formulário de edição — aparece abaixo dos quadradinhos */}
                                            {editingVariant && (
                                                <div className="mb-3 p-3 bg-zinc-950 border border-[#39FF14]/30 rounded-xl space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-xs font-black uppercase text-[#39FF14] tracking-wider">Editando: {editingVariant.extractedSize || 'ÚNICO'}</p>
                                                        <button onClick={() => setEditingProductId(null)} className="text-white/50 hover:text-white">
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-white/70 font-bold uppercase mb-1">Nome</p>
                                                        <input type="text" value={editProductName} onChange={e => setEditProductName(e.target.value)}
                                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-white font-bold uppercase outline-none focus:border-[#39FF14]" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-white/70 font-bold uppercase mb-1">Detalhes</p>
                                                        <textarea value={editProductDetails} onChange={e => setEditProductDetails(e.target.value)}
                                                            placeholder="Detalhes do produto..." rows={2}
                                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-white outline-none focus:border-[#39FF14] resize-none" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-white/70 font-bold uppercase mb-1">Foto principal</p>
                                                        <div className="flex items-center gap-3">
                                                            {editProductImage ? (
                                                                <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-zinc-700 shrink-0">
                                                                    <img src={editProductImage} alt="Preview" className="w-full h-full object-cover" />
                                                                    <button type="button" onClick={() => setEditProductImage('')}
                                                                        className="absolute -top-1 -right-1 bg-red-500 text-[#fff] rounded-full w-4 h-4 flex items-center justify-center">
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
                                                                    <p className="text-xs font-bold text-white uppercase">{editProductImage ? 'Trocar' : 'Escolher foto'}</p>
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
                                                    <div>
                                                        <p className="text-xs text-white/70 font-bold uppercase mb-1">Fotos Extras ({editProductImages.length}/3)</p>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            {editProductImages.map((img, idx) => (
                                                                <div key={idx} className="relative w-12 h-12 rounded-lg overflow-hidden border border-zinc-700 shrink-0">
                                                                    <img src={img} alt={`Extra ${idx + 1}`} className="w-full h-full object-cover" />
                                                                    <button type="button" onClick={() => setEditProductImages(editProductImages.filter((_, i) => i !== idx))}
                                                                        className="absolute -top-1 -right-1 bg-red-500 text-[#fff] rounded-full w-4 h-4 flex items-center justify-center">
                                                                        <X size={8} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            {editProductImages.length < 3 && (
                                                                <label className="w-12 h-12 rounded-lg border border-dashed border-zinc-700 flex items-center justify-center cursor-pointer hover:border-[#39FF14]/50 transition-all shrink-0">
                                                                    <Plus size={14} className="text-white/50" />
                                                                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                                                                        const file = e.target.files?.[0];
                                                                        if (!file) return;
                                                                        if (file.size > 200000) { toast.error('Imagem muito grande (máx 200KB)'); return; }
                                                                        const reader = new FileReader();
                                                                        reader.onload = () => setEditProductImages([...editProductImages, reader.result as string]);
                                                                        reader.readAsDataURL(file);
                                                                    }} />
                                                                </label>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div>
                                                            <p className="text-xs text-white/70 font-bold uppercase mb-1">Preço Venda</p>
                                                            <input type="text" value={editProductSalePrice} onChange={e => setEditProductSalePrice(formatCurrency(e.target.value))}
                                                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-white font-bold outline-none focus:border-[#39FF14]" />
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-white/70 font-bold uppercase mb-1">Preço Custo</p>
                                                            <input type="text" value={editProductCostPrice} onChange={e => setEditProductCostPrice(formatCurrency(e.target.value))}
                                                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-white font-bold outline-none focus:border-[#39FF14]" />
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-white/70 font-bold uppercase mb-1">Estoque</p>
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
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="checkbox" checked={editProductShowInStore} onChange={e => setEditProductShowInStore(e.target.checked)} className="w-4 h-4 rounded accent-[#39FF14]" />
                                                        <span className="text-xs font-black uppercase text-white/70">Visível na Loja</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="checkbox" checked={editProductProntaEntrega} onChange={e => setEditProductProntaEntrega(e.target.checked)} className="w-4 h-4 rounded accent-[#39FF14]" />
                                                        <span className="text-xs font-black uppercase text-white/70">Pronta Entrega</span>
                                                    </label>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <button onClick={async () => {
                                                            try {
                                                                const updateData: any = {
                                                                    name: editProductName.trim().toUpperCase(),
                                                                    details: editProductDetails.trim(),
                                                                    sale_price: parseBRL(editProductSalePrice),
                                                                    cost_price: parseBRL(editProductCostPrice),
                                                                    stock: parseInt(editProductStock) || 0,
                                                                    image: editProductImage || '',
                                                                    images: editProductImages,
                                                                    show_in_store: editProductShowInStore,
                                                                    pronta_entrega: editProductProntaEntrega,
                                                                };
                                                                await updateDoc(doc(db, productsCollectionPath, editingVariant.id), updateData);
                                                                toast.success('Tamanho atualizado!');
                                                                setEditingProductId(null);
                                                            } catch (err) { toast.error('Erro ao atualizar'); }
                                                        }}
                                                            className="px-4 h-9 rounded-lg bg-[#39FF14] text-black text-xs font-black uppercase hover:scale-105 transition-all">Salvar</button>
                                                        <button onClick={() => setEditingProductId(null)}
                                                            className="px-3 h-9 rounded-lg text-white/50 hover:text-white text-xs font-black uppercase">Cancelar</button>
                                                        <button onClick={async () => {
                                                            if (confirm(`Excluir o tamanho ${editingVariant.extractedSize || 'ÚNICO'} deste produto?`)) {
                                                                const prev = products;
                                                                setProducts(list => list.filter(p => p.id !== editingVariant.id));
                                                                setEditingProductId(null);
                                                                try {
                                                                    await deleteDoc(doc(db, productsCollectionPath, editingVariant.id));
                                                                    toast.success('Tamanho excluído!');
                                                                } catch (err) {
                                                                    setProducts(prev);
                                                                    toast.error('Erro ao excluir');
                                                                }
                                                            }
                                                        }}
                                                            className="ml-auto px-3 h-9 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs font-black uppercase flex items-center gap-1">
                                                            <Trash2 size={12} /> Excluir tamanho
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Rodapé: preço e variantes */}
                                            <div className="flex items-end justify-between pt-3 border-t border-zinc-800">
                                                <div className="grid grid-cols-2 gap-4 flex-1">
                                                    <div>
                                                        <p className="text-sm text-white/70 font-bold uppercase">Preço Venda</p>
                                                        <p className="text-lg font-black text-[#39FF14]">
                                                            {group.minPrice === group.maxPrice
                                                                ? `R$ ${group.minPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                                                : `R$ ${group.minPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} a ${group.maxPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-white/70 font-bold uppercase">Variantes</p>
                                                        <p className="text-lg font-black text-white/70">{group.variants.length} {group.variants.length === 1 ? 'tamanho' : 'tamanhos'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                        );
                                    })}
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
                            <button
                                onClick={() => { setCadastroFilter('CLIENTE'); setShowCadastros(true); }}
                                className="bg-zinc-800 text-white px-4 md:px-5 py-2.5 md:py-3 rounded-2xl font-black uppercase text-sm tracking-widest hover:scale-105 transition-all flex items-center gap-1.5 shrink-0 border border-zinc-700"
                            >
                                <User size={14} /> Clientes
                            </button>
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
                                    className="w-full bg-zinc-800 border border-zinc-900 rounded-xl p-3 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600"
                                />
                                <div className="grid grid-cols-1 gap-3 max-h-[600px] overflow-y-auto pr-1">
                                    {groupedProducts
                                        .filter(([key, g]) => !productSearch || g.baseName.toLowerCase().includes(productSearch.toLowerCase()))
                                        .map(([key, group]) => {
                                            const currentQty = saleQtyByGroup[key] || 1;
                                            const setQty = (n: number) => setSaleQtyByGroup(prev => ({ ...prev, [key]: Math.max(1, n) }));
                                            return (
                                        <div key={key} className="bg-zinc-950 border border-zinc-900 p-4 rounded-2xl hover:border-[#39FF14]/30 transition-all">
                                            <div className="flex items-center gap-3 mb-3">
                                                {group.image ? (
                                                    <div className="w-12 h-12 rounded-xl overflow-hidden border border-zinc-800 shrink-0">
                                                        <img src={group.image} alt={group.baseName} className="w-full h-full object-cover" />
                                                    </div>
                                                ) : (
                                                    <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                                                        <Box size={20} className="text-[#39FF14]/50" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-black text-white leading-tight break-words">{group.baseName}</p>
                                                    <p className="text-[11px] text-white/70 font-bold uppercase mt-1">
                                                        {group.minPrice === group.maxPrice
                                                            ? `R$ ${group.minPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                                            : `R$ ${group.minPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${group.maxPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                                        {` • ${group.totalStock} un total`}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Quadradinhos de tamanho */}
                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                                {group.variants.map((v: any) => {
                                                    const stk = v.stock || 0;
                                                    const outOfStock = stk === 0;
                                                    const lowStock = stk > 0 && stk <= 5;
                                                    const inCart = cart.find((c: any) => c.id === v.id);
                                                    return (
                                                        <button
                                                            key={v.id}
                                                            onClick={() => {
                                                                if (outOfStock) return;
                                                                addToCart(v, currentQty);
                                                                // Reseta qtd para 1 após adicionar
                                                                setSaleQtyByGroup(prev => ({ ...prev, [key]: 1 }));
                                                            }}
                                                            disabled={outOfStock}
                                                            className={`relative min-w-[58px] px-2 py-1.5 rounded-lg border-2 text-center transition-all ${
                                                                outOfStock
                                                                    ? 'border-red-500/30 bg-red-500/5 opacity-40 cursor-not-allowed'
                                                                    : lowStock
                                                                        ? 'border-orange-500/50 bg-orange-500/5 hover:border-orange-500 hover:scale-105'
                                                                        : 'border-zinc-700 bg-zinc-900 hover:border-[#39FF14] hover:bg-[#39FF14]/10 hover:scale-105'
                                                            }`}
                                                            title={outOfStock ? `${v.extractedSize || 'Único'}: sem estoque` : `Adicionar ${currentQty} un do tamanho ${v.extractedSize || 'único'}`}
                                                        >
                                                            <div className="text-[9px] font-black uppercase text-white/60 tracking-wider">{v.extractedSize || 'ÚN'}</div>
                                                            <div className={`text-sm font-black ${outOfStock ? 'text-red-500' : lowStock ? 'text-orange-500' : 'text-white'}`}>
                                                                {stk}
                                                            </div>
                                                            {inCart && (
                                                                <span className="absolute -top-1.5 -right-1.5 bg-[#39FF14] text-black text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                                                                    {inCart.quantity}
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Seletor de quantidade (afeta próximo clique no tamanho) */}
                                            <div className="flex items-center gap-2 pt-2 border-t border-zinc-900">
                                                <span className="text-[10px] font-black uppercase text-white/50 tracking-wider">Qtd p/ clique:</span>
                                                <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5">
                                                    <button
                                                        onClick={() => setQty(currentQty - 1)}
                                                        className="w-6 h-6 rounded-md bg-zinc-800 text-white font-black text-xs flex items-center justify-center hover:bg-zinc-700 transition-colors"
                                                    >−</button>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={currentQty}
                                                        onChange={e => setQty(parseInt(e.target.value) || 1)}
                                                        className="w-10 h-6 bg-zinc-950 text-white text-center text-xs font-black outline-none rounded-md border border-zinc-800"
                                                    />
                                                    <button
                                                        onClick={() => setQty(currentQty + 1)}
                                                        className="w-6 h-6 rounded-md bg-zinc-800 text-white font-black text-xs flex items-center justify-center hover:bg-zinc-700 transition-colors"
                                                    >+</button>
                                                </div>
                                                {currentQty > 1 && (
                                                    <span className="text-[10px] font-bold text-[#39FF14] uppercase tracking-wider">
                                                        ▸ +{currentQty} ao clicar
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                            );
                                        })}
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
                                                    <p className="text-sm font-black text-white uppercase truncate">{item.name}</p>
                                                    <p className="text-sm text-white font-bold uppercase">R$ {item.sale_price.toLocaleString('pt-BR')} un</p>
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
                                                        className="w-10 h-7 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-center text-sm font-black outline-none focus:border-[#39FF14]"
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

                                {/* BLOCO 1 — CLIENTE */}
                                <div className="space-y-2 pb-4 mb-4 border-b border-zinc-800">
                                    <div className="relative">
                                        <label className="block text-xs font-black uppercase tracking-widest text-white mb-1">Cliente</label>
                                        <input type="text" value={saleClient}
                                            onChange={e => { setSaleClient(e.target.value); setShowClientSuggestions(e.target.value.length > 0); }}
                                            onFocus={() => { if (saleClient.length > 0) setShowClientSuggestions(true); }}
                                            onBlur={() => setTimeout(() => setShowClientSuggestions(false), 200)}
                                            placeholder="Nome do cliente..."
                                            className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
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
                                            <label className="block text-xs font-black uppercase tracking-widest text-white mb-1">WhatsApp</label>
                                            <input type="text" value={saleWhatsapp} onChange={e => setSaleWhatsapp(e.target.value)} placeholder="(00) 00000-0000" className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black uppercase tracking-widest text-white mb-1">CPF/CNPJ</label>
                                            <input type="text" value={saleCpfCnpj} onChange={e => { const formatted = formatCpfCnpj(e.target.value); setSaleCpfCnpj(formatted); const d = e.target.value.replace(/\D/g, ''); if (d.length === 11 || d.length === 14) setSaleCpfCnpjError(validateCpfCnpj(d) ? '' : 'Inválido'); else setSaleCpfCnpjError(''); }} placeholder="000.000.000-00" className={`w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 text-sm font-bold placeholder:text-zinc-600 ${saleCpfCnpjError ? 'ring-1 ring-red-500' : 'focus:ring-[#39FF14]'}`} />
                                            {saleCpfCnpjError && <p className="text-red-500 text-xs font-bold mt-0.5">{saleCpfCnpjError}</p>}
                                        </div>
                                    </div>
                                </div>

                                {/* BLOCO 2 — PEDIDO */}
                                <div className="space-y-2 pb-4 mb-4 border-b border-zinc-800">
                                    <div>
                                        <button type="button" onClick={() => setShowDescription(!showDescription)} className="flex items-center gap-2 w-full text-left">
                                            <span className="text-xs font-black uppercase tracking-widest text-white">{showDescription ? '▼' : '▶'} Descrição / Grade</span>
                                            {!showDescription && saleDescription && <span className="text-xs text-zinc-500 truncate flex-1">{saleDescription}</span>}
                                        </button>
                                        {showDescription && (
                                            <textarea value={saleDescription} onChange={e => setSaleDescription(e.target.value)} placeholder="Detalhes do pedido..." rows={2} className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600 resize-none mt-1" autoFocus />
                                        )}
                                    </div>
                                    <div className={`grid gap-2 ${cart.length === 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                        {cart.length === 0 && (
                                            <div>
                                                <label className="block text-xs font-black uppercase tracking-widest text-[#39FF14] mb-1">Valor (R$)</label>
                                                <input type="text" value={saleManualValue} onChange={e => setSaleManualValue(formatCurrency(e.target.value))} placeholder="0,00" className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-xs font-black uppercase tracking-widest text-white mb-1">Prazo</label>
                                            <input type="date" value={saleDeadline} onChange={e => setSaleDeadline(e.target.value)} className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold [color-scheme:dark]" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black uppercase tracking-widest text-white mb-1">Entrega</label>
                                            <select value={saleDeliveryMethod} onChange={e => setSaleDeliveryMethod(e.target.value as any)} className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold appearance-none">
                                                <option value="MOTOBOY">MOTOBOY</option>
                                                <option value="CORREIOS/TRANSPORTADORA">CORREIOS</option>
                                                <option value="RETIRADA">RETIRADA</option>
                                            </select>
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-2 cursor-pointer mt-1 bg-zinc-900/50 rounded-xl p-2">
                                        <input type="checkbox" checked={saleEntersProduction} onChange={e => setSaleEntersProduction(e.target.checked)} className="w-4 h-4 rounded accent-[#39FF14]" />
                                        <span className="text-xs font-black uppercase tracking-widest text-white">Entra em Produção</span>
                                    </label>
                                </div>

                                {/* BLOCO 3 — ENDEREÇO DE ENTREGA (só se método ≠ RETIRADA) */}
                                {saleDeliveryMethod !== 'RETIRADA' && (
                                    <div className="space-y-2 pb-4 mb-4 border-b border-zinc-800">
                                        <label className="block text-xs font-black uppercase tracking-widest text-white">Endereço de Entrega</label>
                                        <div>
                                            <label className="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-1">CEP</label>
                                            <input type="text" value={saleCep} onChange={async e => {
                                                const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                                                const formatted = v.length > 5 ? v.replace(/(\d{5})(\d)/, '$1-$2') : v;
                                                setSaleCep(formatted);
                                                if (v.length === 8) {
                                                    try {
                                                        const res = await fetch(`https://viacep.com.br/ws/${v}/json/`);
                                                        const data = await res.json();
                                                        if (!data.erro) {
                                                            setSaleEndereco(`${data.logradouro || ''}${data.bairro ? ', ' + data.bairro : ''}`);
                                                            setSaleCidade(data.localidade || '');
                                                            setSaleEstado(data.uf || '');
                                                        }
                                                    } catch {}
                                                }
                                            }} placeholder="00000-000"
                                                className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-1">Endereço</label>
                                            <input type="text" value={saleEndereco} onChange={e => setSaleEndereco(e.target.value)} placeholder="Rua, bairro..."
                                                className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <label className="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-1">Número</label>
                                                <input type="text" value={saleNumero} onChange={e => setSaleNumero(e.target.value)} placeholder="Nº"
                                                    className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-1">Quadra</label>
                                                <input type="text" value={saleQuadra} onChange={e => setSaleQuadra(e.target.value)} placeholder="Qd"
                                                    className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-1">Lote</label>
                                                <input type="text" value={saleLote} onChange={e => setSaleLote(e.target.value)} placeholder="Lt"
                                                    className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[1fr_80px] gap-2">
                                            <div>
                                                <label className="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-1">Cidade</label>
                                                <input type="text" value={saleCidade} onChange={e => setSaleCidade(e.target.value)} placeholder="Cidade"
                                                    className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-1">UF</label>
                                                <input type="text" value={saleEstado} onChange={e => setSaleEstado(e.target.value.toUpperCase().slice(0, 2))} placeholder="UF"
                                                    className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600 text-center" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black uppercase tracking-widest text-zinc-500 mb-1">Complemento</label>
                                            <input type="text" value={saleComplemento} onChange={e => setSaleComplemento(e.target.value)} placeholder="Apt, bloco, referência..."
                                                className="w-full bg-zinc-800 border-transparent rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] text-sm font-bold placeholder:text-zinc-600" />
                                        </div>
                                    </div>
                                )}

                                {/* BLOCO 4 — PAGAMENTO */}
                                <div className="space-y-2 pb-4 mb-4 border-b border-zinc-800">
                                    <label className="block text-xs font-black uppercase tracking-widest text-[#39FF14] mb-1">Forma de Pagamento</label>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {['PIX', 'BOLETO', 'CARTÃO CRÉDITO', 'CARTÃO DÉBITO', 'OUTROS'].map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => {
                                                    setPaymentMethod(m as any);
                                                    if (m !== 'CARTÃO CRÉDITO') setInstallments(1);
                                                    if (m !== 'PIX') setPixSplit(false);
                                                }}
                                                className={`p-2 rounded-xl border text-sm font-black uppercase tracking-widest transition-all ${paymentMethod === m
                                                    ? 'border-[#39FF14] bg-[#39FF14]/10 text-[#39FF14]'
                                                    : 'border-zinc-800 bg-zinc-900/50 text-white hover:border-zinc-700'
                                                    }`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                    {paymentMethod === 'PIX' && (
                                        <label className="flex items-center gap-3 cursor-pointer bg-zinc-900/50 rounded-xl p-3 border border-zinc-800 hover:border-[#39FF14]/30 transition-all mt-1">
                                            <input type="checkbox" checked={pixSplit} onChange={e => setPixSplit(e.target.checked)}
                                                className="w-4 h-4 accent-[#39FF14] rounded" />
                                            <div>
                                                <span className="text-sm font-black uppercase text-white">PIX 50% + 50%</span>
                                                <p className="text-xs text-white/50">50% no ato do pedido • 50% na entrega</p>
                                            </div>
                                        </label>
                                    )}
                                    <div>
                                        <label className="block text-xs font-black uppercase tracking-widest mb-1 text-white">Data</label>
                                        <input type="date" value={transactionDate} onChange={e => setTransactionDate(e.target.value)} required
                                            className="w-full bg-zinc-800 border border-zinc-900 rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] transition-all [color-scheme:dark] text-xs" />
                                    </div>
                                    {paymentMethod === 'CARTÃO CRÉDITO' && (() => {
                                        const taxasCartao: Record<number, number> = { 1: 4.20, 2: 6.09, 3: 7.01, 4: 7.91, 5: 8.80, 6: 9.67 };
                                        const baseTotal = cart.length > 0 ? cartTotal : parseBRL(saleManualValue);
                                        return (
                                        <div>
                                            <label className="block text-xs font-black uppercase tracking-widest mb-2 text-[#39FF14]">Parcelas (com juros)</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {[1, 2, 3, 4, 5, 6].map(n => {
                                                    const totalComJuros = baseTotal * (1 + (taxasCartao[n] || 0) / 100);
                                                    const parcela = totalComJuros / n;
                                                    return (
                                                        <button key={n} type="button" onClick={() => setInstallments(n)}
                                                            className={`py-3 px-3 rounded-xl text-sm font-bold border transition-all text-left ${installments === n
                                                                ? 'border-[#39FF14] bg-[#39FF14]/10 text-[#39FF14]'
                                                                : 'border-zinc-800 bg-zinc-900/50 text-white hover:border-zinc-700'
                                                            }`}>
                                                            <span className="block font-black">{n}x R$ {parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                            <span className={`block text-[11px] ${installments === n ? 'text-[#39FF14]/70' : 'text-white/40'}`}>
                                                                Total: R$ {totalComJuros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({taxasCartao[n]}%)
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        );
                                    })()}
                                    {paymentMethod === 'BOLETO' && (
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <label className="block text-xs font-black uppercase tracking-widest mb-1 text-[#39FF14]">Qtd. Boletos</label>
                                                <select value={saleBoletoQty} onChange={e => setSaleBoletoQty(parseInt(e.target.value))}
                                                    className="w-full bg-zinc-800 border border-zinc-900 rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] transition-all appearance-none text-center text-xs">
                                                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}x</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black uppercase tracking-widest mb-1 text-[#39FF14]">Intervalo</label>
                                                <select value={saleBoletoInterval} onChange={e => setSaleBoletoInterval(parseInt(e.target.value))}
                                                    className="w-full bg-zinc-800 border border-zinc-900 rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] transition-all appearance-none text-center text-xs">
                                                    <option value={30}>30 dias</option>
                                                    <option value={60}>60 dias</option>
                                                    <option value={90}>90 dias</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black uppercase tracking-widest mb-1 text-[#39FF14]">1º Vencimento</label>
                                                <input type="date" value={saleBoletoFirstDate} onChange={e => setSaleBoletoFirstDate(e.target.value)}
                                                    className="w-full bg-zinc-800 border border-zinc-900 rounded-xl p-2 text-white outline-none focus:ring-1 focus:ring-[#39FF14] transition-all [color-scheme:dark] text-xs" />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4">
                                    {toucaDiscount > 0 && (
                                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 mb-3">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-emerald-400 text-xs font-black uppercase tracking-widest">Atacado Toucas ({toucaTotalQty} un.)</span>
                                                <span className="text-emerald-400 text-xs font-bold">R$ {toucaWholesaleUnit?.toFixed(2).replace('.', ',')} /un.</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-white/50 text-xs line-through">R$ {(cartTotal + toucaDiscount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                <span className="text-emerald-400 text-sm font-black">- R$ {toucaDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        </div>
                                    )}
                                    {paymentMethod === 'CARTÃO CRÉDITO' && (() => {
                                        const taxasShow: Record<number, number> = { 1: 4.20, 2: 6.09, 3: 7.01, 4: 7.91, 5: 8.80, 6: 9.67 };
                                        const base = cart.length > 0 ? cartTotal : parseBRL(saleManualValue);
                                        const comJuros = base * (1 + (taxasShow[installments] || 0) / 100);
                                        return (
                                            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 mb-3">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-orange-400 text-xs font-black uppercase tracking-widest">Juros Cartão ({taxasShow[installments]}%)</span>
                                                    <span className="text-orange-400 text-sm font-black">+ R$ {(comJuros - base).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    <div className="flex justify-between items-end mb-4">
                                        <p className="text-white text-sm font-black uppercase tracking-widest">Total</p>
                                        <p className="text-2xl font-black text-[#39FF14]">R$ {(() => {
                                            const base = cart.length > 0 ? cartTotal : parseBRL(saleManualValue);
                                            const txs: Record<number, number> = { 1: 4.20, 2: 6.09, 3: 7.01, 4: 7.91, 5: 8.80, 6: 9.67 };
                                            const total = paymentMethod === 'CARTÃO CRÉDITO' ? base * (1 + (txs[installments] || 0) / 100) : base;
                                            return total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                                        })()}</p>
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
                                        className="text-sm font-black uppercase tracking-widest text-white hover:text-[#39FF14] transition-colors flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-800 hover:border-[#39FF14]/50"
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
                                                                <p className="text-sm font-bold text-white italic mt-1 line-clamp-1">
                                                                    {summary}
                                                                </p>
                                                            ) : (
                                                                <div className="mt-3 space-y-2">
                                                                    <div className="bg-zinc-900/50 rounded-xl px-3 py-2">
                                                                        <span className="text-xs text-white/50 font-bold uppercase">Valor: </span>
                                                                        <span className="text-sm font-bold text-[#39FF14]">R$ {(sale.total || sale.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                                        <span className="text-sm text-white/50 ml-2">• {sale.payment_method}</span>
                                                                        <span className="text-sm text-white/50 ml-2">• {new Date(sale.created_at).toLocaleDateString('pt-BR')}</span>
                                                                    </div>
                                                                    {(sale.payment_method === 'CARTÃO CRÉDITO' || sale.payment_method === 'CARTÃO CREDITO') && (sale.installments || 1) >= 1 && (() => {
                                                                        const inst = sale.installments || 1;
                                                                        const total = sale.total || sale.value || 0;
                                                                        const parcelaVal = total / inst;
                                                                        const saleDate = new Date(sale.created_at);
                                                                        return (
                                                                            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2 space-y-1">
                                                                                <span className="text-xs text-orange-400 font-black uppercase tracking-widest">
                                                                                    {inst}x de R$ {parcelaVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                                </span>
                                                                                <div className="flex flex-wrap gap-2">
                                                                                    {Array.from({ length: inst }, (_, i) => {
                                                                                        const dueDate = new Date(saleDate);
                                                                                        dueDate.setDate(dueDate.getDate() + (30 * (i + 1)));
                                                                                        const isPast = dueDate < new Date();
                                                                                        return (
                                                                                            <span key={i} className={`text-[11px] font-bold px-2 py-0.5 rounded ${isPast ? 'bg-[#39FF14]/10 text-[#39FF14]' : 'bg-zinc-800 text-white/70'}`}>
                                                                                                {i + 1}/{inst} • {dueDate.toLocaleDateString('pt-BR')} {isPast ? '✓' : ''}
                                                                                            </span>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                    {sale.client && (
                                                                        <div className="bg-zinc-900/50 rounded-xl px-3 py-2">
                                                                            <span className="text-xs text-white/50 font-bold uppercase">Cliente: </span>
                                                                            <span className="text-sm font-bold text-white uppercase">{sale.client}</span>
                                                                            {sale.client_whatsapp && <span className="text-sm text-white/50 ml-2">• {sale.client_whatsapp}</span>}
                                                                            {sale.cpf_cnpj && <span className="text-sm text-white/50 ml-2">• {sale.cpf_cnpj.length === 11 ? sale.cpf_cnpj.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : sale.cpf_cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}</span>}
                                                                        </div>
                                                                    )}
                                                                    {sale.description && (
                                                                        <div className="bg-zinc-900/50 rounded-xl px-3 py-2">
                                                                            <span className="text-xs text-white/50 font-bold uppercase">Descrição: </span>
                                                                            <span className="text-sm font-bold text-white">{sale.description}</span>
                                                                        </div>
                                                                    )}
                                                                    {sale.deadline && (
                                                                        <div className="bg-zinc-900/50 rounded-xl px-3 py-2">
                                                                            <span className="text-xs text-white/50 font-bold uppercase">Entrega: </span>
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
                                                                        <div key={idx} className="flex flex-wrap justify-between text-sm bg-zinc-900/50 rounded-xl px-3 py-2 gap-x-4">
                                                                            <span className="font-bold text-white">{item.quantity}x {item.name}</span>
                                                                            <span className="font-bold text-white/70 ml-auto">R$ {((item.sale_price || item.price || 0) * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <p className="text-sm text-white/70 mt-1">
                                                                {isExpanded ? 'Toque para fechar' : 'Toque para ver detalhes'}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <p className="text-base md:text-xl font-black text-white tabular-nums">
                                                                R$ {sale.total?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </p>
                                                            {sale.client_whatsapp && (
                                                                <button
                                                                    onClick={() => {
                                                                        const phone = normalizePhone(sale.client_whatsapp);
                                                                        const trackUrl = `${window.location.origin}/rastreio?id=${sale.id}`;
                                                                        const deliveryDate = sale.deadline ? sale.deadline.split('-').reverse().join('/') : '';
                                                                        const msg = [
                                                                            `Olá *${sale.client || ''}*! Seu pedido na *Libera Sports* foi cadastrado com sucesso!`,
                                                                            '',
                                                                            `*Pedido:* ${sale.order_number || sale.sale_number}`,
                                                                            `*Valor:* R$ ${Number(sale.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                                                                            ...(deliveryDate ? [`*Entrega prevista:* ${deliveryDate}`] : []),
                                                                            `*Pagamento:* ${sale.payment_method || 'PIX'}`,
                                                                            '',
                                                                            'Acompanhe seu pedido em tempo real:',
                                                                            trackUrl,
                                                                            '',
                                                                            '_Libera Sports - Vista Libera e viva a liberdade_'
                                                                        ].map(l => encodeURIComponent(l)).join('%0a');
                                                                        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
                                                                    }}
                                                                    className="bg-green-500/10 text-green-500 p-2.5 rounded-xl hover:bg-green-500 hover:text-[#fff] transition-all"
                                                                    title="Enviar WhatsApp"
                                                                >
                                                                    <MessageCircle size={14} />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleDeleteSale(sale.id)}
                                                                disabled={loading}
                                                                className="bg-red-500/10 text-red-500 p-2.5 rounded-xl hover:bg-red-500 hover:text-[#fff] transition-all disabled:opacity-50"
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
                                <p className="text-white text-sm md:text-sm mt-0.5">Gestão de contas a pagar e a receber</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setCadastroFilter('FORNECEDOR'); setShowCadastros(true); }}
                                    className="bg-zinc-800 text-white px-4 md:px-5 py-2.5 md:py-3 rounded-2xl font-black uppercase text-sm md:text-sm tracking-widest hover:scale-105 transition-all flex items-center gap-1.5 shrink-0 border border-zinc-700"
                                >
                                    <User size={14} /> Cadastros
                                </button>
                                {(financeView === 'A PAGAR' || financeView === 'A RECEBER') && (
                                    <button
                                        onClick={() => setIsFinanceModalOpen(true)}
                                        className="bg-[#39FF14] text-black px-4 md:px-6 py-2.5 md:py-3 rounded-2xl font-black uppercase text-sm md:text-sm tracking-widest hover:scale-105 transition-all shadow-lg shadow-[#39FF14]/20 flex items-center gap-1.5 shrink-0"
                                    >
                                        <Plus size={14} /> Nova Conta
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Toggle Financeiro */}
                        <div className="flex gap-1 p-1 bg-zinc-950 rounded-2xl overflow-x-auto">
                            <button
                                onClick={() => { setFinanceView('A PAGAR'); setFinanceStatusFilter(''); }}
                                className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-1.5 shrink-0 ${financeView === 'A PAGAR' ? 'bg-red-500 text-[#fff] shadow-lg shadow-red-500/20' : 'text-white hover:text-white'}`}
                            >
                                <ArrowDownLeft size={12} /> A Pagar
                            </button>
                            <button
                                onClick={() => { setFinanceView('PAGAS'); setFinanceStatusFilter(''); }}
                                className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-1.5 shrink-0 ${financeView === 'PAGAS' ? 'bg-blue-500 text-[#fff] shadow-lg shadow-blue-500/20' : 'text-white hover:text-white'}`}
                            >
                                <Check size={12} /> Pagas
                            </button>
                            <button
                                onClick={() => { setFinanceView('A RECEBER'); setFinanceStatusFilter(''); }}
                                className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-1.5 shrink-0 ${financeView === 'A RECEBER' ? 'bg-[#39FF14] text-black shadow-lg shadow-[#39FF14]/20' : 'text-white hover:text-white'}`}
                            >
                                <ArrowUpRight size={12} /> A Receber
                            </button>
                            <button
                                onClick={() => { setFinanceView('RECEBIDAS'); setFinanceStatusFilter(''); }}
                                className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-1.5 shrink-0 ${financeView === 'RECEBIDAS' ? 'bg-emerald-500 text-[#fff] shadow-lg shadow-emerald-500/20' : 'text-white hover:text-white'}`}
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
                                    <div onClick={() => setFinanceStatusFilter(financeStatusFilter === 'ATRASADO' ? '' : 'ATRASADO')}
                                        className={`bg-zinc-950 p-3 md:p-6 rounded-2xl md:rounded-[32px] border cursor-pointer transition-all ${financeStatusFilter === 'ATRASADO' ? 'border-orange-500 ring-1 ring-orange-500' : 'border-zinc-900 hover:border-zinc-700'}`}>
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
                                    <div onClick={() => setFinanceStatusFilter(financeStatusFilter === 'ATRASADO' ? '' : 'ATRASADO')}
                                        className={`bg-zinc-950 p-3 md:p-6 rounded-2xl md:rounded-[32px] border cursor-pointer transition-all ${financeStatusFilter === 'ATRASADO' ? 'border-orange-500 ring-1 ring-orange-500' : 'border-zinc-900 hover:border-zinc-700'}`}>
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
                                <h3 className="text-white text-sm md:text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                    {financeView === 'A PAGAR' && <><ArrowDownLeft size={11} /> Contas a Pagar</>}
                                    {financeView === 'A RECEBER' && <><ArrowUpRight size={11} /> Contas a Receber</>}
                                    {financeView === 'PAGAS' && <><Check size={11} /> Contas Pagas</>}
                                    {financeView === 'RECEBIDAS' && <><Check size={11} /> Contas Recebidas</>}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Filtros rápidos */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {[
                                            { label: 'Hoje', getRange: () => { const d = new Date().toISOString().split('T')[0]; return [d, d]; } },
                                            { label: 'Semana', getRange: () => {
                                                const now = new Date(); const day = now.getDay();
                                                const start = new Date(now); start.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
                                                const end = new Date(start); end.setDate(start.getDate() + 6);
                                                return [start.toISOString().split('T')[0], end.toISOString().split('T')[0]];
                                            }},
                                            { label: 'Mês', getRange: () => {
                                                const now = new Date();
                                                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                                                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                                                return [start.toISOString().split('T')[0], end.toISOString().split('T')[0]];
                                            }},
                                        ].map(f => {
                                            const [s, e] = f.getRange();
                                            const isActive = financeDateFrom === s && financeDateTo === e;
                                            return (
                                                <button key={f.label} onClick={() => {
                                                    if (isActive) { setFinanceDateFrom(''); setFinanceDateTo(''); }
                                                    else { setFinanceDateFrom(s); setFinanceDateTo(e); }
                                                }}
                                                    className={`text-xs font-black uppercase px-3 py-1.5 rounded-full transition-all ${isActive
                                                        ? 'bg-[#39FF14] text-black'
                                                        : 'bg-zinc-900 border border-zinc-800 text-white/60 hover:border-[#39FF14]/50 hover:text-white'
                                                    }`}>
                                                    {f.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {/* Seletor de período customizado */}
                                    <div className="flex items-center gap-1.5">
                                        <div className="relative">
                                            <input
                                                type="date"
                                                value={financeDateFrom}
                                                onChange={e => setFinanceDateFrom(e.target.value)}
                                                className="bg-zinc-900 text-sm font-bold px-3 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] transition-colors [color-scheme:dark] min-w-[140px]"
                                            />
                                        </div>
                                        <span className="text-white/50 text-xs font-bold">até</span>
                                        <div className="relative">
                                            <input
                                                type="date"
                                                value={financeDateTo}
                                                onChange={e => setFinanceDateTo(e.target.value)}
                                                className="bg-zinc-900 text-sm font-bold px-3 py-2 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] transition-colors [color-scheme:dark] min-w-[140px]"
                                            />
                                        </div>
                                        {(financeDateFrom || financeDateTo) && (
                                            <button
                                                onClick={() => { setFinanceDateFrom(''); setFinanceDateTo(''); }}
                                                className="text-white/50 hover:text-[#39FF14] transition-colors p-1.5 rounded-lg hover:bg-zinc-800"
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
                                                        if (financeView === 'A PAGAR') { if (item.type !== 'OUTFLOW' || item.status === 'PAGO') return false; }
                                                        else if (financeView === 'A RECEBER') { if (item.type !== 'INFLOW' || item.status === 'RECEBIDO') return false; }
                                                        else if (financeView === 'PAGAS') { if (item.type !== 'OUTFLOW' || item.status !== 'PAGO') return false; }
                                                        else if (financeView === 'RECEBIDAS') { if (item.type !== 'INFLOW' || (item.status !== 'RECEBIDO' && item.status !== 'PAGO')) return false; }
                                                        const dateStr = (financeView === 'PAGAS' || financeView === 'RECEBIDAS') ? (item.paid_at || item.due_date || item.created_at) : (item.due_date || item.transaction_date || item.created_at);
                                                        const datePart = dateStr.split('T')[0];
                                                        if (financeDateFrom && datePart < financeDateFrom) return false;
                                                        if (financeDateTo && datePart > financeDateTo) return false;
                                                        if (financeSearchTerm) {
                                                            const search = financeSearchTerm.toLowerCase();
                                                            if (!(item.description || '').toLowerCase().includes(search) && !(item.supplier_name || '').toLowerCase().includes(search) && !(item.payment_method || '').toLowerCase().includes(search)) return false;
                                                        }
                                                        return true;
                                                    });
                                                    const titles: Record<string, string> = { 'A PAGAR': 'Contas_a_Pagar', 'A RECEBER': 'Contas_a_Receber', 'PAGAS': 'Contas_Pagas', 'RECEBIDAS': 'Contas_Recebidas' };
                                                    generateFinancePDF(items, titles[financeView] + (financeSearchTerm ? `_${financeSearchTerm}` : ''), 'simples');
                                                    setShowPdfMenu(false);
                                                }} className="w-full text-left px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800 transition-colors">Relatório Simples</button>
                                                <button onClick={() => {
                                                    const items = financialItems.filter(item => {
                                                        if (financeView === 'A PAGAR') { if (item.type !== 'OUTFLOW' || item.status === 'PAGO') return false; }
                                                        else if (financeView === 'A RECEBER') { if (item.type !== 'INFLOW' || item.status === 'RECEBIDO') return false; }
                                                        else if (financeView === 'PAGAS') { if (item.type !== 'OUTFLOW' || item.status !== 'PAGO') return false; }
                                                        else if (financeView === 'RECEBIDAS') { if (item.type !== 'INFLOW' || (item.status !== 'RECEBIDO' && item.status !== 'PAGO')) return false; }
                                                        const dateStr = (financeView === 'PAGAS' || financeView === 'RECEBIDAS') ? (item.paid_at || item.due_date || item.created_at) : (item.due_date || item.transaction_date || item.created_at);
                                                        const datePart = dateStr.split('T')[0];
                                                        if (financeDateFrom && datePart < financeDateFrom) return false;
                                                        if (financeDateTo && datePart > financeDateTo) return false;
                                                        if (financeSearchTerm) {
                                                            const search = financeSearchTerm.toLowerCase();
                                                            if (!(item.description || '').toLowerCase().includes(search) && !(item.supplier_name || '').toLowerCase().includes(search) && !(item.payment_method || '').toLowerCase().includes(search)) return false;
                                                        }
                                                        return true;
                                                    });
                                                    const titles: Record<string, string> = { 'A PAGAR': 'Contas_a_Pagar', 'A RECEBER': 'Contas_a_Receber', 'PAGAS': 'Contas_Pagas', 'RECEBIDAS': 'Contas_Recebidas' };
                                                    generateFinancePDF(items, titles[financeView] + (financeSearchTerm ? `_${financeSearchTerm}` : ''), 'completo');
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
                                    className="w-full bg-zinc-800 border border-zinc-800 rounded-xl p-3 text-white outline-none focus:border-[#39FF14] transition-colors text-sm font-bold placeholder:text-zinc-600"
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
                                        if (financeStatusFilter && item.status !== financeStatusFilter) return false;
                                        return true;
                                    }).filter(item => {
                                        if (!financeSearchTerm) return true;
                                        const search = financeSearchTerm.toLowerCase();
                                        return (item.description || '').toLowerCase().includes(search) ||
                                            (item.supplier_name || '').toLowerCase().includes(search) ||
                                            (item.payment_method || '').toLowerCase().includes(search);
                                    }).sort((a: any, b: any) => {
                                        if (financeView === 'A RECEBER') {
                                            // Ordena pelo número do pedido (LIBERA-XXXX) extraído da descrição
                                            const extractOrderNum = (desc: string) => {
                                                const m = (desc || '').match(/\[LIBERA-(\d+)\]/);
                                                return m ? parseInt(m[1], 10) : 999999;
                                            };
                                            const numA = extractOrderNum(a.description);
                                            const numB = extractOrderNum(b.description);
                                            if (numA !== numB) return numA - numB;
                                            // Desempate: por número da parcela
                                            const extractParcela = (desc: string) => {
                                                const m = (desc || '').match(/Parcela (\d+)\/\d+/i);
                                                return m ? parseInt(m[1], 10) : 0;
                                            };
                                            return extractParcela(a.description) - extractParcela(b.description);
                                        }
                                        if (financeView === 'PAGAS' || financeView === 'RECEBIDAS') {
                                            const dateA = new Date(a.paid_at || a.created_at).getTime();
                                            const dateB = new Date(b.paid_at || b.created_at).getTime();
                                            return dateB - dateA;
                                        }
                                        const dateA = new Date(a.due_date || a.transaction_date || a.created_at).getTime();
                                        const dateB = new Date(b.due_date || b.transaction_date || b.created_at).getTime();
                                        return dateA - dateB;
                                    });

                                    const totalFiltered = filtered.reduce((acc: number, item: any) => acc + (item.amount || 0), 0);
                                    const periodLabel = financeDateFrom && financeDateTo
                                        ? `${financeDateFrom.split('-').reverse().join('/')} até ${financeDateTo.split('-').reverse().join('/')}`
                                        : financeDateFrom ? `A partir de ${financeDateFrom.split('-').reverse().join('/')}`
                                        : financeDateTo ? `Até ${financeDateTo.split('-').reverse().join('/')}`
                                        : 'Todos os períodos';

                                    if (filtered.length === 0) {
                                        return <div className="p-12 text-center text-white font-bold uppercase text-sm tracking-widest italic">Nenhuma conta no período</div>;
                                    }

                                    return (<>
                                    {/* Resumo do filtro */}
                                    <div className="px-4 md:px-6 py-3 bg-zinc-900/50 flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold uppercase text-white/40">{periodLabel}</span>
                                            <span className="text-xs font-bold text-white/40">•</span>
                                            <span className="text-xs font-bold uppercase text-white/40">{filtered.length} {filtered.length === 1 ? 'conta' : 'contas'}</span>
                                        </div>
                                        <div className={`text-lg font-black ${(financeView === 'A RECEBER' || financeView === 'RECEBIDAS') ? 'text-[#39FF14]' : 'text-red-500'}`}>
                                            {(financeView === 'A RECEBER' || financeView === 'RECEBIDAS') ? '+' : '-'} R$ {totalFiltered.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>

                                    {filtered.map(item => (
                                        <div key={item.id} className="p-4 md:p-6 hover:bg-zinc-900/50 transition-colors" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'start'}}>
                                            <div style={{minWidth: 0}}>
                                                <div className="flex items-start gap-3">
                                                    <div className={`p-2 md:p-3 rounded-xl md:rounded-2xl shrink-0 mt-0.5 ${item.type === 'INFLOW' ? 'bg-[#39FF14]/10 text-[#39FF14]' : 'bg-red-500/10 text-red-500'}`}>
                                                        {item.type === 'INFLOW' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                                                    </div>
                                                    <div style={{minWidth: 0}}>
                                                        <p className="text-base font-black text-white uppercase" style={{wordBreak: 'break-all'}}>{(() => {
                                                            const desc = item.description || '';
                                                            const orderMatch = desc.match(/\[LIBERA-\d+\]/);
                                                            if (orderMatch) {
                                                                // Buscar nome do cliente no pedido vinculado
                                                                const sale = item.order_id ? sales.find((s: any) => s.id === item.order_id) : null;
                                                                const clientName = sale?.client || '';
                                                                // Extrair parcela se existir
                                                                const parcelaMatch = desc.match(/\(Parcela \d+\/\d+\)/i) || desc.match(/\(PIX \d+\/\d+.*?\)/i) || desc.match(/\(Boleto \d+\/\d+\)/i);
                                                                return `${orderMatch[0]} ${clientName}${parcelaMatch ? ' ' + parcelaMatch[0] : ''}`;
                                                            }
                                                            return desc;
                                                        })()}</p>
                                                        {item.supplier_name && <p className="text-sm font-bold text-[#39FF14]/70 uppercase mt-0.5">{item.supplier_name}</p>}
                                                        {item.payment_method && item.status !== 'RECEBIDO' && item.status !== 'PAGO' && (
                                                            <span className="text-xs text-white/50 font-bold uppercase mt-1">{item.payment_method}</span>
                                                        )}
                                                        {item.observations && <p className="text-sm text-white/70 italic mt-0.5" style={{wordBreak: 'break-all'}}>{item.observations}</p>}
                                                        <p className="text-xs text-white/40 mt-1">
                                                            {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(item.created_at).toLocaleTimeString('pt-BR') : ''}
                                                            {item.operator_name ? ` • ${item.operator_name}` : ''}
                                                        </p>
                                                        {/* Anexo */}
                                                        <div className="flex items-center gap-2 mt-1.5">
                                                            {item.attachment ? (
                                                                <>
                                                                <button onClick={() => {
                                                                    if (item.attachment.startsWith('data:image')) {
                                                                        const w = window.open(''); if (w) { w.document.write(`<img src="${item.attachment}" style="max-width:100%">`); w.document.close(); }
                                                                    } else if (item.attachment.startsWith('data:application/pdf')) {
                                                                        const w = window.open(''); if (w) { w.document.write(`<iframe src="${item.attachment}" style="width:100%;height:100vh;border:none"></iframe>`); w.document.close(); }
                                                                    }
                                                                }} className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                                                    <Paperclip size={10} /> Ver anexo
                                                                </button>
                                                                <label className="text-xs font-bold text-white/30 hover:text-white/60 cursor-pointer">
                                                                    Trocar
                                                                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={async (e) => {
                                                                        const file = e.target.files?.[0];
                                                                        if (!file) return;
                                                                        if (file.size > 500000) { toast.error('Arquivo muito grande (máx 500KB)'); return; }
                                                                        const reader = new FileReader();
                                                                        reader.onload = async () => {
                                                                            try { await updateDoc(doc(db, financeCollectionPath, item.id), { attachment: reader.result as string }); toast.success('Anexo atualizado!'); } catch { toast.error('Erro ao atualizar anexo'); }
                                                                        };
                                                                        reader.readAsDataURL(file);
                                                                    }} />
                                                                </label>
                                                                <button onClick={async () => {
                                                                    if (!confirm('Remover o anexo?')) return;
                                                                    try { await updateDoc(doc(db, financeCollectionPath, item.id), { attachment: '' }); toast.success('Anexo removido!'); } catch { toast.error('Erro ao remover'); }
                                                                }} className="text-xs font-bold text-red-400/50 hover:text-red-400">
                                                                    Remover
                                                                </button>
                                                                </>
                                                            ) : (
                                                                (financeView === 'A PAGAR' || financeView === 'PAGAS') && (
                                                                    <label className="text-xs font-bold text-white/30 hover:text-white/60 flex items-center gap-1 cursor-pointer">
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
                                                        <>
                                                        <label className="text-sm font-black uppercase px-3 py-1 rounded-full bg-green-500/20 text-green-400 cursor-pointer hover:bg-green-500/30 transition-colors flex items-center gap-1">
                                                            {item.status} em {(() => { const d = item.paid_at || item.created_at || ''; return d ? d.split('T')[0].split('-').reverse().join('/') : ''; })()}
                                                            <input type="date" className="opacity-0 absolute w-0 h-0" value={item.paid_at ? item.paid_at.split('T')[0] : ''} onChange={async (e) => {
                                                                if (e.target.value) {
                                                                    try {
                                                                        await updateDoc(doc(db, financeCollectionPath, item.id), { paid_at: e.target.value + 'T12:00:00' });
                                                                        toast.success('Data de pagamento atualizada!');
                                                                    } catch (err) { toast.error('Erro ao atualizar data'); }
                                                                }
                                                            }} />
                                                        </label>
                                                        {(financeView === 'PAGAS' || financeView === 'RECEBIDAS') && (
                                                            <button onClick={async () => {
                                                                if (!confirm('Desfazer pagamento e voltar para A Pagar/A Receber?')) return;
                                                                try {
                                                                    const newStatus = item.type === 'OUTFLOW' ? 'A PAGAR' : 'A RECEBER';
                                                                    await updateDoc(doc(db, financeCollectionPath, item.id), { status: newStatus, paid_at: '' });
                                                                    toast.success(`Conta voltou para ${newStatus}`);
                                                                } catch { toast.error('Erro ao desfazer'); }
                                                            }} className="text-xs font-bold text-orange-400/70 hover:text-orange-400 transition-colors">
                                                                Desfazer
                                                            </button>
                                                        )}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="text-sm font-black uppercase px-3 py-1 rounded-full bg-green-500/20 text-green-400">
                                                                {item.type === 'OUTFLOW' ? 'Pagar' : 'Receber'} em {((item.due_date || item.transaction_date || item.created_at) || '').split('T')[0].split('-').reverse().join('/')}
                                                            </span>
                                                            <button
                                                                onClick={() => handleUpdateFinanceEntry(item.id, {
                                                                    status: item.type === 'OUTFLOW' ? 'PAGO' : 'RECEBIDO',
                                                                    paid_at: new Date().toISOString()
                                                                })}
                                                                className="text-xs font-bold uppercase px-3 py-1.5 rounded-full border border-zinc-700 bg-zinc-900 text-white/60 hover:border-[#39FF14]/50 hover:text-[#39FF14] transition-all hover:scale-105"
                                                            >
                                                                {item.type === 'OUTFLOW' ? 'Marcar como pago' : 'Marcar como recebido'}
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
                                                        const prev = financialItems;
                                                        setFinancialItems(list => list.filter(x => x.id !== item.id));
                                                        try {
                                                            await deleteDoc(doc(db, financeCollectionPath, item.id));
                                                            toast.success('Conta excluída!');
                                                        } catch (err) {
                                                            console.error('Erro ao excluir:', err);
                                                            setFinancialItems(prev);
                                                            toast.error('Erro ao excluir conta');
                                                        }
                                                    }} className="text-white/70 hover:text-red-500 transition-colors p-3" title="Excluir conta">
                                                    <Trash2 size={22} />
                                                </button>
                                            </div>
                                            </div>
                                        </div>
                                    ))}
                                    </>);
                                })()}
                            </div>
                        </div>
                    </div>
                )}


                {/* Modal Histórico de Movimentações */}
                {showActivityLog && isAdmin && (
                    <div className="fixed inset-0 bg-black/95 z-[700] flex items-center justify-center p-4 backdrop-blur-xl">
                        <div className="bg-zinc-900 w-full max-w-3xl max-h-[90vh] rounded-[32px] border border-zinc-800 shadow-2xl relative text-white flex flex-col">
                            <div className="p-6 border-b border-zinc-800 flex justify-between items-center shrink-0">
                                <h3 className="text-2xl font-black italic uppercase text-[#39FF14]">Histórico de Movimentações</h3>
                                <button onClick={() => setShowActivityLog(false)} className="text-white hover:text-white transition-colors"><X size={24} /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800">
                                {(() => {
                                    // Agrupar todas as movimentações de vendas e financeiro
                                    const activities: any[] = [];

                                    // Vendas/Pedidos criados
                                    sales.forEach((s: any) => {
                                        activities.push({
                                            type: 'VENDA',
                                            description: `Venda ${s.order_number || s.sale_number || ''} - ${s.client || 'Sem cliente'}`,
                                            detail: s.description || (s.items?.map((i: any) => `${i.quantity}x ${i.name}`).join(', ')) || '',
                                            amount: s.total || s.value || 0,
                                            operator: s.operator_name || '',
                                            date: s.created_at || '',
                                            status: s.status || '',
                                            source: s.source === 'LOJA' ? 'Loja' : 'Sistema',
                                        });
                                        // Logs de movimentação de status
                                        if (s.order_logs) {
                                            s.order_logs.forEach((log: any) => {
                                                activities.push({
                                                    type: 'STATUS',
                                                    description: `${s.order_number || ''} → ${log.new_status}`,
                                                    detail: `De ${log.old_status} para ${log.new_status}`,
                                                    operator: log.operator_name || '',
                                                    date: log.created_at || '',
                                                });
                                            });
                                        }
                                    });

                                    // Movimentações financeiras
                                    financialItems.forEach((f: any) => {
                                        activities.push({
                                            type: f.type === 'INFLOW' ? 'ENTRADA' : 'SAÍDA',
                                            description: f.description || '',
                                            detail: `${f.payment_method || ''} • ${f.status || ''}`,
                                            amount: f.amount || 0,
                                            operator: f.operator_name || '',
                                            date: f.created_at || '',
                                            source: f.source === 'GASTO_DO_DIA' ? 'Gasto do Dia' : '',
                                        });
                                    });

                                    // Ordenar por data (mais recente primeiro)
                                    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                                    return activities.length === 0 ? (
                                        <div className="p-12 text-center text-white/50 font-bold uppercase text-sm">Nenhuma movimentação</div>
                                    ) : activities.slice(0, 200).map((act, idx) => (
                                        <div key={idx} className="p-4 hover:bg-zinc-800/30 transition-colors">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-full ${
                                                            act.type === 'VENDA' ? 'bg-[#39FF14]/20 text-[#39FF14]' :
                                                            act.type === 'STATUS' ? 'bg-blue-500/20 text-blue-400' :
                                                            act.type === 'ENTRADA' ? 'bg-green-500/20 text-green-400' :
                                                            'bg-red-500/20 text-red-400'
                                                        }`}>{act.type}</span>
                                                        {act.source && <span className="text-xs font-bold text-white/30 uppercase">{act.source}</span>}
                                                        {act.operator && <span className="text-xs font-bold text-white/50">por {act.operator}</span>}
                                                    </div>
                                                    <p className="text-sm font-bold text-white mt-1" style={{wordBreak: 'break-all'}}>{act.description}</p>
                                                    {act.detail && <p className="text-xs text-white/50 mt-0.5">{act.detail}</p>}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    {act.amount > 0 && (
                                                        <p className={`text-sm font-black ${act.type === 'SAÍDA' ? 'text-red-400' : 'text-[#39FF14]'}`}>
                                                            R$ {act.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-white/30 mt-0.5">
                                                        {act.date ? `${act.date.split('T')[0].split('-').reverse().join('/')} ${act.date.split('T')[1]?.substring(0, 5) || ''}` : ''}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal Cadastros */}
                {showCadastros && (() => {
                    const isClientMode = cadastroFilter === 'CLIENTE';
                    const filterOptions = isClientMode
                        ? (['CLIENTE'] as const)
                        : (['TODOS', 'FORNECEDOR', 'FUNCIONÁRIO'] as const);
                    return (
                    <div className="fixed inset-0 bg-black/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl">
                        <div className="bg-zinc-900 w-full max-w-2xl max-h-[90vh] rounded-[32px] border border-zinc-800 shadow-2xl relative text-white flex flex-col">
                            <div className="p-6 border-b border-zinc-800 flex justify-between items-center shrink-0">
                                <h3 className="text-2xl font-black italic uppercase text-[#39FF14]">{isClientMode ? 'Clientes' : 'Cadastros'}</h3>
                                <button onClick={() => setShowCadastros(false)} className="text-white hover:text-white transition-colors"><X size={24} /></button>
                            </div>
                            <div className="p-4 md:p-6 border-b border-zinc-800 space-y-3 shrink-0">
                                <div className="flex justify-between items-center gap-3">
                                    <input type="text" value={fornecedorSearch} onChange={e => setFornecedorSearch(e.target.value)} placeholder="Buscar por nome..."
                                        className="bg-zinc-950 text-sm px-4 py-2.5 rounded-xl border border-zinc-800 outline-none text-white focus:border-[#39FF14] transition-colors flex-1" />
                                    <button onClick={() => { setEditingFornecedor(null); setFornecedorName(''); setFornecedorCpfCnpj(''); setFornecedorCpfCnpjError(''); setFornecedorWhatsapp(''); setFornecedorType(isClientMode ? 'CLIENTE' : 'FORNECEDOR'); setFornecedorStartDate(''); setFornecedorModalOpen(true); }}
                                        className="bg-[#39FF14] text-black px-5 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest hover:scale-105 transition-all flex items-center gap-1.5 shrink-0">
                                        <Plus size={14} /> Novo
                                    </button>
                                </div>
                                {!isClientMode && (
                                <div className="flex gap-2">
                                    {filterOptions.map(tipo => (
                                        <button key={tipo} onClick={() => setCadastroFilter(tipo)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${cadastroFilter === tipo
                                                ? tipo === 'FORNECEDOR' ? 'bg-red-500 text-[#fff]' : tipo === 'FUNCIONÁRIO' ? 'bg-blue-500 text-[#fff]' : 'bg-white text-black'
                                                : 'bg-zinc-800 text-white/70 hover:text-white'}`}>
                                            {tipo === 'TODOS' ? 'Todos' : tipo === 'FORNECEDOR' ? 'Fornecedores' : 'Funcionários'}
                                        </button>
                                    ))}
                                </div>
                                )}
                            </div>
                            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800">
                                {fornecedores.filter(f => {
                                    const fType = f.type || 'CLIENTE';
                                    if (isClientMode) return fType === 'CLIENTE' && (!fornecedorSearch || f.name.toLowerCase().includes(fornecedorSearch.toLowerCase()));
                                    if (cadastroFilter === 'TODOS') return fType !== 'CLIENTE' && (!fornecedorSearch || f.name.toLowerCase().includes(fornecedorSearch.toLowerCase()));
                                    return fType === cadastroFilter && (!fornecedorSearch || f.name.toLowerCase().includes(fornecedorSearch.toLowerCase()));
                                }).length === 0 ? (
                                    <div className="p-12 text-center text-white font-bold uppercase text-sm tracking-widest italic">Nenhum cadastro encontrado</div>
                                ) : (
                                    fornecedores.filter(f => {
                                        const fType = f.type || 'CLIENTE';
                                        if (isClientMode) return fType === 'CLIENTE' && (!fornecedorSearch || f.name.toLowerCase().includes(fornecedorSearch.toLowerCase()));
                                        if (cadastroFilter === 'TODOS') return fType !== 'CLIENTE' && (!fornecedorSearch || f.name.toLowerCase().includes(fornecedorSearch.toLowerCase()));
                                        return fType === cadastroFilter && (!fornecedorSearch || f.name.toLowerCase().includes(fornecedorSearch.toLowerCase()));
                                    }).map(f => (
                                        <div key={f.id} className="p-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-black text-white uppercase">{f.name}</p>
                                                    <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-full ${f.type === 'FORNECEDOR' ? 'bg-red-500/20 text-red-400' : f.type === 'FUNCIONÁRIO' ? 'bg-blue-500/20 text-blue-400' : 'bg-[#39FF14]/20 text-[#39FF14]'}`}>
                                                        {f.type === 'FORNECEDOR' ? 'Fornecedor' : f.type === 'FUNCIONÁRIO' ? 'Funcionário' : 'Cliente'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-white/70">
                                                    {f.cpf_cnpj ? (f.cpf_cnpj.length === 11 ? f.cpf_cnpj.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : f.cpf_cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')) : 'Sem CPF/CNPJ'}
                                                    {f.whatsapp && ` • ${f.whatsapp}`}
                                                    {f.start_date && ` • Início: ${f.start_date.split('-').reverse().join('/')}`}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => { setEditingFornecedor(f); setFornecedorName(f.name); setFornecedorCpfCnpj(f.cpf_cnpj ? formatCpfCnpj(f.cpf_cnpj) : ''); setFornecedorWhatsapp(f.whatsapp || ''); setFornecedorType(f.type || 'CLIENTE'); setFornecedorStartDate(f.start_date || ''); setFornecedorModalOpen(true); }} className="text-white/70 hover:text-[#39FF14] transition-colors p-2"><Pencil size={16} /></button>
                                                <button onClick={() => handleDeleteFornecedor(f.id)} className="text-white/70 hover:text-red-500 transition-colors p-2"><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                    );
                })()}

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
                                        className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-red-500 font-bold placeholder:text-zinc-600" />
                                </div>
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2">Valor (R$)</label>
                                    <input type="text" value={gastoAmount} onChange={e => setGastoAmount(formatCurrency(e.target.value))} placeholder="0,00"
                                        className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-red-500 font-bold placeholder:text-zinc-600" />
                                </div>
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2">Forma de Pagamento</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['PIX', 'DINHEIRO', 'CARTÃO'].map(m => (
                                            <button key={m} type="button" onClick={() => setGastoPayMethod(m)}
                                                className={`py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${gastoPayMethod === m ? 'bg-red-500 text-[#fff]' : 'bg-zinc-950 text-white border border-zinc-800 hover:border-zinc-700'}`}>
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
                                    className="w-full bg-red-500 text-[#fff] py-4 rounded-2xl font-black uppercase text-sm tracking-widest hover:scale-[1.02] transition-all"
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
                            <p className="text-xs text-white/50 font-bold uppercase mb-3 text-center">Enviar pedido para qual etapa?</p>
                            <div className="grid grid-cols-2 gap-2">
                                {workflow.map((step) => (
                                    <button
                                        key={step}
                                        onClick={async () => {
                                            setLoading(true);
                                            try {
                                                const orderRef = doc(db, salesCollectionPath, pendingViewOrder.id);
                                                const orderSnap = await getDoc(orderRef);
                                                const orderData = orderSnap.data();
                                                const newLog = {
                                                    id: crypto.randomUUID(),
                                                    old_status: 'PENDÊNCIA',
                                                    new_status: step,
                                                    operator_name: operatorName,
                                                    created_at: new Date().toISOString(),
                                                    note: `Pendência resolvida → ${step}`
                                                };
                                                await updateDoc(orderRef, {
                                                    status: step,
                                                    pending_reason: '',
                                                    order_logs: [...(orderData?.order_logs || []), newLog]
                                                });
                                                toast.success(`Pedido enviado para ${step}`);
                                                setPendingViewOrder(null);
                                            } catch (error) {
                                                console.error('Error resolving pending:', error);
                                                toast.error('Erro ao resolver pendência');
                                            } finally {
                                                setLoading(false);
                                            }
                                        }}
                                        disabled={loading}
                                        className="bg-zinc-800 hover:bg-[#39FF14] hover:text-black text-white py-3 px-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all disabled:opacity-50"
                                    >
                                        {step === 'AGUARDANDO APROVAÇÃO' ? 'APROVAÇÃO' : step === 'EM FASE DE ENTREGA' ? 'ENVIO' : step === 'PEDIDO ENTREGUE' ? 'ENTREGUE' : step}
                                    </button>
                                ))}
                            </div>
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
                                        className={`flex-1 py-2.5 rounded-lg font-black uppercase text-xs tracking-widest transition-all ${fornecedorType === 'FORNECEDOR' ? 'bg-red-500 text-[#fff]' : 'text-white'}`}>
                                        Fornecedor
                                    </button>
                                    <button type="button" onClick={() => setFornecedorType('FUNCIONÁRIO')}
                                        className={`flex-1 py-2.5 rounded-lg font-black uppercase text-xs tracking-widest transition-all ${fornecedorType === 'FUNCIONÁRIO' ? 'bg-blue-500 text-[#fff]' : 'text-white'}`}>
                                        Funcionário
                                    </button>
                                </div>
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2">Nome</label>
                                    <input type="text" value={fornecedorName} onChange={e => setFornecedorName(e.target.value)} placeholder={fornecedorType === 'CLIENTE' ? 'Nome do cliente...' : fornecedorType === 'FORNECEDOR' ? 'Nome do fornecedor...' : 'Nome do funcionário...'} className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14]" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2">CPF/CNPJ</label>
                                    <input type="text" value={fornecedorCpfCnpj} onChange={e => handleFornecedorCpfCnpjChange(e.target.value)} placeholder="000.000.000-00" className={`w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 ${fornecedorCpfCnpjError ? 'ring-1 ring-red-500' : 'focus:ring-[#39FF14]'}`} />
                                    {fornecedorCpfCnpjError && <p className="text-red-500 text-xs font-bold mt-1">{fornecedorCpfCnpjError}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2">WhatsApp</label>
                                    <input type="text" value={fornecedorWhatsapp} onChange={e => setFornecedorWhatsapp(e.target.value)} placeholder="(00) 00000-0000" className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14]" />
                                </div>
                                {fornecedorType === 'FUNCIONÁRIO' && (
                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2">Início na Empresa</label>
                                        <input type="date" value={fornecedorStartDate} onChange={e => setFornecedorStartDate(e.target.value)}
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] [color-scheme:dark]" />
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
                                        className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Valor (R$)</label>
                                    <input
                                        type="text"
                                        value={editingFinanceItem.editAmount}
                                        onChange={e => setEditingFinanceItem({ ...editingFinanceItem, editAmount: formatCurrency(e.target.value) })}
                                        required
                                        className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Data de Vencimento</label>
                                    <input
                                        type="date"
                                        value={editingFinanceItem.editDueDate}
                                        onChange={e => setEditingFinanceItem({ ...editingFinanceItem, editDueDate: e.target.value })}
                                        required
                                        className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold [color-scheme:dark]"
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
                                        className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold placeholder:text-zinc-600 resize-none"
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
                                className="bg-red-500 text-[#fff] px-6 py-3 rounded-2xl font-black uppercase text-sm hover:scale-105 transition-all shadow-lg shadow-red-500/20 flex items-center gap-2"
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
                                                                <span className="text-sm font-black uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: (grp?.color || '#6B7280') + '20', color: grp?.color || '#6B7280' }}>
                                                                    {conta.category}
                                                                </span>
                                                                <span className={`text-sm font-black uppercase px-2 py-0.5 rounded-full ${conta.recurrence === 'FIXA' ? 'bg-blue-500/10 text-blue-400' : conta.recurrence === 'VARIAVEL' ? 'bg-orange-500/10 text-orange-400' : 'bg-zinc-800 text-white/70'}`}>
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
                                                                    className="bg-[#39FF14] text-black px-3 py-2 rounded-xl text-sm font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-1">
                                                                    <Check size={12} /> Pagar
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => handleUndoContaPaid(conta.id)}
                                                                    className="text-white/70 hover:text-orange-400 transition-colors px-2 py-2 rounded-xl text-sm font-black uppercase">
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
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all placeholder:text-zinc-600"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-black uppercase tracking-widest text-white mb-2">WhatsApp</label>
                                            <input
                                                type="text"
                                                value={clientWhatsapp}
                                                onChange={e => setClientWhatsapp(e.target.value)}
                                                className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all placeholder:text-zinc-600"
                                                placeholder="(00) 00000-0000"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-black uppercase tracking-widest text-white mb-2">CPF/CNPJ</label>
                                            <input
                                                type="text"
                                                value={clientCpfCnpj}
                                                onChange={e => handleCpfCnpjChange(e.target.value)}
                                                className={`w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 transition-all placeholder:text-zinc-600 ${cpfCnpjError ? 'focus:ring-red-500 ring-1 ring-red-500' : 'focus:ring-[#39FF14] focus:bg-zinc-700'}`}
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
                                                className={`w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all placeholder:text-zinc-600 ${linkedSaleId ? 'opacity-60 cursor-not-allowed' : ''}`}
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
                                            className="w-full max-w-[200px] bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all [color-scheme:dark]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">
                                            Método de Entrega
                                        </label>
                                        <select
                                            value={deliveryMethod}
                                            onChange={e => setDeliveryMethod(e.target.value as 'MOTOBOY' | 'TRANSPORTADORA' | 'RETIRADA')}
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all appearance-none"
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
                                            className="w-full max-w-[200px] bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all [color-scheme:dark]"
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
                                                className="w-full max-w-[200px] bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all appearance-none"
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
                                                    className="w-full bg-zinc-800 border text-sm font-black uppercase tracking-widest border-zinc-800 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all appearance-none"
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
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all placeholder:text-zinc-600"
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
                                    className="w-full bg-zinc-800 border-transparent rounded-[24px] p-6 text-white outline-none focus:ring-1 focus:ring-red-500 focus:bg-zinc-700 transition-all font-semibold placeholder:text-zinc-600"
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
                                    className="flex-1 bg-red-500 text-[#fff] py-4 rounded-xl font-black uppercase text-xs hover:scale-105 transition-all shadow-lg shadow-red-500/10"
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
                                        className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold placeholder:text-zinc-600"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Detalhes</label>
                                    <textarea
                                        value={prodDetails}
                                        onChange={e => setProdDetails(e.target.value)}
                                        placeholder="Ex: Tamanhos disponíveis, cores, material..."
                                        rows={2}
                                        className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold placeholder:text-zinc-600 resize-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Foto do Produto</label>
                                    <div className="flex items-center gap-4">
                                        {prodImage ? (
                                            <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-zinc-800 shrink-0">
                                                <img src={prodImage} alt="Preview" className="w-full h-full object-cover" />
                                                <button type="button" onClick={() => setProdImage('')}
                                                    className="absolute -top-1 -right-1 bg-red-500 text-[#fff] rounded-full w-5 h-5 flex items-center justify-center text-sm">
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="w-16 h-16 rounded-xl border border-dashed border-zinc-700 flex items-center justify-center shrink-0">
                                                <Package size={20} className="text-white" />
                                            </div>
                                        )}
                                        <label className="flex-1 cursor-pointer">
                                            <div className="bg-zinc-800 border border-dashed border-zinc-700 rounded-2xl p-3 text-center hover:border-[#39FF14]/50 transition-all">
                                                <p className="text-sm font-bold text-white uppercase">
                                                    {prodImage ? 'Trocar foto' : 'Escolher foto'}
                                                </p>
                                            </div>
                                            <input type="file" accept="image/*" className="hidden" onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                if (file.size > 200000) {
                                                    toast.error('Imagem muito grande (máx 200KB)');
                                                    return;
                                                }
                                                const reader = new FileReader();
                                                reader.onload = () => setProdImage(reader.result as string);
                                                reader.readAsDataURL(file);
                                            }} />
                                        </label>
                                    </div>
                                </div>

                                {/* Imagens extras */}
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Fotos Extras ({prodImages.length}/3)</label>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {prodImages.map((img, idx) => (
                                            <div key={idx} className="relative w-14 h-14 rounded-xl overflow-hidden border border-zinc-800 shrink-0">
                                                <img src={img} alt={`Extra ${idx + 1}`} className="w-full h-full object-cover" />
                                                <button type="button" onClick={() => setProdImages(prodImages.filter((_, i) => i !== idx))}
                                                    className="absolute -top-1 -right-1 bg-red-500 text-[#fff] rounded-full w-4 h-4 flex items-center justify-center">
                                                    <X size={8} />
                                                </button>
                                            </div>
                                        ))}
                                        {prodImages.length < 3 && (
                                            <label className="w-14 h-14 rounded-xl border border-dashed border-zinc-700 flex items-center justify-center cursor-pointer hover:border-[#39FF14]/50 transition-all shrink-0">
                                                <Plus size={16} className="text-white/50" />
                                                <input type="file" accept="image/*" className="hidden" onChange={e => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    if (file.size > 200000) { toast.error('Imagem muito grande (máx 200KB)'); return; }
                                                    const reader = new FileReader();
                                                    reader.onload = () => setProdImages([...prodImages, reader.result as string]);
                                                    reader.readAsDataURL(file);
                                                }} />
                                            </label>
                                        )}
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
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold placeholder:text-zinc-600"
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
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-zinc-500 focus:bg-zinc-700 transition-all font-bold placeholder:text-zinc-600"
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
                                        className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold placeholder:text-zinc-600"
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

                            <label className="flex items-center gap-3 cursor-pointer bg-zinc-950/50 rounded-2xl p-4">
                                <input type="checkbox" checked={prodProntaEntrega} onChange={e => setProdProntaEntrega(e.target.checked)} className="w-5 h-5 rounded accent-[#39FF14]" />
                                <div>
                                    <span className="text-sm font-black uppercase tracking-widest text-white">Pronta Entrega</span>
                                    <p className="text-xs text-white/50 mt-0.5">Produto disponível para retirada imediata (se desmarcado, será Sob Encomenda)</p>
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
                                    className="w-full bg-zinc-800 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all placeholder:text-zinc-600 uppercase" required />
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
                                        className="w-full bg-zinc-800 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all placeholder:text-zinc-600" required />
                                </div>
                                {/* Dia de vencimento */}
                                <div>
                                    <label className="block text-sm font-black uppercase tracking-widest mb-2 text-white">Dia Vencimento *</label>
                                    <input type="number" min="1" max="31" value={contaDueDay} onChange={e => setContaDueDay(e.target.value)}
                                        placeholder="Ex: 10"
                                        className="w-full bg-zinc-800 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all placeholder:text-zinc-600" required />
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
                                    className="w-full bg-zinc-800 rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all placeholder:text-zinc-600 resize-none" />
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
                                className="flex-1 py-3 rounded-2xl bg-red-500 text-[#fff] font-black uppercase text-sm tracking-widest hover:bg-red-600 transition-all">
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
                                    className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold placeholder:text-zinc-600"
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
                                    className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold placeholder:text-zinc-600"
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
                                    className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold placeholder:text-zinc-600"
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
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold [color-scheme:dark]"
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
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold"
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
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold [color-scheme:dark]"
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
                                                            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#39FF14] [color-scheme:dark]"
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
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold"
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
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold [color-scheme:dark]"
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
                                                            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#39FF14] [color-scheme:dark]"
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
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold"
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
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold [color-scheme:dark]"
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
                                            className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold [color-scheme:dark]"
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
                                    className="w-full bg-zinc-800 border-transparent rounded-2xl p-4 text-white outline-none focus:ring-1 focus:ring-[#39FF14] focus:bg-zinc-700 transition-all font-bold placeholder:text-zinc-600 resize-none"
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
