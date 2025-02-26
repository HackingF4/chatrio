const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  room: {
    type: String,
    required: true,
    default: 'general'
  },
  type: {
    type: String,
    enum: ['text', 'image'],
    default: 'text'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Message', messageSchema); 