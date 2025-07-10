# Sistema de Facturas CR

Sistema inteligente para recepción automática de facturas electrónicas de Costa Rica.

## Características

- ✅ Recepción automática por email (IMAP)
- ✅ Parser de XML de facturas electrónicas CR
- ✅ Relacionado inteligente de productos
- ✅ Integración con Alegra API
- ✅ Interfaz simple para usuarios

## Tecnologías

- Node.js + Express
- PostgreSQL + Prisma
- HTML/CSS/JS vanilla
- Deploy en Render

## Instalación

```bash
npm install
cp .env.example .env
# Configurar variables en .env
npm run db:migrate
npm run dev