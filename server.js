const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

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
// ENDPOINT 1: GET SLOT DISABILITATI
// ========================================
app.get('/gestionale/get-disabled-time-slots/', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Data richiesta' });
    }

    console.log('📅 Richiesta slot disabilitati per:', date);

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
    
    // 1. Controlla se la data è completamente disabilitata
    console.log('🔍 Controllo disponibilità data...');
    const dateCheck = await client.query(
      'SELECT 1 FROM gestionale_disableddate WHERE date = $1',
      [reservation_date]
    );

    if (dateCheck.rowCount > 0) {
      console.log('❌ Data non disponibile');
      return res.status(400).json({ error: 'Data non disponibile' });
    }

    // 2. Controlla se l'orario cade in una fascia disabilitata
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
    // RISPOSTA SUCCESSO
    // ========================================
    res.status(201).json({
      success: true,
      id: reservationId,
      message: 'Prenotazione confermata',
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
    timestamp: new Date().toISOString()
  });
});

// ========================================
// ROOT ENDPOINT
// ========================================
app.get('/', (req, res) => {
  res.json({
    service: 'Backend Prenotazioni Braceria San Frediano',
    version: '1.0.0',
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
  console.log(`🔥 ========================================\n`);
});
