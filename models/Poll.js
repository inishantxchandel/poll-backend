const mongoose = require('mongoose');

const PollSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true
  },
  options: [{
    type: String,
    required: true
  }],
  createdBy: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Add banned students list
  bannedStudents: [{
    type: String
  }]
});

module.exports = mongoose.model('Poll', PollSchema);