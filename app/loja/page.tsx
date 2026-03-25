'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, getDocs, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ShoppingCart, Plus, Minus, Trash2, X, Loader2, LogOut, Package, History } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const appId = 'libera-sports-v1';
const productsPath = `artifacts/${appId}/public/data/produtos`;
const salesPath = `artifacts/${appId}/public/data/vendas`;
const financePath = `artifacts/${appId}/public/data/financeiro`;
const clientesPath = `artifacts/${appId}/public/data/clientes`;

const sizeOrder: Record<string, number> = { 'BB': 0, 'PP': 1, 'P': 2, 'M': 3, 'G': 4, 'GG': 5, 'XG': 6, 'XXG': 7, 'EG': 8, 'EXG': 9 };

function extractInfo(name: string) {
    let size = '';
    let color = '';
    let baseName = name;

    // Extrair tamanho TAM. X
    const tamMatch = name.match(/[-–]\s*TAM\.?\s*(\w+)/i);
    if (tamMatch) {
        size = tamMatch[1].toUpperCase();
        baseName = name.replace(tamMatch[0], '').trim();
    } else {
        // Extrair tamanho como palavra solta (PP, P, M, G, GG, etc.)
        const sizeMatch = name.match(/\b(BB|PP|XXG|EXG|XG|GG|EG|P|M|G)\b/i);
        if (sizeMatch) {
            size = sizeMatch[1].toUpperCase();
            baseName = name.replace(sizeMatch[0], '').trim();
        }
    }

    // Limpar nome base
    baseName = baseName.replace(/[-–]\s*$/, '').replace(/\s+/g, ' ').trim();

    return { baseName, size, color };
}

