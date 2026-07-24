// ============================================================
// SCRIPT DE CRÉATION DU PREMIER ADMIN
// ============================================================
// Utilisation :
//   1. Configure les variables ADMIN_* ci-dessous (ou dans .env)
//   2. Lance :  node scripts/createAdmin.js
//
// Le script :
//   - Se connecte à MongoDB
//   - Crée un compte admin si aucun n'existe encore avec cet email
//   - Sinon, met à jour le user existant pour lui donner le rôle "admin"
// ============================================================
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1']);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/User');

// 👉 Modifie ces valeurs avant de lancer le script
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrateur Ekomi';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@ekomi.cd';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '+243000000000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe2026!';

async function createAdmin() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI manquant dans .env');
    process.exit(1);
  }

  console.log('🔌 Connexion à MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connecté');

  const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });

  if (existing) {
    if (existing.role === 'admin') {
      console.log(`ℹ️  L'utilisateur ${ADMIN_EMAIL} est DÉJÀ admin. Rien à faire.`);
    } else {
      existing.role = 'admin';
      await existing.save();
      console.log(`✅ L'utilisateur ${ADMIN_EMAIL} a été promu ADMIN.`);
    }
  } else {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

    const admin = await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL.toLowerCase(),
      phone: ADMIN_PHONE,
      password: hashedPassword,
      role: 'admin',
      isActive: true,
      isVerified: true,
    });

    console.log('✅ Compte admin créé avec succès !');
    console.log('');
    console.log('   Email    :', admin.email);
    console.log('   Mot de passe :', ADMIN_PASSWORD);
    console.log('');
    console.log('⚠️  IMPORTANT : change ce mot de passe dès ta 1re connexion.');
  }

  await mongoose.connection.close();
  process.exit(0);
}

createAdmin().catch((err) => {
  console.error('❌ Erreur :', err.message);
  process.exit(1);
});
