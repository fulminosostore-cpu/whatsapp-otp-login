
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone required" });

  // OTP generate பண்ணு
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Redis ல் 5 minutes store பண்ணு
  await redis.set(`otp:${phone}`, otp, { ex: 300 });

  // Tubelight login → Bearer token எடு
  const loginRes = await fetch(
    "https://portal.tubelightcommunications.com/api/authentication/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.TUBELIGHT_USERNAME,
        password: process.env.TUBELIGHT_PASSWORD,
      }),
    }
  );

  const loginData = await loginRes.json();
  const token = loginData.token;

  if (!token) {
    return res.status(500).json({ error: "Tubelight login failed" });
  }

  // WhatsApp OTP message அனுப்பு
  const msgRes = await fetch(
    "https://portal.tubelightcommunications.com/whatsapp/api/v1/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: [`91${phone}`],
        message: {
          template_name: "reg_no_3",
          language: "en",
          type: "template",
          body_params: [otp],
        },
      }),
    }
  );

  const msgData = await msgRes.json();

  return res.status(200).json({ success: true });
}
