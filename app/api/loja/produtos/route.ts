import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

const appId = 'libera-sports-v1';
const productsPath = `artifacts/${appId}/public/data/produtos`;

// Endpoint server-side que busca produtos do Firestore e retorna JSON.
// Existe pra que a /loja funcione em qualquer navegador, incluindo o
// WebView do Instagram/TikTok que tem briga com o SDK do Firebase no
// cliente. As Security Rules do Firestore permitem leitura pública,
// então este fetch funciona sem credenciais de admin.
export async function GET() {
    try {
        const snap = await getDocs(collection(db, productsPath));
        const products = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as any))
            .filter((p: any) => p.show_in_store && p.stock > 0 && p.sale_price > 0);

        return NextResponse.json(
            { products },
            {
                headers: {
                    // Cache curto: produtos podem mudar (estoque, novos cadastros)
                    // mas não a ponto de precisar revalidar a cada request.
                    'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
                },
            }
        );
    } catch (err: any) {
        console.error('[/api/loja/produtos] Erro:', err);
        return NextResponse.json(
            { products: [], error: err?.message || 'Erro ao buscar produtos' },
            { status: 500 }
        );
    }
}

// Garante que este endpoint é dinâmico (não cacheado no build),
// porque ele lê do Firestore que pode mudar.
export const dynamic = 'force-dynamic';
export const revalidate = 15;
