import nodemailer from "nodemailer";

export const introEmail = async (toEmail, userName, unsubscribeToken) => {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailPass || !emailUser) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  const unsubscribeUrl = `${process.env.BACKEND_SERVER}/unsubscribe?token=${unsubscribeToken}`;
  const dashboardUrl = `${process.env.FRONTEND_SERVER}/dashboard`;

  try {
    await transporter.sendMail({
      from: `"প্রাইজ বন্ড চেকার" <${emailUser}>`,
      to: toEmail,
      subject: `স্বাগতম, ${userName}!`,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      text: `স্বাগতম ${userName}!\n\nআপনার একাউন্ট তৈরি হয়েছে।\nড্যাশবোর্ড: ${dashboardUrl}\n\nUnsubscribe: ${unsubscribeUrl}`,
      html: `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#f5f5f3; font-family: Arial, sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f3; padding:32px 0;">
  <tr><td align="center">
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px; width:100%; background:#ffffff; border-radius:8px; overflow:hidden;">
    <tr><td style="height:4px; background:#244B43;"></td></tr>
    <tr>
      <td style="padding:40px 40px 32px;">
        <p style="margin:0 0 28px; font-size:13px; color:#888; letter-spacing:1px; text-transform:uppercase;">প্রাইজ বন্ড চেকার</p>
        <h1 style="margin:0 0 16px; color:#1a1a1a; font-size:22px; font-weight:600;">স্বাগতম, ${userName}!</h1>
        <p style="margin:0 0 28px; color:#555; font-size:15px; line-height:1.8;">
          আপনার একাউন্ট তৈরি হয়েছে। এখন থেকে আপনার প্রাইজ বন্ড যোগ করুন — ড্র রেজাল্ট বের হলে বিজয়ী হলে আপনাকে ইমেইলে জানানো হবে।
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr>
            <td style="background:#244B43; border-radius:6px;">
              <a href="${dashboardUrl}" style="display:inline-block; color:#ffffff; text-decoration:none; padding:12px 28px; font-size:14px; font-weight:500;">
                ড্যাশবোর্ড খুলুন &rarr;
              </a>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="border-top:1px solid #f0f0f0; padding-top:24px;">
            <p style="margin:0; color:#999; font-size:13px; line-height:1.7;">
              কোনো সমস্যা হলে — <a href="mailto:${emailUser}" style="color:#244B43; text-decoration:none;">${emailUser}</a>
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background:#fafafa; border-top:1px solid #f0f0f0; padding:16px 40px;">
        <p style="margin:0; font-size:12px; color:#bbb;">
          আপনি সাইন আপ করেছেন বলে এই ইমেইল পাঠানো হয়েছে। &nbsp;
          <a href="${unsubscribeUrl}" style="color:#bbb; text-decoration:none;">Unsubscribe</a>
        </p>
      </td>
    </tr>
  </table>
  </td></tr>
</table>
</body>
</html>`,
    });

    return true;
  } catch (error) {
    // ✅ Bug 4 fix
    console.error(`❌ Intro email failed for ${toEmail}:`, error.message);
    return false;
  }
};
