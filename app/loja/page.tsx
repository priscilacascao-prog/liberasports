'use client';

import React, { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, getDocs, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ShoppingCart, Plus, Minus, Trash2, X, Loader2, User, LogOut, Package, History } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const appId = 'libera-sports-v1';
const productsPath = `artifacts/${appId}/public/data/produtos`;
const salesPath = `artifacts/${appId}/public/data/vendas`;
const financePath = `artifacts/${appId}/public/data/financeiro`;
const clientesPath = `artifacts/${appId}/public/data/clientes`;

export default function LojaPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [clientData, setClientData] = useState<any>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [cart, setCart] = useState<any[]>([]);
    const [showCart, setShowCart] = useState(false);
    const [showCheckout, setShowCheckout] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [deliveryMethod, setDeliveryMethod] = useState('MOTOBOY');
    const [paymentMethod, setPaymentMethod] = useState('PIX');
    const [observations, setObservations] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            if (u) {
                setUser(u);
                const clientDoc = await getDoc(doc(db, clientesPath, u.uid));
                if (clientDoc.exists()) {
                    setClientData(clientDoc.data());
                } else {
                    router.push('/loja/login');
                    return;
                }
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [router]);

    useEffect(() => {
        const fetchProducts = async () => {
            const snap = await getDocs(query(collection(db, productsPath)));
            const data = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter((p: any) => p.show_in_store && p.stock > 0);
            setProducts(data);
        };
        fetchProducts();
    }, []);

    const cartTotal = cart.reduce((acc, item) => acc + item.sale_price * item.quantity, 0);

    const addToCart = (product: any) => {
        const existing = cart.find(i => i.id === product.id);
        if (existing) {
            if (existing.quantity >= product.stock) { toast.error('Estoque insuficiente'); return; }
            setCart(cart.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
        } else {
            setCart([...cart, { ...product, quantity: 1 }]);
        }
        toast.success(`${product.name} adicionado!`);
    };

    const updateQty = (id: string, qty: number) => {
        if (qty <= 0) { setCart(cart.filter(i => i.id !== id)); return; }
        const item = cart.find(i => i.id === id);
        if (item && qty > item.stock) { toast.error('Estoque insuficiente'); return; }
        setCart(cart.map(i => i.id === id ? { ...i, quantity: qty } : i));
    };

    const handleCheckout = async () => {
        if (!user || !clientData || cart.length === 0) return;
        setCheckoutLoading(true);
        try {
            // Gerar número do pedido
            const allSales = await getDocs(query(collection(db, salesPath)));
            const maxNum = Math.max(...allSales.docs.map(d => parseInt((d.data().order_number || '').replace(/\D/g, '') || '0')), 0);
            const orderNumber = `LIBERA-${String(maxNum + 1).padStart(4, '0')}`;

            // Criar venda
            const saleData = {
                order_number: orderNumber,
                sale_number: orderNumber,
                items: cart.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, sale_price: i.sale_price, stock: i.stock })),
                total: cartTotal,
                value: cartTotal,
                client: clientData.name,
                client_whatsapp: clientData.whatsapp || '',
                cpf_cnpj: clientData.cpf_cnpj || '',
                client_email: clientData.email || user.email,
                client_uid: user.uid,
                delivery_method: deliveryMethod,
                payment_method: paymentMethod,
                description: observations || cart.map(i => `${i.quantity}x ${i.name}`).join(', '),
                has_production: true,
                status: 'AGUARDANDO APROVAÇÃO',
                source: 'LOJA',
                created_at: new Date().toISOString(),
                user_id: user.uid,
                operator_name: clientData.name,
                order_logs: [{
                    id: crypto.randomUUID(),
                    old_status: 'INÍCIO',
                    new_status: 'AGUARDANDO APROVAÇÃO',
                    operator_name: clientData.name,
                    created_at: new Date().toISOString()
                }]
            };

            const docRef = await addDoc(collection(db, salesPath), saleData);

            // Registrar financeiro
            await addDoc(collection(db, financePath), {
                type: 'INFLOW',
                amount: cartTotal,
                description: `[${orderNumber}] Pedido Loja - ${clientData.name}`,
                status: 'A RECEBER',
                created_at: new Date().toISOString(),
                transaction_date: new Date().toISOString(),
                due_date: new Date().toISOString(),
                order_id: docRef.id,
                user_id: user.uid,
            });

            // Baixar estoque
            for (const item of cart) {
                const pRef = doc(db, productsPath, item.id);
                const pSnap = await getDoc(pRef);
                if (pSnap.exists()) {
                    await updateDoc(pRef, { stock: Math.max(0, (pSnap.data().stock || 0) - item.quantity) });
                }
            }

            toast.success('Pedido realizado com sucesso!');
            setCart([]);
            setShowCart(false);
            setShowCheckout(false);
            setObservations('');
            router.push('/loja/meus-pedidos');
        } catch (err) {
            console.error(err);
            toast.error('Erro ao realizar pedido');
        } finally {
            setCheckoutLoading(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="animate-spin text-black" size={40} /></div>;

    const filteredProducts = products.filter(p => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-black">
                            <Image src="/logo.png" alt="Libera Sports" fill className="object-cover" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black uppercase italic text-black">Libera Sports</h1>
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Loja Online</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {user ? (
                            <>
                                <Link href="/loja/meus-pedidos" className="text-gray-500 hover:text-black transition-colors p-2" title="Meus Pedidos">
                                    <History size={20} />
                                </Link>
                                <span className="text-sm font-bold text-gray-600 hidden md:block">{clientData?.name}</span>
                                <button onClick={async () => { await signOut(auth); router.push('/loja/login'); }}
                                    className="text-gray-400 hover:text-black transition-colors p-2" title="Sair">
                                    <LogOut size={18} />
                                </button>
                            </>
                        ) : (
                            <Link href="/loja/login" className="bg-black text-white px-4 py-2 rounded-lg text-sm font-bold">Entrar</Link>
                        )}
                        <button onClick={() => setShowCart(true)} className="relative bg-black text-white p-2.5 rounded-xl hover:bg-gray-900 transition-colors">
                            <ShoppingCart size={20} />
                            {cart.length > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">{cart.reduce((a, i) => a + i.quantity, 0)}</span>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            {/* Search */}
            <div className="max-w-6xl mx-auto px-4 py-6">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar produtos..."
                    className="w-full border border-gray-200 rounded-xl p-3 text-black outline-none focus:border-black transition-colors text-sm font-medium bg-white"
                />
            </div>

            {/* Products Grid */}
            <div className="max-w-6xl mx-auto px-4 pb-20">
                {filteredProducts.length === 0 ? (
                    <div className="text-center py-20">
                        <Package size={48} className="text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-400 font-bold">Nenhum produto disponível</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {filteredProducts.map(p => (
                            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow group">
                                <div className="aspect-square bg-gray-100 relative overflow-hidden">
                                    {p.image ? (
                                        <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Package size={40} className="text-gray-300" />
                                        </div>
                                    )}
                                </div>
                                <div className="p-4">
                                    <h3 className="text-sm font-black uppercase text-black leading-tight">{p.name}</h3>
                                    {p.details && <p className="text-xs text-gray-400 mt-1">{p.details}</p>}
                                    <p className="text-lg font-black text-black mt-2">R$ {p.sale_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    <p className="text-[10px] text-gray-400 uppercase">{p.stock} em estoque</p>
                                    <button
                                        onClick={() => addToCart(p)}
                                        disabled={p.stock <= 0}
                                        className="w-full mt-3 bg-black text-white py-2.5 rounded-xl text-sm font-bold uppercase hover:bg-gray-900 transition-colors disabled:opacity-30"
                                    >
                                        Adicionar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Cart Drawer */}
            {showCart && (
                <div className="fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowCart(false)} />
                    <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl flex flex-col">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-lg font-black uppercase">Carrinho</h2>
                            <button onClick={() => setShowCart(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {cart.length === 0 ? (
                                <div className="text-center py-12">
                                    <ShoppingCart size={40} className="text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-400 font-bold">Carrinho vazio</p>
                                </div>
                            ) : (
                                cart.map(item => (
                                    <div key={item.id} className="flex gap-3 bg-gray-50 rounded-xl p-3">
                                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 shrink-0">
                                            {item.image ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package size={20} className="text-gray-400" /></div>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-black uppercase text-black truncate">{item.name}</p>
                                            <p className="text-sm font-bold text-gray-500">R$ {item.sale_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <button onClick={() => updateQty(item.id, item.quantity - 1)} className="w-7 h-7 rounded-lg bg-gray-200 flex items-center justify-center hover:bg-gray-300"><Minus size={14} /></button>
                                                <span className="text-sm font-black w-6 text-center">{item.quantity}</span>
                                                <button onClick={() => updateQty(item.id, item.quantity + 1)} className="w-7 h-7 rounded-lg bg-gray-200 flex items-center justify-center hover:bg-gray-300"><Plus size={14} /></button>
                                                <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="ml-auto text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        {cart.length > 0 && (
                            <div className="p-4 border-t border-gray-100">
                                {!showCheckout ? (
                                    <>
                                        <div className="flex justify-between mb-4">
                                            <span className="font-bold text-gray-500 uppercase text-sm">Total</span>
                                            <span className="text-xl font-black">R$ {cartTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        {user ? (
                                            <button onClick={() => setShowCheckout(true)} className="w-full bg-black text-white py-3 rounded-xl font-bold uppercase text-sm hover:bg-gray-900">
                                                Finalizar Pedido
                                            </button>
                                        ) : (
                                            <Link href="/loja/login" className="block w-full bg-black text-white py-3 rounded-xl font-bold uppercase text-sm text-center hover:bg-gray-900">
                                                Faça login para comprar
                                            </Link>
                                        )}
                                    </>
                                ) : (
                                    <div className="space-y-3">
                                        <h3 className="font-black uppercase text-sm">Finalizar Pedido</h3>
                                        <div className="bg-gray-50 rounded-xl p-3">
                                            <p className="text-xs text-gray-400 uppercase font-bold">Cliente</p>
                                            <p className="text-sm font-bold">{clientData?.name}</p>
                                            <p className="text-xs text-gray-400">{clientData?.whatsapp} • {clientData?.email || user?.email}</p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Entrega</label>
                                            <select value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)}
                                                className="w-full border border-gray-200 rounded-xl p-2.5 text-sm font-medium outline-none focus:border-black">
                                                <option value="MOTOBOY">Motoboy</option>
                                                <option value="TRANSPORTADORA">Transportadora</option>
                                                <option value="RETIRADA">Retirada</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Pagamento</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {['PIX', 'BOLETO', 'CARTÃO'].map(m => (
                                                    <button key={m} type="button" onClick={() => setPaymentMethod(m === 'CARTÃO' ? 'CARTÃO CRÉDITO' : m)}
                                                        className={`py-2 rounded-lg text-xs font-bold uppercase border transition-colors ${paymentMethod === m || paymentMethod === (m === 'CARTÃO' ? 'CARTÃO CRÉDITO' : m) ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-gray-400'}`}>
                                                        {m}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Observações</label>
                                            <textarea value={observations} onChange={e => setObservations(e.target.value)} placeholder="Alguma observação..."
                                                rows={2} className="w-full border border-gray-200 rounded-xl p-2.5 text-sm outline-none focus:border-black resize-none" />
                                        </div>
                                        <div className="flex justify-between items-center pt-2">
                                            <span className="text-xl font-black">R$ {cartTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <button onClick={handleCheckout} disabled={checkoutLoading}
                                            className="w-full bg-black text-white py-3 rounded-xl font-bold uppercase text-sm hover:bg-gray-900 disabled:opacity-50">
                                            {checkoutLoading ? 'Processando...' : 'Confirmar Pedido'}
                                        </button>
                                        <button onClick={() => setShowCheckout(false)} className="w-full py-2 text-sm font-bold text-gray-400 hover:text-black">
                                            Voltar
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
