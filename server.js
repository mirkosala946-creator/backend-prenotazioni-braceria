const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const sgMail = require('@sendgrid/mail');

const app = express();

// ========================================
// CONFIGURAZIONE SENDGRID
// ========================================
sgMail.setApiKey('SG.3_FU_12TTMGtzCICAw2tYg.sVtMU7UAPwO_rKkbO02i3G4W2vC-3VssMX2KSWNMG8w');
const SENDER_EMAIL = 'braceriasanfrediano@gmail.com';

// ========================================
// CONFIGURAZIONE DATABASE
// ========================================
const pool = new Pool({
  host: 'dpg-d2q7fdre5dus73bocfc0-a.frankfurt-postgres.render.com',
  port: 5432,
  database: 'datascarpetta',
  user: 'datauser',
  password: 'JCQqn4MKA2psf368X3Deox95DAAfV14N',
  ssl: {
    rejectUnauthorized: false
  }
});

// Test connessione database
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Errore connessione database:', err);
  } else {
    console.log('✅ Database connesso con successo!');
    release();
  }
});

// ========================================
// MIDDLEWARE
// ========================================
app.use(cors());
app.use(express.json());

// ========================================
// FUNZIONI EMAIL
// ========================================

function formatDate(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('it-IT', options);
}

function getEmailTemplateCliente(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: linear-gradient(135deg, #e9af58 0%, #d49840 100%); padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 32px; font-weight: 700; }
    .header p { color: #fff; margin: 10px 0 0 0; font-size: 14px; letter-spacing: 2px; }
    .content { padding: 40px 30px; }
    .reservation-box { background: #faf8f3; border: 2px solid #e9af58; border-radius: 8px; padding: 30px; margin: 30px 0; }
    .reservation-box h2 { color: #e9af58; margin: 0 0 20px 0; font-size: 24px; text-align: center; }
    .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e5e5; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { font-weight: 600; color: #666; }
    .detail-value { color: #2c2c2c; font-weight: 500; }
    .info-box { background: #f0f8ff; border-left: 4px solid #4a90e2; padding: 20px; margin: 30px 0; border-radius: 4px; }
    .info-box p { margin: 0; color: #2c5282; font-size: 14px; }
    .footer { background: #f5f5f5; padding: 30px; text-align: center; border-top: 1px solid #e5e5e5; }
    .footer p { margin: 5px 0; color: #666; font-size: 14px; }
    .footer a { color: #e9af58; text-decoration: none; font-weight: 500; }
    .divider { height: 2px; background: linear-gradient(90deg, transparent, #e9af58, transparent); margin: 30px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔥 BRACERIA SAN FREDIANO</h1>
      <p>PRENOTAZIONE CONFERMATA</p>
    </div>
    
    <div class="content">
      <p style="font-size: 18px; color: #2c2c2c;">Gentile <strong>${data.first_name} ${data.last_name}</strong>,</p>
      
      <p>Grazie per aver scelto la <strong>Braceria San Frediano</strong>! La tua prenotazione è stata confermata con successo.</p>
      
      <div class="reservation-box">
        <h2>📋 Dettagli Prenotazione</h2>
        
        <div class="detail-row">
          <span class="detail-label">📅 Data:</span>
          <span class="detail-value">${formatDate(data.reservation_date)}</span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">🕐 Orario:</span>
          <span class="detail-value">${data.reservation_time}</span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">👥 Numero Persone:</span>
          <span class="detail-value">${data.guests} ${data.guests === 1 ? 'persona' : 'persone'}</span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">📱 Telefono:</span>
          <span class="detail-value">${data.phone_number}</span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">📧 Email:</span>
          <span class="detail-value">${data.email}</span>
        </div>
      </div>
      
      <div class="info-box">
        <p><strong>ℹ️ Importante:</strong> Ti preghiamo di arrivare puntuale. In caso di ritardo superiore a 15 minuti, la prenotazione potrebbe essere cancellata.</p>
      </div>
      
      <div class="divider"></div>
      
      <p style="color: #666; font-size: 14px;">Se hai bisogno di modificare o cancellare la prenotazione, ti preghiamo di contattarci il prima possibile.</p>
      
      <p style="margin-top: 30px; font-size: 16px;">Ti aspettiamo! 🍖🔥</p>
    </div>
    
    <div class="footer">
      <p><strong>Braceria San Frediano</strong></p>
      <p>📍 Firenze, Italia</p>
      <p>📞 <a href="tel:+390557604477">+39 055 760 4477</a></p>
      <p>📧 <a href="mailto:braceriasanfrediano@gmail.com">braceriasanfrediano@gmail.com</a></p>
      <p style="margin-top: 20px; font-size: 12px; color: #999;">
        Questa è una email automatica, per favore non rispondere direttamente.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

function getEmailTemplateRistorante(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: linear-gradient(135deg, #2c5282 0%, #1e3a5f 100%); padding: 30px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; }
    .header p { color: #a0c4e8; margin: 10px 0 0 0; font-size: 12px; letter-spacing: 1px; }
    .content { padding: 30px; }
    .alert-box { background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .alert-box h2 { color: #856404; margin: 0 0 15px 0; font-size: 22px; }
    .data-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .data-table td { padding: 12px; border-bottom: 1px solid #e5e5e5; }
    .data-table td:first-child { font-weight: 600; color: #666; width: 40%; }
    .data-table td:last-child { color: #2c2c2c; }
    .highlight { background: #e8f4fd; padding: 15px; border-radius: 4px; margin: 20px 0; }
    .highlight strong { color: #1e3a5f; font-size: 18px; }
    .footer { background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #e5e5e5; }
    .footer p { margin: 5px 0; color: #666; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📬 NUOVA PRENOTAZIONE</h1>
      <p>BRACERIA SAN FREDIANO</p>
    </div>
    
    <div class="content">
      <div class="alert-box">
        <h2>⚡ Prenotazione Ricevuta</h2>
        <p style="margin: 0; color: #856404;">Una nuova prenotazione è stata registrata nel sistema.</p>
      </div>
      
      <div class="highlight">
        <strong>ID Prenotazione: #${data.reservation_id}</strong>
      </div>
      
      <table class="data-table">
        <tr>
          <td>👤 Cliente</td>
          <td><strong>${data.first_name} ${data.last_name}</strong></td>
        </tr>
        <tr>
          <td>📱 Telefono</td>
          <td><a href="tel:${data.phone_number}" style="color: #2c5282; text-decoration: none;">${data.phone_number}</a></td>
        </tr>
        <tr>
          <td>📧 Email</td>
          <td><a href="mailto:${data.email}" style="color: #2c5282; text-decoration: none;">${data.email}</a></td>
        </tr>
        <tr>
          <td>📅 Data</td>
          <td><strong style="color: #e9af58;">${formatDate(data.reservation_date)}</strong></td>
        </tr>
        <tr>
          <td>🕐 Orario</td>
          <td><strong style="color: #e9af58;">${data.reservation_time}</strong></td>
        </tr>
        <tr>
          <td>👥 Persone</td>
          <td><strong>${data.guests}</strong></td>
        </tr>
        <tr>
          <td>📝 Consensi</td>
          <td>
            Cookie: ✅<br>
            Profilazione: ${data.profiling_consent ? '✅' : '❌'}<br>
            SMS Promo: ${data.promotional_sms_consent ? '✅' : '❌'}
          </td>
        </tr>
      </table>
      
      <div style="background: #f0f8ff; padding: 15px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 0; color: #2c5282; font-size: 14px;">
          <strong>📌 Nota:</strong> Il cliente ha ricevuto una email di conferma automatica.
        </p>
      </div>
    </div>
    
    <div class="footer">
      <p><strong>Sistema Gestione Prenotazioni</strong></p>
      <p>Braceria San Frediano - Tempora Innovation</p>
      <p style="margin-top: 15px; font-size: 11px; color: #999;">
        Notifica automatica generata il ${new Date().toLocaleString('it-IT')}
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

async function inviaEmailConferma(prenotazione) {
  try {
    // Email al cliente
    const emailCliente = {
      to: prenotazione.email,
      from: {
        email: SENDER_EMAIL,
        name: 'Braceria San Frediano'
      },
      subject: `✅ Prenotazione Confermata - ${formatDate(prenotazione.reservation_date)} alle ${prenotazione.reservation_time}`,
      html: getEmailTemplateCliente(prenotazione)
    };

    // Email al ristorante
    const emailRistorante = {
      to: SENDER_EMAIL,
      from: {
        email: SENDER_EMAIL,
        name: 'Sistema Prenotazioni Braceria'
      },
      subject: `📬 Nuova Prenotazione #${prenotazione.reservation_id} - ${prenotazione.first_name} ${prenotazione.last_name}`,
      html: getEmailTemplateRistorante(prenotazione)
    };

    // Invio entrambe le email
    await Promise.all([
      sgMail.send(emailCliente),
      sgMail.send(emailRistorante)
    ]);

    console.log('✅ Email inviate con successo:', {
      cliente: prenotazione.email,
      ristorante: SENDER_EMAIL
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Errore invio email:', error);
    if (error.response) {
      console.error('SendGrid Response:', error.response.body);
    }
    return { success: false, error: error.message };
  }
}

// ========================================
// ENDPOINT 1: GET SLOT DISABILITATI
// ========================================
app.get('/gestionale/get-disabled-time-slots/', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Data richiesta' });
    }

    console.log('📅 Richiesta slot disabilitati per:', date);

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

    console.log('✅ Slot disabilitati trovati:', disabledSlots.length);
    res.json({ disabled_time_slots: disabledSlots });

  } catch (error) {
    console.error('❌ Errore get-disabled-time-slots:', error);
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

    console.log('📝 Nuova prenotazione ricevuta:', {
      nome: first_name,
      cognome: last_name,
      data: reservation_date,
      ora: reservation_time,
      persone: guests
    });

    // ========================================
    // VALIDAZIONE
    // ========================================
    if (!cookie_consent) {
      console.log('❌ Consenso privacy mancante');
      return res.status(400).json({ error: 'Consenso privacy obbligatorio' });
    }

    if (!first_name || !last_name || !phone_number || !email || 
        !reservation_date || !reservation_time) {
      console.log('❌ Campi obbligatori mancanti');
      return res.status(400).json({ error: 'Compila tutti i campi obbligatori' });
    }

    // ========================================
    // CONTROLLO DISPONIBILITÀ
    // ========================================
    
    console.log('🔍 Controllo disponibilità data...');
    const dateCheck = await client.query(
      'SELECT 1 FROM gestionale_disableddate WHERE date = $1',
      [reservation_date]
    );

    if (dateCheck.rowCount > 0) {
      console.log('❌ Data non disponibile');
      return res.status(400).json({ error: 'Data non disponibile' });
    }

    console.log('🔍 Controllo disponibilità orario...');
    const timeCheck = await client.query(
      `SELECT 1 FROM gestionale_disabledtimeslot 
       WHERE date = $1 
       AND $2::time >= start_time 
       AND $2::time < end_time`,
      [reservation_date, reservation_time]
    );

    if (timeCheck.rowCount > 0) {
      console.log('❌ Orario non disponibile');
      return res.status(400).json({ error: 'Orario non disponibile' });
    }

    console.log('✅ Data e orario disponibili');

    // ========================================
    // INSERIMENTO PRENOTAZIONE
    // ========================================
    console.log('💾 Salvataggio prenotazione nel database...');
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
    console.log('✅ Prenotazione salvata con ID:', reservationId);

    // ========================================
    // GESTIONE CUSTOMER (se consenso profilazione)
    // ========================================
    if (profiling_consent) {
      console.log('👤 Aggiornamento dati cliente...');
      await client.query(
        `INSERT INTO gestionale_customer (
          first_name, last_name, phone_number, numero_prenotazioni
        ) VALUES ($1, $2, $3, 1)
        ON CONFLICT (phone_number) 
        DO UPDATE SET 
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          numero_prenotazioni = gestionale_customer.numero_prenotazioni + 1`,
        [first_name, last_name, phone_number]
      );
      console.log('✅ Dati cliente aggiornati');
    }

    await client.query('COMMIT');
    console.log('✅ Transazione completata');

    // ========================================
    // INVIO EMAIL
    // ========================================
    console.log('📧 Invio email di conferma...');
    const emailData = {
      reservation_id: reservationId,
      first_name,
      last_name,
      phone_number,
      email,
      guests,
      reservation_date,
      reservation_time,
      profiling_consent: profiling_consent || false,
      promotional_sms_consent: promotional_sms_consent || false
    };

    const emailResult = await inviaEmailConferma(emailData);

    if (!emailResult.success) {
      console.warn('⚠️ Prenotazione salvata ma errore invio email:', emailResult.error);
    }

    // ========================================
    // RISPOSTA SUCCESSO
    // ========================================
    res.status(201).json({
      success: true,
      id: reservationId,
      message: 'Prenotazione confermata',
      email_sent: emailResult.success,
      data: {
        reservation_id: reservationId,
        first_name,
        last_name,
        reservation_date,
        reservation_time,
        guests
      }
    });

    console.log('🎉 Prenotazione completata con successo!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Errore creazione prenotazione:', error);
    res.status(500).json({ 
      error: 'Errore durante la prenotazione',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// ========================================
// HEALTH CHECK
// ========================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'braceria-backend',
    timestamp: new Date().toISOString(),
    email_configured: true
  });
});

// ========================================
// ROOT ENDPOINT
// ========================================
app.get('/', (req, res) => {
  res.json({
    service: 'Backend Prenotazioni Braceria San Frediano',
    version: '2.0.0',
    features: ['Database PostgreSQL', 'Email SendGrid', 'API REST'],
    endpoints: {
      health: 'GET /health',
      disabledSlots: 'GET /gestionale/get-disabled-time-slots/?date=YYYY-MM-DD',
      createReservation: 'POST /api/braceria/prenota'
    }
  });
});

// ========================================
// START SERVER
// ========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🔥 ========================================`);
  console.log(`🔥 Server Braceria attivo su porta ${PORT}`);
  console.log(`📧 Sistema email configurato (SendGrid)`);
  console.log(`🔥 ========================================\n`);
});
