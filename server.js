const express = require('express');
const { Pool } = require('pg');
require('dotenv').config({ path: './config.env' });

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'ticketboss',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Database connection error:', err);
});

// Middleware
app.use(express.json());

// Helper function to validate seat count
function validateSeatCount(seats) {
  return seats > 0 && seats <= 10;
}

// Helper function to generate unique reservation ID
function generateReservationId() {
  return `reservation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 1. Event Bootstrap - Initialize event data
app.post('/events/bootstrap', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Reset event to initial state
    await client.query(`
      UPDATE events 
      SET available_seats = total_seats, version = 0, updated_at = CURRENT_TIMESTAMP
      WHERE event_id = 'node-meetup-2025'
    `);
    
    // Clear all reservations
    await client.query('DELETE FROM reservations');
    
    // Get updated event data
    const eventResult = await client.query(`
      SELECT event_id, name, total_seats, available_seats, version 
      FROM events 
      WHERE event_id = 'node-meetup-2025'
    `);
    
    await client.query('COMMIT');
    
    res.status(201).json({
      message: "Event initialized successfully",
      event: eventResult.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Bootstrap error:', error);
    res.status(500).json({
      error: "Failed to initialize event"
    });
  } finally {
    client.release();
  }
});

// 2. Reserve Seats
app.post('/reservations/', async (req, res) => {
  const { partnerId, seats } = req.body;
  
  // Validate input
  if (!partnerId || !seats) {
    return res.status(400).json({
      error: "Missing required fields: partnerId and seats"
    });
  }
  
  if (!validateSeatCount(seats)) {
    return res.status(400).json({
      error: "Seats must be between 1 and 10"
    });
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check current event state with row-level locking
    const eventResult = await client.query(`
      SELECT available_seats, version 
      FROM events 
      WHERE event_id = 'node-meetup-2025' 
      FOR UPDATE
    `);
    
    if (eventResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        error: "Event not found"
      });
    }
    
    const { available_seats, version } = eventResult.rows[0];
    
    // Check if enough seats are available
    if (available_seats < seats) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: "Not enough seats left"
      });
    }
    
    // Create reservation
    const reservationId = generateReservationId();
    await client.query(`
      INSERT INTO reservations (reservation_id, event_id, partner_id, seats, status)
      VALUES ($1, $2, $3, $4, 'confirmed')
    `, [reservationId, 'node-meetup-2025', partnerId, seats]);
    
    // Update event atomically
    await client.query(`
      UPDATE events 
      SET available_seats = available_seats - $1, 
          version = version + 1, 
          updated_at = CURRENT_TIMESTAMP
      WHERE event_id = 'node-meetup-2025'
    `, [seats]);
    
    await client.query('COMMIT');
    
    res.status(201).json({
      reservationId: reservationId,
      seats: seats,
      status: "confirmed"
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reservation error:', error);
    res.status(500).json({
      error: "Failed to create reservation"
    });
  } finally {
    client.release();
  }
});

// 3. Cancel Reservation
app.delete('/reservations/:reservationId', async (req, res) => {
  const { reservationId } = req.params;
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get reservation details
    const reservationResult = await client.query(`
      SELECT seats, status 
      FROM reservations 
      WHERE reservation_id = $1
    `, [reservationId]);
    
    if (reservationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: "Reservation not found"
      });
    }
    
    const { seats, status } = reservationResult.rows[0];
    
    if (status === "cancelled") {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: "Reservation already cancelled"
      });
    }
    
    // Update reservation status
    await client.query(`
      UPDATE reservations 
      SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
      WHERE reservation_id = $1
    `, [reservationId]);
    
    // Return seats to the pool
    await client.query(`
      UPDATE events 
      SET available_seats = available_seats + $1, 
          version = version + 1, 
          updated_at = CURRENT_TIMESTAMP
      WHERE event_id = 'node-meetup-2025'
    `, [seats]);
    
    await client.query('COMMIT');
    
    res.status(204).send();
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cancellation error:', error);
    res.status(500).json({
      error: "Failed to cancel reservation"
    });
  } finally {
    client.release();
  }
});

// 4. Event Summary
app.get('/reservations/', async (req, res) => {
  const client = await pool.connect();
  
  try {
    // Get event data
    const eventResult = await client.query(`
      SELECT event_id, name, total_seats, available_seats, version 
      FROM events 
      WHERE event_id = 'node-meetup-2025'
    `);
    
    if (eventResult.rows.length === 0) {
      return res.status(500).json({
        error: "Event not found"
      });
    }
    
    // Count active reservations
    const reservationCountResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM reservations 
      WHERE event_id = 'node-meetup-2025' AND status = 'confirmed'
    `);
    
    const event = eventResult.rows[0];
    const reservationCount = parseInt(reservationCountResult.rows[0].count);
    
    res.status(200).json({
      eventId: event.event_id,
      name: event.name,
      totalSeats: event.total_seats,
      availableSeats: event.available_seats,
      reservationCount: reservationCount,
      version: event.version
    });
    
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({
      error: "Failed to get event summary"
    });
  } finally {
    client.release();
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    
    res.status(200).json({
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      database: "disconnected",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Internal server error"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found"
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`TicketBoss API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Event bootstrap: POST http://localhost:${PORT}/events/bootstrap`);
  console.log(`Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
});

module.exports = app;