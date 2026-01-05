const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto');

const app = express();

// ========================================
// CONFIGURAZIONE SENDGRID
// ========================================
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

    const result = await pool.query(
      `SELECT start_time, end_time, reason 
       FROM gestionale_disabledtimeslot 
       WHERE date = $1 
       ORDER BY start_time`,
      [date]
    );

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

    // VALIDAZIONE
    if (!cookie_consent) {
      return res.status(400).json({ error: 'Consenso privacy obbligatorio' });
    }

    if (!first_name || !last_name || !phone_number || !email || 
        !reservation_date || !reservation_time) {
      return res.status(400).json({ error: 'Campi obbligatori mancanti' });
    }

    // CONTROLLO DISPONIBILITÀ
    const dateCheck = await client.query(
      'SELECT 1 FROM gestionale_disableddate WHERE date = $1',
      [reservation_date]
    );

    if (dateCheck.rowCount > 0) {
      return res.status(400).json({ error: 'Data non disponibile' });
    }

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

    // INSERIMENTO PRENOTAZIONE
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

    // GESTIONE CUSTOMER
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

    // INVIO EMAIL
    try {
      const cancelToken = crypto.randomBytes(32).toString('hex');
      const cancelLink = `${process.env.BASE_URL}/api/braceria/annulla/${reservationId}/${cancelToken}`;

      const dateFormatted = new Date(reservation_date).toLocaleDateString('it-IT', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Email al cliente
      const clientEmailMsg = {
        to: email,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL,
          name: 'Braceria San Frediano'
        },
        replyTo: process.env.RESTAURANT_EMAIL,
        subject: 'Conferma Prenotazione - Braceria San Frediano',
        html: `
          <!DOCTYPE html>
          <html>
          <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #faf8f3;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #faf8f3; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 2px solid #e9af58; border-radius: 8px;">
                    <tr>
                      <td style="background: linear-gradient(135deg, #e9af58 0%, #d49840 100%); padding: 30px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🔥 Braceria San Frediano</h1>
                        <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 14px; letter-spacing: 2px;">FIRENZE</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 30px;">
                        <h2 style="color: #2c2c2c; margin: 0 0 20px 0;">Prenotazione Confermata!</h2>
                        <p style="color: #666;">Gentile <strong>${first_name} ${last_name}</strong>,</p>
                        <p style="color: #666; margin: 0 0 30px 0;">
                          La tua prenotazione presso la <strong>Braceria San Frediano</strong> è stata confermata.
                        </p>
                        
                        <table width="100%" cellpadding="20" style="background-color: #faf8f3; border-left: 4px solid #e9af58;">
                          <tr>
                            <td>
                              <h3 style="color: #e9af58; margin: 0 0 15px 0;">Dettagli Prenotazione</h3>
                              <p style="margin: 5px 0;"><strong>Data:</strong> ${dateFormatted}</p>
                              <p style="margin: 5px 0;"><strong>Orario:</strong> ${reservation_time}</p>
                              <p style="margin: 5px 0;"><strong>Persone:</strong> ${guests}</p>
                              <p style="margin: 5px 0;"><strong>Codice:</strong> #${reservationId}</p>
                            </td>
                          </tr>
                        </table>
                        
                        <h3 style="margin: 30px 0 10px 0;">📍 Come Raggiungerci</h3>
                        <p style="color: #666; margin: 0;">
                          <strong>Via Pisana, 9C</strong><br>
                          50124 Firenze FI<br>
                          📞 <strong>+39 055 760 4477</strong>
                        </p>
                        
                        <table width="100%" cellpadding="20">
                          <tr>
                            <td align="center">
                              <a href="${cancelLink}" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold;">
                                ANNULLA PRENOTAZIONE
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #faf8f3; padding: 25px 30px; text-align: center;">
                        <p style="color: #666; margin: 0;">Ti aspettiamo! 🔥</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `
      };

      // Email al ristorante
      const restaurantEmailMsg = {
        to: process.env.RESTAURANT_EMAIL,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL,
          name: 'Sistema Prenotazioni Braceria'
        },
        subject: `🔥 Nuova Prenotazione #${reservationId} - ${dateFormatted}`,
        html: `
          <h2>🔥 Nuova Prenotazione Ricevuta</h2>
          <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 12px; border: 1px solid #ddd;"><strong>Codice:</strong></td><td style="padding: 12px; border: 1px solid #ddd;">#${reservationId}</td></tr>
            <tr><td style="padding: 12px; border: 1px solid #ddd;"><strong>Cliente:</strong></td><td style="padding: 12px; border: 1px solid #ddd;">${first_name} ${last_name}</td></tr>
            <tr><td style="padding: 12px; border: 1px solid #ddd;"><strong>Telefono:</strong></td><td style="padding: 12px; border: 1px solid #ddd;">${phone_number}</td></tr>
            <tr><td style="padding: 12px; border: 1px solid #ddd;"><strong>Email:</strong></td><td style="padding: 12px; border: 1px solid #ddd;">${email}</td></tr>
            <tr><td style="padding: 12px; border: 1px solid #ddd;"><strong>Data:</strong></td><td style="padding: 12px; border: 1px solid #ddd;">${dateFormatted}</td></tr>
            <tr><td style="padding: 12px; border: 1px solid #ddd;"><strong>Orario:</strong></td><td style="padding: 12px; border: 1px solid #ddd;">${reservation_time}</td></tr>
            <tr><td style="padding: 12px; border: 1px solid #ddd;"><strong>Persone:</strong></td><td style="padding: 12px; border: 1px solid #ddd;">${guests}</td></tr>
          </table>
        `
      };

      await sgMail.send(clientEmailMsg);
      console.log('✅ Email cliente inviata');
      
      await sgMail.send(restaurantEmailMsg);
      console.log('✅ Email ristorante inviata');

    } catch (emailError) {
      console.error('❌ Errore invio email:', emailError);
      if (emailError.response) {
        console.error('SendGrid error:', emailError.response.body);
      }
    }

    res.status(201).json({
      success: true,
      id: reservationId,
      message: 'Prenotazione confermata'
    });

  } catch (error)
