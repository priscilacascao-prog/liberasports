import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, query, where, deleteDoc, doc } from 'firebase/firestore';

const appId = 'libera-sports-v1';
const subsPath = `artifacts/${appId}/public/data/push_subscriptions`;

// Salva uma nova inscrição de push (uma por dispositivo)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { subscription, user_id, user_email, user_agent } = body;

        if (!subscription?.endpoint) {
            return NextResponse.json({ error: 'subscription inválida' }, { status: 400 });
        }

        // Remove inscrições antigas do mesmo endpoint (re-registro do mesmo device)
        const existing = await getDocs(query(collection(db, subsPath), where('endpoint', '==', subscription.endpoint)));
        for (const d of existing.docs) {
            await deleteDoc(doc(db, subsPath, d.id));
        }

        await addDoc(collection(db, subsPath), {
            endpoint: subscription.endpoint,
            keys: subscription.keys || {},
            user_id: user_id || '',
            user_email: user_email || '',
            user_agent: user_agent || '',
            created_at: new Date().toISOString(),
        });

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('Erro ao salvar inscrição push:', err);
        return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
    }
}
