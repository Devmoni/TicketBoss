# TicketBoss - Event Ticketing API

A production-ready event ticketing API with optimistic concurrency control for real-time seat reservations using PostgreSQL.

## 🎯 Overview

TicketBoss is a robust Node.js API that manages event seat reservations with instant accept/deny responses. It prevents over-selling while providing real-time seat availability updates through PostgreSQL database transactions.

## ✨ Features

- ✅ **Real-time seat reservations** with instant responses
- ✅ **Optimistic concurrency control** to prevent over-selling
- ✅ **PostgreSQL database** with ACID transactions
- ✅ **Input validation** and comprehensive error handling
- ✅ **RESTful API design** with intuitive endpoints
- ✅ **Connection pooling** for optimal performance
- ✅ **Graceful shutdown** handling

## 🚀 Setup Instructions

### Prerequisites

- **Node.js** (version 14 or higher)
- **PostgreSQL** (version 12 or higher)
- **npm** (comes with Node.js)

### Database Setup

1. **Install PostgreSQL:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install postgresql postgresql-contrib
   
   # macOS
   brew install postgresql
   
   # Windows: Download from postgresql.org
   ```

2. **Start PostgreSQL service:**
   ```bash
   # Ubuntu/Debian
   sudo systemctl start postgresql
   
   # macOS
   brew services start postgresql
   ```

3. **Create database and user:**
   ```bash
   sudo -u postgres psql
   ```
   
   In PostgreSQL prompt:
   ```sql
   CREATE DATABASE ticketboss;
   CREATE USER ticketboss_user WITH PASSWORD 'password';
   GRANT ALL PRIVILEGES ON DATABASE ticketboss TO ticketboss_user;
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ticketboss_user;
   GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ticketboss_user;
   \q
   ```

4. **Run database schema:**
   ```bash
   sudo -u postgres psql -d ticketboss -f database/schema.sql
   ```

### Application Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd ticketboss-api
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp config.env .env
   # Edit .env with your database settings
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

The server will start on port 3000 by default.

## 📚 API Documentation

### Base URL
```
http://localhost:3000
```

### Endpoints

#### 1. Event Bootstrap
Initialize the event with default data.

**Endpoint:** `POST /events/bootstrap`

**Request Body:** None

**Response (201 Created):**
```json
{
  "message": "Event initialized successfully",
  "event": {
    "event_id": "node-meetup-2025",
    "name": "Node.js Meet-up",
    "total_seats": 500,
    "available_seats": 500,
    "version": 0
  }
}
```

#### 2. Reserve Seats
Reserve seats for a partner.

**Endpoint:** `POST /reservations/`

**Request Body:**
```json
{
  "partnerId": "abc-corp",
  "seats": 3
}
```

**Response (201 Created):**
```json
{
  "reservationId": "reservation-1761579173127-v1rv6i7zn",
  "seats": 3,
  "status": "confirmed"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Seats must be between 1 and 10"
}
```

**Response (409 Conflict):**
```json
{
  "error": "Not enough seats left"
}
```

#### 3. Cancel Reservation
Cancel an existing reservation.

**Endpoint:** `DELETE /reservations/:reservationId`

**Request Body:** None

**Response (204 No Content):** Success

**Response (404 Not Found):**
```json
{
  "error": "Reservation not found"
}
```

#### 4. Event Summary
Get current event status and statistics.

**Endpoint:** `GET /reservations/`

**Request Body:** None

**Response (200 OK):**
```json
{
  "eventId": "node-meetup-2025",
  "name": "Node.js Meet-up",
  "totalSeats": 500,
  "availableSeats": 477,
  "reservationCount": 3,
  "version": 3
}
```

#### 5. Health Check
Check if the API is running.

**Endpoint:** `GET /health`

**Response (200 OK):**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-10-27T15:29:11.227Z"
}
```

## 🧪 Testing Instructions

### Complete Testing Flow

**Step 1: Initialize Event**
```bash
curl -X POST http://localhost:3000/events/bootstrap
```
**Expected:** Event reset to 500 available seats

**Step 2: Reserve Seats**
```bash
curl -X POST http://localhost:3000/reservations/ \
  -H "Content-Type: application/json" \
  -d '{"partnerId": "abc-corp", "seats": 3}'
```
**Expected:** Returns reservation ID and confirms 3 seats

**Step 3: Check Event Summary**
```bash
curl http://localhost:3000/reservations/
```
**Expected:** Available seats reduced by 3, reservation count = 1

