#!/bin/bash
# Configurar PostgreSQL para aceitar conexões remotas

# 1. Alterar listen_addresses
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" /etc/postgresql/14/main/postgresql.conf

# 2. Adicionar regra no pg_hba.conf para aceitar conexões de qualquer IP
echo "host    all             all             0.0.0.0/0               md5" | sudo tee -a /etc/postgresql/14/main/pg_hba.conf

# 3. Reiniciar PostgreSQL
sudo systemctl restart postgresql

# 4. Verificar status
sudo systemctl status postgresql --no-pager

echo ""
echo "✅ PostgreSQL configurado para aceitar conexões remotas!"
echo "📋 Connection string: postgresql://feeduser:FeedPass2024!@54.87.195.12:5432/unified_feed"

