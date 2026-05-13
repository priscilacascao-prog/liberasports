import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';

const appId = 'libera-sports-v1';
const subsPath = `artifacts/${appId}/public/data/push_subscriptions`;

// Remove a inscrição de um device (quando o usuário desliga as notificações)
export async function POST(request: NextRequest) {
    try {
        const { endpoint } = await request.json();
        if (!endpoint) return NextResponse.json({ error: 'endpoint obrigatório' }, { status: 400 });

        const snap = await getDocs(query(collection(db, subsPath), where('endpoint', '==', endpoint)));
        for (const d of snap.docs) {
            await deleteDoc(doc(db, subsPath, d.id));
        }
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
    }
}
