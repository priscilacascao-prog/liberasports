import { Resend } from 'resend';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { html, to, subject } = await request.json();

        if (!html || !to || !subject) {
            return NextResponse.json({ error: 'Campos obrigatórios: html, to, subject' }, { status: 400 });
        }

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'RESEND_API_KEY não configurada' }, { status: 500 });
        }

        const resend = new Resend(apiKey);

        const { data, error } = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'Libera Sports <onboarding@resend.dev>',
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
        });

        if (error) {
            console.error('Resend error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, id: data?.id });
    } catch (error) {
        console.error('Send report error:', error);
        return NextResponse.json({ error: 'Erro ao enviar e-mail' }, { status: 500 });
    }
}
