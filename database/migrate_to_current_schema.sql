CREATE DATABASE IF NOT EXISTS `warungpos`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `warungpos`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) DEFAULT NULL,
  `nama` VARCHAR(100) DEFAULT NULL,
  `email` VARCHAR(100) DEFAULT NULL,
  `password` VARCHAR(255) DEFAULT NULL,
  `role` ENUM('manager', 'operator', 'kasir', 'konsumen') NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @users_add_nama = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'nama'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `nama` VARCHAR(100) NULL AFTER `name`'
  )
);
PREPARE stmt FROM @users_add_nama;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @users_add_phone = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'phone'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `phone` VARCHAR(30) NULL AFTER `email`'
  )
);
PREPARE stmt FROM @users_add_phone;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `users`
SET `nama` = COALESCE(`nama`, `name`)
WHERE `nama` IS NULL OR `nama` = '';

CREATE TABLE IF NOT EXISTS `products` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nama_produk` VARCHAR(150) NOT NULL,
  `harga` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `stock` INT NOT NULL DEFAULT 0,
  `kategori` VARCHAR(100) NOT NULL,
  `gambar` TEXT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transactions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `invoice` VARCHAR(50) NOT NULL,
  `user_id` INT NULL,
  `cashier_id` INT NULL,
  `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `grand_total` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('pending', 'approved', 'paid', 'rejected') NOT NULL DEFAULT 'pending',
  `payment_method` VARCHAR(50) DEFAULT NULL,
  `stock_deducted` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice` (`invoice`),
  KEY `fk_transactions_user` (`user_id`),
  KEY `fk_transactions_cashier` (`cashier_id`),
  CONSTRAINT `fk_transactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_transactions_cashier` FOREIGN KEY (`cashier_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `transactions`
  MODIFY COLUMN `user_id` INT NULL;

SET @transactions_add_stock_deducted = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'transactions'
        AND COLUMN_NAME = 'stock_deducted'
    ),
    'SELECT 1',
    'ALTER TABLE `transactions` ADD COLUMN `stock_deducted` TINYINT(1) NOT NULL DEFAULT 0 AFTER `payment_method`'
  )
);
PREPARE stmt FROM @transactions_add_stock_deducted;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `transaction_items` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `transaction_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `qty` INT NOT NULL DEFAULT 1,
  `price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  KEY `fk_transaction_items_transaction` (`transaction_id`),
  KEY `fk_transaction_items_product` (`product_id`),
  CONSTRAINT `fk_transaction_items_transaction` FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_transaction_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @transaction_items_add_price = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'transaction_items'
        AND COLUMN_NAME = 'price'
    ),
    'SELECT 1',
    'ALTER TABLE `transaction_items` ADD COLUMN `price` DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER `qty`'
  )
);
PREPARE stmt FROM @transaction_items_add_price;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @transaction_items_add_subtotal = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'transaction_items'
        AND COLUMN_NAME = 'subtotal'
    ),
    'SELECT 1',
    'ALTER TABLE `transaction_items` ADD COLUMN `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER `price`'
  )
);
PREPARE stmt FROM @transaction_items_add_subtotal;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
