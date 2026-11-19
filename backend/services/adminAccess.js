function superAdminEmails() {
  return (process.env.SUPER_ADMIN_EMAILS || "adityacv@edutechex.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isSuperAdminEmail(email) {
  return superAdminEmails().includes(String(email || "").trim().toLowerCase());
}

module.exports = { isSuperAdminEmail };
