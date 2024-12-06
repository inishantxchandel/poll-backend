const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();

app.use(
  cors({
    origin: "https://shivenpollingsystem.netlify.app",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "https://shivenpollingsystem.netlify.app",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});
// Track connected students and their socket IDs
const connectedStudents = new Map(); // studentName -> socketId
const studentSockets = new Map(); // socketId -> studentName
let currentPoll = null;
let pollResponses = new Map(); // studentName -> answer
let pollTimer = null;

// Debug socket connections
io.on("connection", (socket) => {
  console.log("Server: New client connected:", {
    id: socket.id,
    transport: socket.conn.transport.name,
  });

  // Send initial connection success
  socket.emit("connect_success", {
    message: "Successfully connected to server",
    id: socket.id,
  });

  socket.on("disconnect", () => {
    const studentName = studentSockets.get(socket.id);
    console.log("Server: Client disconnected:", {
      id: socket.id,
      studentName,
    });
    if (studentName) {
      connectedStudents.delete(studentName);
      studentSockets.delete(socket.id);
      io.emit("student-list-update", Array.from(connectedStudents.keys()));
    }
  });

  socket.on("student-join", (studentName) => {
    if (!studentName) {
      socket.emit("join-error", "Student name is required");
      return;
    }

    const existingSocketId = connectedStudents.get(studentName);
    if (existingSocketId && existingSocketId !== socket.id) {
      if (!io.sockets.sockets.get(existingSocketId)) {
        connectedStudents.delete(studentName);
        studentSockets.delete(existingSocketId);
      } else {
        socket.emit("join-error", "This name is already taken");
        return;
      }
    }

    connectedStudents.set(studentName, socket.id);
    studentSockets.set(socket.id, studentName);
    socket.emit("join-success", {
      message: `Welcome ${studentName}!`,
      currentPoll: currentPoll
        ? {
            ...currentPoll,
            hasAnswered: pollResponses.has(studentName),
          }
        : null,
    });

    if (currentPoll) {
      socket.emit("new-poll", currentPoll);
      if (
        pollResponses.has(studentName) ||
        Date.now() > currentPoll.expiresAt
      ) {
        const results = calculatePollResults();
        socket.emit("poll-results", results);
      }
    }

    io.emit("student-list-update", Array.from(connectedStudents.keys()));
  });

  socket.on("create-poll", async (pollData) => {
    try {
      console.log("Server: Received create-poll request:", pollData);

      if (!pollData) {
        console.error("Server: No poll data received");
        socket.emit("poll-error", "No poll data provided");
        return;
      }

      if (currentPoll) {
        console.error(
          "Server: Cannot create new poll, current poll is active:",
          currentPoll
        );
        socket.emit("poll-error", "A poll is already in progress");
        return;
      }

      if (
        !pollData.question ||
        !pollData.options ||
        pollData.options.length < 2
      ) {
        console.error("Server: Invalid poll data:", {
          hasQuestion: !!pollData.question,
          optionsLength: pollData.options?.length,
        });
        socket.emit("poll-error", "Invalid poll data");
        return;
      }

      const now = Date.now();
      const timeLimit = Math.min(Math.max(pollData.timeLimit || 60, 10), 300);
      const expiresAt = now + timeLimit * 1000;

      currentPoll = {
        question: pollData.question,
        options: pollData.options.filter((opt) => opt.trim()),
        createdAt: now,
        expiresAt: expiresAt,
        isActive: true,
      };

      console.log("Server: Created new poll:", currentPoll);

      pollResponses.clear();
      console.log("Server: Cleared previous poll responses");

      // Get all connected student sockets
      const connectedSockets = Array.from(studentSockets.keys());
      console.log("Server: Connected students:", connectedSockets.length);

      // Broadcast to all clients and verify
      io.emit("new-poll", currentPoll);
      console.log("Server: Broadcast new poll to all clients");

      // Verify broadcast
      const activeConnections = io.sockets.sockets.size;
      console.log("Server: Active socket connections:", activeConnections);

      if (pollTimer) {
        console.log("Server: Clearing existing poll timer");
        clearTimeout(pollTimer);
      }

      pollTimer = setTimeout(() => {
        if (currentPoll) {
          console.log("Server: Poll timer expired, ending poll");
          endPoll();
        }
      }, timeLimit * 1000);

      console.log("Server: Set poll timer for", timeLimit, "seconds");
    } catch (error) {
      console.error("Server: Error creating poll:", error);
      socket.emit("poll-error", "Failed to create poll");
    }
  });

  socket.on("submit-answer", async (answerData) => {
    try {
      console.log('submitted answer', answerData);
      const studentName = studentSockets.get(socket.id);

      if (!studentName) {
        socket.emit("poll-error", "You are not registered as a student");
        return;
      }

      if (!currentPoll) {
        socket.emit("poll-error", "No active poll");
        return;
      }

      if (pollResponses.has(studentName)) {
        socket.emit("poll-error", "You have already answered this poll");
        return;
      }

      if (Date.now() > currentPoll.expiresAt) {
        socket.emit("poll-error", "Poll has expired");
        return;
      }

      const answerIndex = parseInt(answerData.answer);
      if (
        isNaN(answerIndex) ||
        answerIndex < 0 ||
        answerIndex >= currentPoll.options.length
      ) {
        socket.emit("poll-error", "Invalid answer");
        return;
      }

      pollResponses.set(studentName, answerData.answer);
      socket.emit("answer-received", {
        message: "Your answer has been recorded",
      });

      const results = {
        results: currentPoll.options.map(
          (_, index) =>
            Array.from(pollResponses.values()).filter(
              (answer) => answer === index.toString()
            ).length
        ),
        totalResponses: pollResponses.size,
        totalStudents: connectedStudents.size,
        studentAnswer: answerIndex,
      };

      socket.emit("poll-results", results);

      if (pollResponses.size === connectedStudents.size) {
        clearTimeout(pollTimer);
        endPoll();
      }
    } catch (error) {
      console.error("Error submitting answer:", error);
      socket.emit("poll-error", "Failed to submit answer");
    }
  });

  socket.on("get-poll-results", () => {
    const studentName = studentSockets.get(socket.id);

    if (!currentPoll || !studentName) {
      socket.emit("poll-error", "No active poll or not registered");
      return;
    }

    if (pollResponses.has(studentName)) {
      const results = {
        results: currentPoll.options.map(
          (_, index) =>
            Array.from(pollResponses.values()).filter(
              (answer) => answer === index.toString()
            ).length
        ),
        totalResponses: pollResponses.size,
        totalStudents: connectedStudents.size,
        studentAnswer: parseInt(pollResponses.get(studentName)),
      };

      socket.emit("poll-results", results);
    }
  });

  socket.on("get-participatns", () => {
    const students = connectedStudents.keys();
    socket.emit("participants-fetched", students);
  });

  socket.on("chat", (chat) => {
    console.log('broadcasting');
    io.emit("broadcast", {chat, socketId: socket.id, user: studentSockets.get(socket.id) || 'Teacher'});
  });

  socket.on('remove-participant', (pariticpant) => {
    console.log('removed', pariticpant);
    const socketId = connectedStudents.get(pariticpant);
    connectedStudents.delete(pariticpant);
    studentSockets.delete(socketId);

    socket.emit("student-list-update", Array.from(connectedStudents.keys()));

    io.of('/').sockets.forEach(socket => {
      if (socket.id === socketId) {
        // Found the socket, now you can use it
        socket.emit('kickedout');
      }
    });
  })
});

function calculatePollResults() {
  if (!currentPoll) return null;

  const results = {};
  currentPoll.options.forEach((_, index) => {
    results[index] = Array.from(pollResponses.values()).filter(
      (answer) => answer === index.toString()
    ).length;
  });

  return {
    results,
    totalResponses: pollResponses.size,
    totalStudents: connectedStudents.size,
  };
}

function endPoll() {
  if (!currentPoll) return;

  const finalResults = calculatePollResults();
  io.emit("poll-ended", finalResults);

  currentPoll = null;
  pollResponses.clear();

  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

const PORT = process.env.PORT || 5002;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
