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

  const { phone, otp } = req.body;

  const storedOtp = await redis.get(`otp:${phone}`);
  if (!storedOtp || storedOtp !== otp) {
    return res.status(400).json({ error: "Invalid or expired OTP" });
  }

  await redis.del(`otp:${phone}`);

  // Shopify-ல் customer இருக்காங்களா check பண்ணு
  const searchRes = await fetch(
    `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/customers/search.json?query=phone:+91${phone}`,
    {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
      },
    }
  );
  const { customers } = await searchRes.json();

  let email;
  if (customers.length === 0) {
    // புதுசா create பண்ணு
    const createRes = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/customers.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer: {
            phone: `+91${phone}`,
            email: `${phone}@whatsapp.placeholder.com`,
            verified_email: true,
          },
        }),
      }
    );
    const { customer } = await createRes.json();
    email = customer.email;
  } else {
    email = customers[0].email;
  }

  // Storefront API token எடு
  const tokenRes = await fetch(
    `https://${process.env.SHOPIFY_STORE}/api/2024-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": process.env.SHOPIFY_STOREFRONT_TOKEN,
      },
      body: JSON.stringify({
        query: `mutation {
          customerAccessTokenCreate(input: {
            email: "${email}",
            password: "${process.env.SHOPIFY_CUSTOMER_PASSWORD}"
          }) {
            customerAccessToken { accessToken expiresAt }
            customerUserErrors { message }
          }
        }`,
      }),
    }
  );

  const tokenData = await tokenRes.json();
  const accessToken =
    tokenData.data?.customerAccessTokenCreate?.customerAccessToken?.accessToken;

  return res.status(200).json({ success: true, accessToken, phone });
}
