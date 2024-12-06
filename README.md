# Live Polling System Backend

## Overview
A real-time polling application backend built with Express and Socket.io, enabling teachers to create polls and students to submit answers.

## Features
- Real-time poll creation
- 60-second answer window
- Live result tracking
- Unique student identification

## Setup Instructions
1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the server:
   ```
   node server.js
   ```

## Socket.io Events
### Teacher Events
- `create-poll`: Create a new poll
- `get-poll-results`: Retrieve current poll results

### Student Events
- `submit-answer`: Submit an answer to the current poll

## Technical Stack
- Node.js
- Express
- Socket.io
- CORS

## Environment
- Port: 5000 (configurable via environment variable)

## Future Enhancements
- Persistent storage
- Advanced authentication
- More detailed poll configurations