function getSizeWeight(size: string): number {
    if (sizeOrder[size] !== undefined) return sizeOrder[size];
    const num = parseInt(size);
    if (!isNaN(num)) return 10 + num;
    return 50;
}

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
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [selectedSize, setSelectedSize] = useState('');
    const [selectedQty, setSelectedQty] = useState(1);

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
                .filter((p: any) => p.show_in_store && p.stock > 0 && p.sale_price > 0);
            setProducts(data);
        };
        fetchProducts();
    }, []);

    // Agrupar produtos por nome base
    const groupedProducts = useMemo(() => {
        const groups: Record<string, { baseName: string; image: string; minPrice: number; variants: any[] }> = {};

        products.forEach((p: any) => {
            const { baseName, size } = extractInfo(p.name);
            const key = baseName.toUpperCase();

            if (!groups[key]) {
                groups[key] = {
                    baseName: baseName,
                    image: p.image || '',
                    minPrice: p.sale_price,
                    variants: [],
                };
            }

            groups[key].variants.push({ ...p, extractedSize: size });
            if (p.image && !groups[key].image) groups[key].image = p.image;
            if (p.sale_price < groups[key].minPrice) groups[key].minPrice = p.sale_price;
        });

        // Ordenar variantes por tamanho
        Object.values(groups).forEach(g => {
            g.variants.sort((a, b) => getSizeWeight(a.extractedSize) - getSizeWeight(b.extractedSize));
        });

        return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }));
    }, [products]);

    const filteredGroups = groupedProducts.filter(([key]) =>
        !searchTerm || key.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Produto selecionado no modal
    const selectedGroupData = selectedGroup ? groupedProducts.find(([key]) => key === selectedGroup)?.[1] : null;
    const selectedVariant = selectedGroupData?.variants.find((v: any) => v.extractedSize === selectedSize) || null;

    const cartTotal = cart.reduce((acc, item) => acc + item.sale_price * item.quantity, 0);

    const addToCart = (product: any, qty: number = 1) => {
        const existing = cart.find(i => i.id === product.id);
        if (existing) {
            const newQty = existing.quantity + qty;
            if (newQty > product.stock) { toast.error('Estoque insuficiente'); return; }
            setCart(cart.map(i => i.id === product.id ? { ...i, quantity: newQty } : i));
        } else {
            if (qty > product.stock) { toast.error('Estoque insuficiente'); return; }
            setCart([...cart, { ...product, quantity: qty }]);
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
            const allSales = await getDocs(query(collection(db, salesPath)));
            const maxNum = Math.max(...allSales.docs.map(d => parseInt((d.data().order_number || '').replace(/\D/g, '') || '0')), 0);
            const orderNumber = `LIBERA-${String(maxNum + 1).padStart(4, '0')}`;

            const saleData = {
                order_number: orderNumber, sale_number: orderNumber,
                items: cart.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, sale_price: i.sale_price, stock: i.stock })),
                total: cartTotal, value: cartTotal,
                client: clientData.name, client_whatsapp: clientData.whatsapp || '',
                cpf_cnpj: clientData.cpf_cnpj || '', client_email: clientData.email || user.email,
                client_uid: user.uid, delivery_method: deliveryMethod, payment_method: paymentMethod,
                description: observations || cart.map(i => `${i.quantity}x ${i.name}`).join(', '),
                has_production: true, status: 'AGUARDANDO APROVAÇÃO', source: 'LOJA',
                created_at: new Date().toISOString(), user_id: user.uid, operator_name: clientData.name,
                order_logs: [{ id: crypto.randomUUID(), old_status: 'INÍCIO', new_status: 'AGUARDANDO APROVAÇÃO', operator_name: clientData.name, created_at: new Date().toISOString() }]
            };

            const docRef = await addDoc(collection(db, salesPath), saleData);
            await addDoc(collection(db, financePath), {
                type: 'INFLOW', amount: cartTotal,
                description: `[${orderNumber}] Pedido Loja - ${clientData.name}`,
                status: 'A RECEBER', created_at: new Date().toISOString(),
                transaction_date: new Date().toISOString(), due_date: new Date().toISOString(),
                order_id: docRef.id, user_id: user.uid,
            });

            for (const item of cart) {
                const pRef = doc(db, productsPath, item.id);
                const pSnap = await getDoc(pRef);
                if (pSnap.exists()) {
                    await updateDoc(pRef, { stock: Math.max(0, (pSnap.data().stock || 0) - item.quantity) });
                }
            }

            toast.success('Pedido realizado com sucesso!');
            setCart([]); setShowCart(false); setShowCheckout(false); setObservations('');
            router.push('/loja/meus-pedidos');
        } catch (err) { console.error(err); toast.error('Erro ao realizar pedido'); }
        finally { setCheckoutLoading(false); }
    };

    if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="animate-spin text-black" size={40} /></div>;

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
                                <Link href="/loja/meus-pedidos" className="text-gray-500 hover:text-black transition-colors p-2" title="Meus Pedidos"><History size={20} /></Link>
                                <span className="text-sm font-bold text-gray-600 hidden md:block">{clientData?.name}</span>
                                <button onClick={async () => { await signOut(auth); router.push('/loja/login'); }} className="text-gray-400 hover:text-black transition-colors p-2" title="Sair"><LogOut size={18} /></button>
                            </>
                        ) : (
                            <Link href="/loja/login" className="bg-black text-white px-4 py-2 rounded-lg text-sm font-bold">Entrar</Link>
                        )}
                        <button onClick={() => setShowCart(true)} className="relative bg-black text-white p-2.5 rounded-xl hover:bg-gray-900 transition-colors">
                            <ShoppingCart size={20} />
                            {cart.length > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">{cart.reduce((a, i) => a + i.quantity, 0)}</span>}
                        </button>
                    </div>
                </div>
            </header>

            {/* Search */}
            <div className="max-w-6xl mx-auto px-4 py-6">
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar produtos..."
                    className="w-full border border-gray-200 rounded-xl p-3 text-black outline-none focus:border-black transition-colors text-sm font-medium bg-white" />
            </div>

            {/* Products Grid - Grouped */}
            <div className="max-w-6xl mx-auto px-4 pb-20">
                {filteredGroups.length === 0 ? (
                    <div className="text-center py-20">
                        <Package size={48} className="text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-400 font-bold">Nenhum produto disponível</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {filteredGroups.map(([key, group]) => (
                            <div key={key}
                                onClick={() => { setSelectedGroup(key); setSelectedSize(group.variants[0]?.extractedSize || ''); setSelectedQty(1); }}
                                className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow group cursor-pointer">
                                <div className="aspect-square bg-gray-100 relative overflow-hidden">
                                    {group.image ? (
                                        <img src={group.image} alt={group.baseName} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center"><Package size={40} className="text-gray-300" /></div>
                                    )}
                                    {group.variants.length > 1 && (
                                        <span className="absolute top-2 right-2 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-full">
                                            {group.variants.length} tamanhos
                                        </span>
                                    )}
                                </div>
                                <div className="p-4">
                                    <h3 className="text-sm font-black uppercase text-black leading-tight">{group.baseName}</h3>
                                    <p className="text-lg font-black text-black mt-2">
                                        {group.variants.length > 1 ? 'A partir de ' : ''}R$ {group.minPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                    {group.variants.length > 1 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {group.variants.slice(0, 6).map((v: any) => (
                                                <span key={v.id} className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{v.extractedSize || 'UN'}</span>
                                            ))}
                                            {group.variants.length > 6 && <span className="text-[10px] font-bold text-gray-400">+{group.variants.length - 6}</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Product Modal */}
            {selectedGroup && selectedGroupData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedGroup(null)} />
                    <div className="relative bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                        <button onClick={() => setSelectedGroup(null)} className="absolute top-4 right-4 z-10 bg-white/80 backdrop-blur rounded-full p-2 hover:bg-gray-100"><X size={20} /></button>

                        {/* Image */}
                        <div className="aspect-square bg-gray-100 relative overflow-hidden rounded-t-2xl">
                            {(selectedVariant?.image || selectedGroupData.image) ? (
                                <img src={selectedVariant?.image || selectedGroupData.image} alt={selectedGroupData.baseName} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center"><Package size={60} className="text-gray-300" /></div>
                            )}
                        </div>

                        <div className="p-6 space-y-5">
                            <div>
                                <h2 className="text-xl font-black uppercase text-black">{selectedGroupData.baseName}</h2>
                                {selectedVariant?.details && <p className="text-sm text-gray-500 mt-1">{selectedVariant.details}</p>}
                            </div>

                            {/* Tamanho */}
                            {selectedGroupData.variants.length > 1 && (
                                <div>
                                    <p className="text-xs font-bold uppercase text-gray-500 mb-2">Tamanho</p>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedGroupData.variants.map((v: any) => (
                                            <button key={v.id}
                                                onClick={() => { setSelectedSize(v.extractedSize); setSelectedQty(1); }}
                                                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${selectedSize === v.extractedSize
                                                    ? 'border-black bg-black text-white'
                                                    : 'border-gray-200 hover:border-gray-400 text-gray-700'
                                                } ${v.stock <= 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                                disabled={v.stock <= 0}
                                            >
                                                {v.extractedSize || 'UN'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Preço e estoque */}
                            {selectedVariant && (
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-2xl font-black text-black">R$ {selectedVariant.sale_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        <p className="text-xs text-gray-400">{selectedVariant.stock} em estoque</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setSelectedQty(Math.max(1, selectedQty - 1))} className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200"><Minus size={16} /></button>
                                        <span className="text-lg font-black w-8 text-center">{selectedQty}</span>
                                        <button onClick={() => setSelectedQty(Math.min(selectedVariant.stock, selectedQty + 1))} className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200"><Plus size={16} /></button>
                                    </div>
                                </div>
                            )}

                            {/* Adicionar */}
                            <button
                                onClick={() => {
                                    if (!selectedVariant) return;
                                    addToCart(selectedVariant, selectedQty);
                                    setSelectedGroup(null);
                                }}
                                disabled={!selectedVariant || selectedVariant.stock <= 0}
                                className="w-full bg-black text-white py-3.5 rounded-xl font-bold uppercase text-sm hover:bg-gray-900 transition-colors disabled:opacity-30"
                            >
                                Adicionar ao Carrinho
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                                <button onClick={() => updateQty(item.id, item.quantity - 1)} className="w-7 h-7 rounded-lg bg-black text-white flex items-center justify-center hover:bg-gray-800"><Minus size={14} /></button>
                                                <span className="text-sm font-black w-6 text-center text-black">{item.quantity}</span>
                                                <button onClick={() => updateQty(item.id, item.quantity + 1)} className="w-7 h-7 rounded-lg bg-black text-white flex items-center justify-center hover:bg-gray-800"><Plus size={14} /></button>
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
                                            <button onClick={() => setShowCheckout(true)} className="w-full bg-black text-white py-3 rounded-xl font-bold uppercase text-sm hover:bg-gray-900">Finalizar Pedido</button>
                                        ) : (
                                            <Link href="/loja/login" className="block w-full bg-black text-white py-3 rounded-xl font-bold uppercase text-sm text-center hover:bg-gray-900">Faça login para comprar</Link>
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
                                        <button onClick={() => setShowCheckout(false)} className="w-full py-2 text-sm font-bold text-gray-400 hover:text-black">Voltar</button>
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
