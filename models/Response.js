const mongoose = require('mongoose');

const ResponseSchema = new mongoose.Schema({
  pollId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Poll',
    required: true
  },
  studentName: {
    type: String,
    required: true
  },
  answer: {
    type: String,
    required: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  // Add status field to track if response is valid (not from banned student)
  isValid: {
    type: Boolean,
    default: true
  }
});

module.exports = mongoose.model('Response', ResponseSchema);