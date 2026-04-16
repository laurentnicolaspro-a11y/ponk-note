const { Resend } = require('resend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, name, pdfBase64, title, datetime } = req.body;

    if (!email || !pdfBase64) {
      return res.status(400).json({ error: 'Email et PDF requis' });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    // Convert base64 to buffer
    const pdfBuffer = Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ''), 'base64');

    const fileName = `ponk-note-${new Date().toISOString().slice(0,10)}.pdf`;

    await resend.emails.send({
      from: 'Ponk Note <onboarding@resend.dev>',
      to: email,
      subject: `📝 Ponk Note — ${title || 'Analyse'}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1c1c1c;">
          <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 8px">Ponk Note</h2>
          <p style="color: #aaa; font-size: 13px; margin: 0 0 24px">${datetime || ''}</p>
          <p style="font-size: 15px; line-height: 1.6;">
            Bonjour ${name || ''} 👋<br><br>
            Voici l'analyse de ta réunion <strong>${title || ''}</strong> en pièce jointe.
          </p>
          <p style="font-size: 13px; color: #aaa; margin-top: 32px;">Envoyé depuis Ponk Note</p>
        </div>
      `,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
        }
      ]
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[sendmail] Error:', err);
    return res.status(500).json({ error: err.message || 'Erreur envoi email' });
  }
};