**Step 4: Cancel Reservation**
```bash
curl -X DELETE http://localhost:3000/reservations/{reservationId}
```
**Expected:** Status 204 (No Content)

**Step 5: Verify Cancellation**
```bash
curl http://localhost:3000/reservations/
```
**Expected:** Available seats restored, reservation count = 0

### Error Testing

**Test 1: Too Many Seats**
```bash
curl -X POST http://localhost:3000/reservations/ \
  -H "Content-Type: application/json" \
  -d '{"partnerId": "test-corp", "seats": 15}'
```
**Expected:** Status 400 - "Seats must be between 1 and 10"

**Test 2: Insufficient Seats**
```bash
curl -X POST http://localhost:3000/reservations/ \
  -H "Content-Type: application/json" \
  -d '{"partnerId": "big-corp", "seats": 1000}'
```
**Expected:** Status 409 - "Not enough seats left"

**Test 3: Cancel Non-existent Reservation**
```bash
curl -X DELETE http://localhost:3000/reservations/non-existent-id
```
**Expected:** Status 404 - "Reservation not found"

## 🏗️ Technical Decisions

### Architecture Choices

1. **PostgreSQL Database**
   - **Reason:** ACID compliance, data persistence, and robust concurrency control
   - **Benefits:** Ensures data integrity and supports multiple concurrent users
   - **Implementation:** Row-level locking with `FOR UPDATE` for atomic operations

2. **Express.js Framework**
   - **Reason:** Simplicity and built-in middleware support
   - **Benefits:** Easy JSON parsing, error handling, and routing
   - **Implementation:** RESTful endpoints with proper HTTP methods

3. **Connection Pooling**
   - **Reason:** Efficient database connections and better performance
   - **Benefits:** Manages concurrent connections, reduces overhead
   - **Implementation:** PostgreSQL connection pool with configurable limits

4. **Optimistic Concurrency Control**
   - **Reason:** Prevents race conditions during seat reservations
   - **Benefits:** Instant responses without queuing
   - **Implementation:** Database transactions with version tracking

### Storage Method

- **Event Data:** PostgreSQL `events` table with version tracking and timestamps
- **Reservations:** PostgreSQL `reservations` table with foreign key relationships
- **Atomic Updates:** All seat updates performed within database transactions
- **Database Indexes:** Added on frequently queried columns for optimal performance
- **ACID Compliance:** Ensures data consistency and reliability

### Assumptions

1. **Database Availability:** PostgreSQL database is running and accessible
2. **Single Database Instance:** Connects to one PostgreSQL instance (scalable with read replicas)
3. **Partner Validation:** Partner IDs not validated against whitelist (can be added)
4. **Seat Limits:** Maximum 10 seats per reservation request (configurable)
5. **Transaction Isolation:** Uses PostgreSQL's READ COMMITTED level for optimal performance

## 📁 Project Structure

```
ticketboss-api/
├── package.json              # Dependencies and scripts
├── server.js                 # Main application file
├── config.env                # Environment configuration template
├── database/
│   └── schema.sql            # Database schema and initial data
├── setup-db.sh               # Database setup script
└── README.md                 # This file
```


## 🚨 Error Handling

The API includes comprehensive error handling for:

- **Missing required fields** → 400 Bad Request
- **Invalid seat counts** (must be 1-10) → 400 Bad Request
- **Insufficient seats available** → 409 Conflict
- **Non-existent reservations** → 404 Not Found
- **Already cancelled reservations** → 404 Not Found
- **Database connection errors** → 500 Internal Server Error
- **Server errors** → 500 Internal Server Error

All errors return appropriate HTTP status codes and descriptive error messages.

## 🔒 Security Features

- **SQL Injection Prevention:** Parameterized queries
- **Input Validation:** Comprehensive validation of all inputs
- **Error Information:** No sensitive data exposed in error messages
- **Database Security:** Proper user permissions and connection security

## 📈 Performance Features

- **Connection Pooling:** Efficient database connection management
- **Database Indexes:** Optimized queries for better performance
- **Atomic Transactions:** Fast, consistent operations
- **Row-level Locking:** Prevents race conditions without performance impact



## 🚀 Getting Started

1. **Follow the setup instructions above**
2. **Start the server:** `npm start`
3. **Test the API:** Use the provided curl commands
4. **Verify functionality:** Check all endpoints work correctly

## 📝 License

MIT License - feel free to use this code for your projects!

---

**TicketBoss API** - Production-ready event ticketing with PostgreSQL backend 🎫