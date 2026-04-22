'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { Loader2, CheckCircle2, MessageSquare, FileText, Package } from 'lucide-react';

const orcamentosCollectionPath = `artifacts/libera-sports-v1/public/data/orcamentos`;

export default function OrcamentoPublicPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    const [loading, setLoading] = useState(true);
    const [orc, setOrc] = useState<any>(null);
    const [docId, setDocId] = useState<string>('');
    const [comment, setComment] = useState('');
    const [showCommentBox, setShowCommentBox] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const snap = await getDocs(query(collection(db, orcamentosCollectionPath), where('share_token', '==', token)));
                if (snap.empty) {
                    setError('Orçamento não encontrado. Verifique o link com a Libera Sports.');
                    setLoading(false);
                    return;
                }
                const d = snap.docs[0];
                setDocId(d.id);
                setOrc({ id: d.id, ...d.data() });
            } catch (err) {
                console.error(err);
                setError('Erro ao carregar o orçamento.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [token]);

    const handleApprove = async () => {
        if (!docId) return;
        setSubmitting(true);
        try {
            await updateDoc(doc(db, orcamentosCollectionPath, docId), {
                status: 'APROVADO',
                approved_at: new Date().toISOString(),
            });
            setOrc({ ...orc, status: 'APROVADO' });
        } catch (err) {
            alert('Erro ao aprovar. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRequestChange = async () => {
        if (!docId) return;
        if (!comment.trim()) { alert('Por favor, escreva o que você gostaria de alterar.'); return; }
        setSubmitting(true);
        try {
            await updateDoc(doc(db, orcamentosCollectionPath, docId), {
                status: 'ALTERAÇÃO SOLICITADA',
                client_comments: comment.trim(),
                client_response_at: new Date().toISOString(),
            });
            setOrc({ ...orc, status: 'ALTERAÇÃO SOLICITADA', client_comments: comment.trim() });
            setShowCommentBox(false);
        } catch (err) {
            alert('Erro ao enviar. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="animate-spin text-[#39FF14]" size={48} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6">
                <div className="max-w-md text-center">
                    <FileText size={64} className="text-zinc-800 mx-auto mb-4" />
                    <h1 className="text-2xl font-black uppercase text-white mb-2">Orçamento indisponível</h1>
                    <p className="text-white/60 text-sm">{error}</p>
                </div>
            </div>
        );
    }

    const status = orc.status || 'PENDENTE';
    const isFinal = status === 'APROVADO' || status === 'CONVERTIDO' || status === 'RECUSADO';
    const statusMsg: Record<string, { bg: string; fg: string; msg: string; icon: any }> = {
        'PENDENTE': { bg: 'bg-yellow-500/10 border-yellow-500/30', fg: 'text-yellow-400', msg: 'Aguardando sua resposta', icon: FileText },
        'APROVADO': { bg: 'bg-emerald-500/10 border-emerald-500/30', fg: 'text-emerald-400', msg: 'Orçamento aprovado! A Libera Sports entrará em contato em breve.', icon: CheckCircle2 },
        'ALTERAÇÃO SOLICITADA': { bg: 'bg-blue-500/10 border-blue-500/30', fg: 'text-blue-400', msg: 'Sua solicitação de alteração foi enviada. A Libera Sports vai revisar e retornar.', icon: MessageSquare },
        'CONVERTIDO': { bg: 'bg-purple-500/10 border-purple-500/30', fg: 'text-purple-400', msg: 'Orçamento já virou pedido! Obrigado.', icon: CheckCircle2 },
        'RECUSADO': { bg: 'bg-red-500/10 border-red-500/30', fg: 'text-red-400', msg: 'Orçamento recusado.', icon: FileText },
    };
    const st = statusMsg[status] || statusMsg['PENDENTE'];
    const StatusIcon = st.icon;

    return (
        <div className="min-h-screen bg-black text-white pb-20">
            {/* Header */}
            <header className="border-b border-zinc-900 px-6 py-5">
                <div className="max-w-2xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-black italic uppercase tracking-tight text-[#39FF14]">Libera Sports</h1>
                        <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">Vista Libera e viva a liberdade</p>
                    </div>
                    <span className="text-xs font-bold text-white/50 uppercase">{orc.orcamento_number}</span>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
                {/* Status */}
                <div className={`${st.bg} border rounded-2xl p-4 flex items-center gap-3`}>
                    <StatusIcon size={24} className={st.fg} />
                    <div>
                        <p className={`text-xs font-black uppercase tracking-widest ${st.fg}`}>{status}</p>
                        <p className="text-sm text-white/80 mt-0.5">{st.msg}</p>
                    </div>
                </div>

                {/* Cliente */}
                <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-2">Cliente</p>
                    <h2 className="text-2xl font-black italic uppercase leading-tight">{orc.client}</h2>
                    {orc.client_whatsapp && <p className="text-sm text-white/60 mt-1">{orc.client_whatsapp}</p>}
                </section>

                {/* Itens */}
                <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-3 flex items-center gap-2">
                        <Package size={12} /> Itens do Orçamento
                    </p>
                    <div className="space-y-1.5">
                        {(orc.items || []).map((i: any, idx: number) => (
                            <div key={idx} className="flex justify-between bg-zinc-950 rounded-xl px-3 py-2.5 text-sm gap-2">
                                <span className="font-bold flex-1 min-w-0">{i.quantity}x {i.name}</span>
                                <span className="font-bold text-white/70 tabular-nums shrink-0">R$ {((i.sale_price || 0) * i.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                        ))}
                    </div>

                    {/* Totais */}
                    <div className="mt-4 pt-4 border-t border-zinc-800 space-y-1.5">
                        <div className="flex justify-between text-sm">
                            <span className="text-white/60">Subtotal</span>
                            <span className="font-bold tabular-nums">R$ {(orc.subtotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {orc.touca_discount > 0 && (
                            <div className="flex justify-between text-sm text-emerald-400">
                                <span>Desconto Atacado Toucas</span>
                                <span className="font-black tabular-nums">- R$ {orc.touca_discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                        )}
                        {orc.special_discount > 0 && (
                            <div className="flex justify-between text-sm text-purple-300">
                                <span>Desconto Especial{orc.special_discount_reason ? ` • ${orc.special_discount_reason}` : ''}</span>
                                <span className="font-black tabular-nums">- R$ {orc.special_discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-lg pt-2 border-t border-zinc-800">
                            <span className="font-black uppercase">Total</span>
                            <span className="font-black text-[#39FF14] tabular-nums">R$ {(orc.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </section>

                {/* Observações */}
                {orc.description && (
                    <section className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-2">Observações</p>
                        <p className="text-sm text-white/80 whitespace-pre-wrap">{orc.description}</p>
                    </section>
                )}

                {/* Dados extras */}
                <section className="grid grid-cols-2 gap-3 text-xs">
                    {orc.payment_method && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-1">Pagamento</p>
                            <p className="text-sm font-black">{orc.payment_method}</p>
                        </div>
                    )}
                    {orc.deadline && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-1">Prazo</p>
                            <p className="text-sm font-black">{orc.deadline.split('-').reverse().join('/')}</p>
                        </div>
                    )}
                </section>

                {/* Comentário anterior */}
                {orc.client_comments && (
                    <section className="bg-blue-500/5 border border-blue-500/20 rounded-3xl p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">💬 Sua solicitação anterior</p>
                        <p className="text-sm text-white/80 whitespace-pre-wrap">{orc.client_comments}</p>
                    </section>
                )}

                {/* Ações */}
                {!isFinal && (
                    <section className="space-y-3 pt-2">
                        {!showCommentBox ? (
                            <>
                                <button
                                    onClick={handleApprove}
                                    disabled={submitting}
                                    className="w-full bg-[#39FF14] text-black py-5 rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-[#39FF14]/20"
                                >
                                    <CheckCircle2 size={18} /> {submitting ? 'Enviando...' : 'Aprovar Orçamento'}
                                </button>
                                <button
                                    onClick={() => setShowCommentBox(true)}
                                    className="w-full bg-zinc-900 border border-zinc-800 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:border-blue-500/50 transition-all flex items-center justify-center gap-2"
                                >
                                    <MessageSquare size={16} /> Solicitar Alteração
                                </button>
                            </>
                        ) : (
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-5 space-y-3">
                                <p className="text-xs font-black uppercase text-blue-400">O que você gostaria de alterar?</p>
                                <textarea
                                    value={comment}
                                    onChange={e => setComment(e.target.value)}
                                    rows={5}
                                    placeholder="Ex: Gostaria de trocar o tamanho das camisetas de M para G, e adicionar 5 toucas..."
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white outline-none focus:border-blue-500/50 resize-none"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setShowCommentBox(false); setComment(''); }}
                                        className="flex-1 bg-zinc-800 text-white/70 hover:text-white py-3 rounded-xl font-black uppercase tracking-widest text-xs"
                                    >
                                        Voltar
                                    </button>
                                    <button
                                        onClick={handleRequestChange}
                                        disabled={submitting || !comment.trim()}
                                        className="flex-[2] bg-blue-500 text-white py-3 rounded-xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] transition-all disabled:opacity-50"
                                    >
                                        {submitting ? 'Enviando...' : 'Enviar Solicitação'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                <p className="text-center text-[10px] text-white/30 uppercase tracking-widest pt-4">
                    Gerado pela Libera Sports
                </p>
            </main>
        </div>
    );
}
