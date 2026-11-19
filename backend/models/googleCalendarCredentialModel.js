const mongoose = require("mongoose");

const credentialSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "shared" },
  encryptedTokens: { type: String, required: true, select: false },
  connectedBy: { type: String, trim: true, lowercase: true },
  connectedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.models.GoogleCalendarCredential
  || mongoose.model("GoogleCalendarCredential", credentialSchema);
