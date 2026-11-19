#!/bin/sh
# Exécuté une seule fois, à la création du volume : base de test dédiée (docs/DECISIONS.md D-013).
set -eu

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS jb_hotel_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON jb_hotel_test.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
SQL
