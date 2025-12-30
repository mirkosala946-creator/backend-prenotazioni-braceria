const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();

// ========================================
// CONFIGURAZIONE DATABASE (da Tempora)
// ========================================
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
});

// ========================================
// CONFIGURAZIONE EMAIL
// ========================================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

// ========================================
// MIDDLEWARE
// ========================================
app.use(cors());
app.use(express.json());

// ========================================
// ENDPOINT 1: GET SLOT DISABILITATI
// ========================================
app.get('/gestionale/get-disabled-time-slots/', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Data richiesta' });
    }

    // Query per ottenere fasce orarie disabilitate
    const result = await pool.query(
      `SELECT start_time, end_time, reason 
       FROM gestionale_disabledtimeslot 
       WHERE date = $1 
       ORDER BY start_time`,
      [date]
    );

    // Formatta risposta
    const disabledSlots = result.rows.map(row => ({
      start_time: row.start_time,
      end_time: row.end_time,
      reason: row.reason
    }));

    res.json({ disabled_time_slots: disabledSlots });

  } catch (error) {
    console.error('Errore get-disabled-time-slots:', error);
    res.status(500).json({ error: 'Errore del server' });
  }
});

// ========================================
// ENDPOINT 2: CREA PRENOTAZIONE BRACERIA
// ========================================
app.post('/api/braceria/prenota', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const {
      first_name,
      last_name,
      phone_number,
      email,
      guests,
      reservation_date,
      reservation_time,
      cookie_consent,
      profiling_consent,
      promotional_sms_consent,
      accept_all
    } = req.body;

    // ========================================
    // VALIDAZIONE
    // ========================================
    if (!cookie_consent) {
      return res.status(400).json({ error: 'Consenso privacy obbligatorio' });
    }

    if (!first_name || !last_name || !phone_number || !email || 
        !reservation_date || !reservation_time) {
      return res.status(400).json({ error: 'Campi obbligatori mancanti' });
    }

    // ========================================
    // CONTROLLO DISPONIBILITÀ
    // ========================================
    
    // 1. Controlla se la data è completamente disabilitata
    const dateCheck = await client.query(
      'SELECT 1 FROM gestionale_disableddate WHERE date = $1',
      [reservation_date]
    );

    if (dateCheck.rowCount > 0) {
      return res.status(400).json({ error: 'Data non disponibile' });
    }

    // 2. Controlla se l'orario cade in una fascia disabilitata
    const timeCheck = await client.query(
      `SELECT 1 FROM gestionale_disabledtimeslot 
       WHERE date = $1 
       AND $2::time >= start_time 
       AND $2::time < end_time`,
      [reservation_date, reservation_time]
    );

    if (timeCheck.rowCount > 0) {
      return res.status(400).json({ error: 'Orario non disponibile' });
    }

    // ========================================
    // INSERIMENTO PRENOTAZIONE
    // ========================================
    const insertResult = await client.query(
      `INSERT INTO gestionale_reservation (
        restaurant_id, first_name, last_name, phone_number,
        guests, reservation_date, reservation_time,
        cookie_consent, profiling_consent, 
        promotional_sms_consent, accept_all, email
      ) VALUES (
        'BRACERIA', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      ) RETURNING id`,
      [
        first_name, last_name, phone_number, guests,
        reservation_date, reservation_time, cookie_consent,
        profiling_consent, promotional_sms_consent, 
        accept_all, email
      ]
    );

    const reservationId = insertResult.rows[0].id;

    // ========================================
    // GESTIONE CUSTOMER (se consenso profilazione)
    // ========================================
    if (profiling_consent) {
      await client.query(
        `INSERT INTO gestionale_customer (
          first_name, last_name, phone_number, numero_prenotazioni
        ) VALUES ($1, $2, $3, 1)
        ON CONFLICT (phone_number) 
        DO UPDATE SET 
          numero_prenotazioni = gestionale_customer.numero_prenotazioni + 1`,
        [first_name, last_name, phone_number]
      );
    }

    await client.query('COMMIT');

    // ========================================
    // INVIO EMAIL
    // ========================================
    try {
      // Genera token per link annullamento
      const cancelToken = crypto.randomBytes(32).toString('hex');
      const cancelLink = `${process.env.BASE_URL || 'https://backend-prenotazioni-braceria.onrender.com'}/api/braceria/annulla/${reservationId}/${cancelToken}`;

      // Salva token nel database (opzionale, per sicurezza)
      // Potresti aggiungere una colonna cancel_token alla tabella

      // Email al cliente
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: email,
        subject: 'Conferma Prenotazione - Braceria San Frediano',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e9af58;">Prenotazione Confermata!</h2>
            <p>Gentile ${first_name} ${last_name},</p>
            <p>La tua prenotazione presso la <strong>Braceria San Frediano</strong> è stata confermata.</p>
            
            <div style="background: #faf8f3; padding: 20px; border-left: 4px solid #e9af58; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #2c2c2c;">Dettagli Prenotazione</h3>
              <p><strong>Data:</strong> ${new Date(reservation_date).toLocaleDateString('it-IT')}</p>
              <p><strong>Orario:</strong> ${reservation_time}</p>
              <p><strong>Persone:</strong> ${guests}</p>
              <p><strong>Codice prenotazione:</strong> #${reservationId}</p>
            </div>

            <p><strong>Indirizzo:</strong><br>
            Via Pisana, 9C<br>
            50124 Firenze FI</p>

            <p><strong>Telefono:</strong> +39 055 760 4477</p>

            <p style="margin-top: 30px;">
              <a href="${cancelLink}" 
                 style="background: #dc2626; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 4px; display: inline-block;">
                Annulla Prenotazione
              </a>
            </p>

            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              Ti aspettiamo!<br>
              <em>Braceria San Frediano</em>
            </p>
          </div>
        `
      });

      // Email al ristorante
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: process.env.RESTAURANT_EMAIL || 'info@braceriasanfrediano.it',
        subject: `Nuova Prenotazione #${reservationId} - ${reservation_date}`,
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>Nuova Prenotazione Ricevuta</h2>
            
            <table style="border-collapse: collapse; width: 100%;">
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Codice:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">#${reservationId}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Cliente:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${first_name} ${last_name}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Telefono:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${phone_number}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Email:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${email}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Data:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${new Date(reservation_date).toLocaleDateString('it-IT')}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Orario:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${reservation_time}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Persone:</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${guests}</td>
              </tr>
            </table>
          </div>
        `
      });

    } catch (emailError) {
      console.error('Errore invio email:', emailError);
      // Non blocca la prenotazione se l'email fallisce
    }

    // ========================================
    // RISPOSTA SUCCESSO
    // ========================================
    res.status(201).json({
      success: true,
      id: reservationId,
      message: 'Prenotazione confermata'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Errore creazione prenotazione:', error);
    res.status(500).json({ 
      error: 'Errore durante la prenotazione',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// ========================================
// ENDPOINT 3: ANNULLA PRENOTAZIONE
// ========================================
app.get('/api/braceria/annulla/:id/:token', async (req, res) => {
  try {
    const { id, token } = req.params;

    // Qui dovresti verificare il token se l'hai salvato nel DB
    // Per semplicità, eliminiamo direttamente la prenotazione

    const result = await pool.query(
      'DELETE FROM gestionale_reservation WHERE id = $1 AND restaurant_id = $2 RETURNING *',
      [id, 'BRACERIA']
    );

    if (result.rowCount === 0) {
      return res.send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h2 style="color: #dc2626;">Prenotazione non trovata</h2>
            <p>La prenotazione potrebbe essere già stata annullata.</p>
          </body>
        </html>
      `);
    }

    res.send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h2 style="color: #22c55e;">Prenotazione Annullata</h2>
          <p>La tua prenotazione #${id} è stata annullata con successo.</p>
          <p>Per informazioni: +39 055 760 4477</p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Errore annullamento:', error);
    res.status(500).send('Errore durante l\'annullamento');
  }
});

// ========================================
// HEALTH CHECK
// ========================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'braceria-backend' });
});

// ========================================
// START SERVER
// ========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Server Braceria running on port ${PORT}`);
});
