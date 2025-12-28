-- Création de la base de données (si nécessaire)
CREATE DATABASE IF NOT EXISTS `mobilis_auth`;
USE `mobilis_auth`;

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` VARCHAR(50) DEFAULT 'user'
);

-- Table des réclamations
CREATE TABLE IF NOT EXISTS `reclamations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `priority` VARCHAR(50) DEFAULT 'Moyenne',
  `status` VARCHAR(50) DEFAULT 'ouvert',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `treated_at` TIMESTAMP NULL,
  `admin_comment` TEXT,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- Données initiales (optionnel)
-- L'admin par défaut devra être créé via l'inscription ou manuellement dans la DB
-- car les mots de passe sont hachés avec bcrypt.
