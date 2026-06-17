import nodemailer from 'nodemailer';
import webpush from 'web-push';
import { config } from './config.js';
import { query } from './db.js';
import { pushAlertToFirebase } from './firebaseSync.js';

export async function sendAlert(type, device) {
  const title = alertTitle(type);
  const message = `${device.hostname || device.ip}: ${title}`;
  const channels = ['webpush', 'telegram', 'email'];
  for (const channel of channels) {
    await query(
      `INSERT INTO alerts(device_id, type, channel, title, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [device.id, type, channel, title, message]
    );
  }
  
  await pushAlertToFirebase({
    device_id: device.id,
    type,
    channel: 'web',
    title,
    message,
    created_at: new Date().toISOString()
  });

  await Promise.allSettled([
    sendTelegram(message),
    sendEmail(title, message),
    sendTeams(title, message)
  ]);
}

function alertTitle(type) {
  return {
    'device.new': 'Nuevo equipo detectado',
    'device.offline': 'Equipo fuera de linea',
    'device.online': 'Equipo disponible nuevamente',
    'device.ip.changed': 'Cambio de IP detectado'
  }[type] || 'Alerta de monitoreo';
}

async function sendTelegram(message) {
  if (!config.telegram.token || !config.telegram.chatId) return;
  await fetch(`https://api.telegram.org/bot${config.telegram.token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: config.telegram.chatId, text: message })
  });
}

async function sendEmail(subject, text) {
  if (!config.smtp.host || !config.smtp.user) return;
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass }
  });
  await transporter.sendMail({ from: config.smtp.from, to: config.smtp.user, subject, text });
}

async function sendTeams(title, message) {
  if (!config.teamsWebhookUrl) return;
  await fetch(config.teamsWebhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, text: message })
  });
}

export function configureWebPush() {
  if (config.vapid.publicKey && config.vapid.privateKey) {
    webpush.setVapidDetails(`mailto:${config.smtp.from}`, config.vapid.publicKey, config.vapid.privateKey);
  }
}
