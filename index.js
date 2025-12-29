import express from "express";
import cors from "cors";
import { pool } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/prenotazioni", async (req, res) => {
  const {
    first_name,
    last_name,
    phone_number,
    guests,
    reservation_date,
    reservation_time,
    email,
    profiling_consent = false,
    promotional_sms_consent = false,
    accept_all = false,
    cookie_consent
  } = req.body;

  if (
    !first_name ||
    !last_name ||
    !phone_number ||
    !reservation_date ||
    !reservation_time ||
    !email
  ) {
    return res.status(400).json({ error: "Dati mancanti" });
  }

  if (cookie_consent !== true) {
    return res.status(400).json({ error: "Consenso cookie obbligatorio" });
  }

  const client = await pool.connect();

  try {
    const dayBlocked = await client.query(
      "SELECT 1 FROM gestionale_disableddate WHERE date = $1",
      [reservation_date]
    );

    if (dayBlocked.rowCount > 0) {
      return res.status(409).json({ error: "Data non disponibile" });
    }

    const slotBlocked = await client.query(
      `
      SELECT 1
      FROM gestionale_disabledtimeslot
      WHERE date = $1
      AND $2::time >= start_time
      AND $2::time < end_time
      `,
      [reservation_date, reservation_time]
    );

    if (slotBlocked.rowCount > 0) {
      return res.status(409).json({ error: "Orario non disponibile" });
    }

    const insert = await client.query(
      `
      INSERT INTO gestionale_reservation (
        restaurant_id,
        first_name,
        last_name,
        phone_number,
        guests,
        reservation_date,
        reservation_time,
        cookie_consent,
        profiling_consent,
        promotional_sms_consent,
        accept_all,
        email
      )
      VALUES (
        'BRACERIA',
        $1,$2,$3,$4,$5,$6,
        TRUE,$7,$8,$9,$10
      )
      RETURNING id
      `,
      [
        first_name,
        last_name,
        phone_number,
        guests || 1,
        reservation_date,
        reservation_time,
        profiling_consent,
        promotional_sms_consent,
        accept_all,
        email
      ]
    );

    res.json({
      success: true,
      reservation_id: insert.rows[0].id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore server" });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Backend avviato sulla porta", PORT);
});
