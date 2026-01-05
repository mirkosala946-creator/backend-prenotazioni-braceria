const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const sgMail = require('@sendgrid/mail');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// Configurazione SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('📧 Using SendGrid for emails');
} else {
  console.warn('⚠️ SENDGRID_API_KEY not set - email notifications disabled');
}

// Configurazione Database PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test connessione database
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to database:', err.stack);
  } else {
    console.log('✅ Connected to PostgreSQL database');
    release();
  }
});

// Funzione per inviare email
async function sendEmail(to, subject, text, html) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('Email not sent - SendGrid not configured');
    return { success: false, message: 'SendGrid not configured' };
  }

  const msg = {
    to: to,
    from: process.env.SENDGRID_FROM_EMAIL || 'noreply@braceria.com',
    subject: subject,
    text: text,
    html: html,
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ Email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return { success: false, error: error.message };
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Braceria Booking API',
    timestamp: new Date().toISOString()
  });
});

// GET - Ottieni tutte le prenotazioni
app.get('/api/prenotazioni', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM prenotazioni ORDER BY data, ora');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching prenotazioni:', error);
    res.status(500).json({ error: 'Errore nel recupero delle prenotazioni' });
  }
});

// POST - Crea nuova prenotazione
app.post('/api/prenotazioni', async (req, res) => {
  const { nome, telefono, email, data, ora, numero_persone, note } = req.body;

  if (!nome || !telefono || !data || !ora || !numero_persone) {
    return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO prenotazioni (nome, telefono, email, data, ora, numero_persone, note) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [nome, telefono, email, data, ora, numero_persone, note]
    );

    const prenotazione = result.rows[0];

    // Invia email di conferma al cliente
    if (email && process.env.SENDGRID_API_KEY) {
      const emailSubject = 'Conferma Prenotazione - Braceria';
      const emailText = `Ciao ${nome},\n\nLa tua prenotazione è confermata!\n\nDettagli:\nData: ${data}\nOra: ${ora}\nPersone: ${numero_persone}\n\nGrazie per averci scelto!\n\nBraceria`;
      const emailHtml = `
        <h2>Conferma Prenotazione</h2>
        <p>Ciao <strong>${nome}</strong>,</p>
        <p>La tua prenotazione è confermata!</p>
        <h3>Dettagli:</h3>
        <ul>
          <li><strong>Data:</strong> ${data}</li>
          <li><strong>Ora:</strong> ${ora}</li>
          <li><strong>Persone:</strong> ${numero_persone}</li>
          ${note ? `<li><strong>Note:</strong> ${note}</li>` : ''}
        </ul>
        <p>Grazie per averci scelto!</p>
        <p><em>Braceria</em></p>
      `;
      
      await sendEmail(email, emailSubject, emailText, emailHtml);
    }

    // Invia email di notifica al ristorante
    if (process.env.SENDGRID_API_KEY && process.env.RESTAURANT_EMAIL) {
      const notificationSubject = 'Nuova Prenotazione Ricevuta';
      const notificationText = `Nuova prenotazione:\n\nNome: ${nome}\nTelefono: ${telefono}\nEmail: ${email || 'Non fornita'}\nData: ${data}\nOra: ${ora}\nPersone: ${numero_persone}\nNote: ${note || 'Nessuna'}`;
      const notificationHtml = `
        <h2>Nuova Prenotazione</h2>
        <ul>
          <li><strong>Nome:</strong> ${nome}</li>
          <li><strong>Telefono:</strong> ${telefono}</li>
          <li><strong>Email:</strong> ${email || 'Non fornita'}</li>
          <li><strong>Data:</strong> ${data}</li>
          <li><strong>Ora:</strong> ${ora}</li>
          <li><strong>Persone:</strong> ${numero_persone}</li>
          ${note ? `<li><strong>Note:</strong> ${note}</li>` : ''}
        </ul>
      `;
      
      await sendEmail(process.env.RESTAURANT_EMAIL, notificationSubject, notificationText, notificationHtml);
    }

    res.status(201).json(prenotazione);
  } catch (error) {
    console.error('Error creating prenotazione:', error);
    res.status(500).json({ error: 'Errore nella creazione della prenotazione' });
  }
});

// DELETE - Elimina prenotazione
app.delete('/api/prenotazioni/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM prenotazioni WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }

    res.json({ message: 'Prenotazione eliminata', prenotazione: result.rows[0] });
  } catch (error) {
    console.error('Error deleting prenotazione:', error);
    res.status(500).json({ error: 'Errore nell\'eliminazione della prenotazione' });
  }
});

// PUT - Aggiorna stato prenotazione
app.put('/api/prenotazioni/:id', async (req, res) => {
  const { id } = req.params;
  const { stato } = req.body;

  try {
    const result = await pool.query(
      'UPDATE prenotazioni SET stato = $1 WHERE id = $2 RETURNING *',
      [stato, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating prenotazione:', error);
    res.status(500).json({ error: 'Errore nell\'aggiornamento della prenotazione' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔥 Server Braceria running on port ${PORT}`);
});
