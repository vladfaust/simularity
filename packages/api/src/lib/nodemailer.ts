import { env } from "@/env.js";
import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  from: env.SMTP_FROM,
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  auth: env.SMTP_AUTH_USER
    ? {
        user: env.SMTP_AUTH_USER,
        pass: env.SMTP_AUTH_PASS,
      }
    : undefined,
  headers: env.SMTP_HEADERS,
});
