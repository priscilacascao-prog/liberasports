import { Resend } from 'resend';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { html, to, subject, pdfBase64, pdfFilename } = await request.json();

        if (!to || !subject) {
            return NextResponse.json({ error: 'Campos obrigatórios: to, subject' }, { status: 400 });
        }
        if (!html && !pdfBase64) {
            return NextResponse.json({ error: 'Envie html ou pdfBase64' }, { status: 400 });
        }

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'RESEND_API_KEY não configurada' }, { status: 500 });
        }

        const resend = new Resend(apiKey);

        // Se tem PDF, envia como anexo com corpo simples
        const attachments = pdfBase64 ? [{
            filename: pdfFilename || 'relatorio.pdf',
            content: pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64,
        }] : undefined;

        const emailBody = pdfBase64
            ? `<div style="font-family: Arial, sans-serif; padding: 20px; color: #111;">
                <h2 style="color: #111; margin: 0 0 12px 0;">LIBERA SPORTS</h2>
                <p style="margin: 0 0 8px 0; font-size: 15px;">Segue em anexo o relatório da <strong>${subject}</strong>.</p>
                <p style="margin: 12px 0 0 0; font-size: 13px; color: #666;">Este é um e-mail automático enviado pelo sistema Libera Sports.</p>
            </div>`
            : html;

        const { data, error } = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'Libera Sports <onboarding@resend.dev>',
            to: Array.isArray(to) ? to : [to],
            subject,
            html: emailBody,
            attachments,
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
