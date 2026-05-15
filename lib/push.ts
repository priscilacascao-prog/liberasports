// Helpers de Web Push usados no dashboard
import { db } from '@/lib/firebase';
import { collection, addDoc, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';

const appId = 'libera-sports-v1';
const subsPath = `artifacts/${appId}/public/data/push_subscriptions`;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const out = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
    return out;
}

export function isPushSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getCurrentPushPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    return Notification.permission;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
    if (!isPushSupported()) return null;
    try {
        const reg = await navigator.serviceWorker.ready;
        return await reg.pushManager.getSubscription();
    } catch {
        return null;
    }
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!isPushSupported()) return null;
    try {
        const existing = await navigator.serviceWorker.getRegistration('/');
        if (existing) return existing;
        return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    } catch (err) {
        console.error('Falha ao registrar service worker:', err);
        return null;
    }
}

export async function enablePush(opts: { userId: string; userEmail: string }): Promise<{ ok: boolean; reason?: string }> {
    if (!isPushSupported()) return { ok: false, reason: 'Push não suportado neste navegador/dispositivo' };

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
    if (!publicKey) return { ok: false, reason: 'Sistema não configurado (VAPID ausente)' };

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'Permissão negada pelo usuário' };

    const reg = await ensureServiceWorker();
    if (!reg) return { ok: false, reason: 'Service Worker indisponível' };

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
        try {
            subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
            });
        } catch (err: any) {
            return { ok: false, reason: err?.message || 'Erro ao inscrever' };
        }
    }

    // Salva direto do navegador (com auth do Firebase) — a rota /api/push/subscribe
    // não funcionaria porque server-side não tem sessão do usuário
    try {
        const subJson: any = subscription.toJSON();
        // Remove inscrições anteriores do mesmo endpoint (re-registro)
        const existing = await getDocs(query(collection(db, subsPath), where('endpoint', '==', subJson.endpoint)));
        for (const d of existing.docs) {
            await deleteDoc(doc(db, subsPath, d.id));
        }
        await addDoc(collection(db, subsPath), {
            endpoint: subJson.endpoint,
            keys: subJson.keys || {},
            user_id: opts.userId,
            user_email: opts.userEmail,
            user_agent: navigator.userAgent,
            created_at: new Date().toISOString(),
        });
        return { ok: true };
    } catch (err: any) {
        return { ok: false, reason: err?.message || 'Erro ao salvar inscrição no banco' };
    }
}

export async function disablePush(): Promise<{ ok: boolean; reason?: string }> {
    if (!isPushSupported()) return { ok: false, reason: 'Push não suportado' };
    const subscription = await getCurrentSubscription();
    if (!subscription) return { ok: true };
    try {
        // Remove do Firestore direto pelo navegador
        const snap = await getDocs(query(collection(db, subsPath), where('endpoint', '==', subscription.endpoint)));
        for (const d of snap.docs) {
            await deleteDoc(doc(db, subsPath, d.id));
        }
        await subscription.unsubscribe();
        return { ok: true };
    } catch (err: any) {
        return { ok: false, reason: err?.message || 'Erro ao desativar' };
    }
}

export async function sendPushAfterSale(payload: {
    title: string;
    body: string;
    url?: string;
    tag?: string;
    data?: Record<string, any>;
}): Promise<void> {
    try {
        await fetch('/api/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        // Falha silenciosa: a notificação interna (sininho) ainda funciona
        console.error('Falha ao enviar push:', err);
    }
}
