import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import webpush from 'web-push';

const appId = 'libera-sports-v1';
const subsPath = `artifacts/${appId}/public/data/push_subscriptions`;

// Configura VAPID uma vez quando o módulo é carregado
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:libera.sports1@gmail.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

// Dispara push para TODOS os devices inscritos.
// Body: { title, body, url, tag, data }
export async function POST(request: NextRequest) {
    try {
        if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
            return NextResponse.json({ error: 'VAPID keys não configuradas' }, { status: 500 });
        }

        const payload = await request.json();
        const subsSnap = await getDocs(collection(db, subsPath));

        if (subsSnap.empty) {
            return NextResponse.json({ ok: true, sent: 0, message: 'Nenhum dispositivo inscrito' });
        }

        let sent = 0;
        let failed = 0;

        // Envia em paralelo
        const results = await Promise.allSettled(
            subsSnap.docs.map(async (d) => {
                const data = d.data();
                const subscription = {
                    endpoint: data.endpoint,
                    keys: data.keys,
                };
                try {
                    await webpush.sendNotification(
                        subscription as any,
                        JSON.stringify(payload)
                    );
                    sent++;
                } catch (err: any) {
                    failed++;
                    // 404 ou 410 = subscription expirada/inválida → remover do banco
                    if (err?.statusCode === 404 || err?.statusCode === 410) {
                        try { await deleteDoc(doc(db, subsPath, d.id)); } catch {}
                    } else {
                        console.error('Erro ao enviar push:', err?.statusCode, err?.body || err?.message);
                    }
                }
            })
        );

        return NextResponse.json({ ok: true, sent, failed, total: subsSnap.docs.length });
    } catch (err: any) {
        console.error('Erro no /api/push/send:', err);
        return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
    }
}
